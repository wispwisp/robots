// Python → blocks (Blockly serialization JSON), using Skulpt's parser. A supported statement becomes its block;
// any other statement becomes a «Python-код» block holding its source text. Comments become note blocks.
// Each source line is mapped to the block it became.
import { SLOT_NAMES } from '../robot/robot';
import { toProgramError, type ProgramError } from '../runner/errors';
import { configureSkulpt, sk } from '../runner/sk';
import { scanComments, type Comment } from './comments';
import { COLOR_NAMES } from './definitions';
import { isValidName } from './names';

export type FromPythonResult =
  | { ok: true; blocks: object; lineToBlock: Map<number, string> }
  | { ok: false; error: ProgramError };

interface Block {
  type: string;
  id: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: Block }>;
  extraState?: object;
  next?: { block: Block };
  x?: number;
  y?: number;
}

type Node = any; // a node of Skulpt's syntax tree

// A statement's lines `start`…`end`; `cut` is the column where the next statement starts on line `end` (after `;`).
interface Span { start: number; end: number; col: number; cut?: number }

// Statements that go into a statement input; `end` is the body's last line. `inLoop` is set for a loop body (true)
// and a function body (false); other bodies are inside a loop when their statement is.
interface Body { input: string; nodes: Node[]; end: number; inLoop?: boolean }

// A supported statement's block, with its bodies still to convert.
interface Spec {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, Block>;
  extraState?: object;
  bodies?: Body[];
}

class Unsupported extends Error {}
const unsupported = (): never => { throw new Unsupported(); };

const BINARY_OPS: Record<string, string> = { Add: '+', Sub: '-', Mult: '*', Div: '/', FloorDiv: '//', Mod: '%', Pow: '**' };
const CHANGE_OPS: Record<string, string> = { Add: '+=', Sub: '-=' };
const COMPARE_OPS: Record<string, string> = { Eq: 'EQ', NotEq: 'NEQ', Lt: 'LT', LtE: 'LTE', Gt: 'GT', GtE: 'GTE' };
// Call statements: block type and the inputs that take the arguments.
const COMMANDS = new Map([['motors', ['robot_motors', 'L', 'R']], ['stop', ['robot_stop']], ['wait', ['robot_wait', 'S']],
  ['print', ['text_print', 'TEXT']]]);
const SENSORS = new Map([['line', 'robot_line'], ['brightness', 'robot_brightness'], ['distance', 'robot_distance'],
  ['color', 'robot_color']]);
const ROW_HEIGHT = 40; // per source line, to place functions one below another

// Skulpt's classes are minified, but node and operator prototypes keep their names in `_astname`.
const kind = (node: Node): string => node._astname;
const opName = (op: Node): string => op.prototype._astname;
const isCall = (node: Node, name: string) => kind(node) === 'Call' && kind(node.func) === 'Name' && node.func.id.v === name;
const indent = (line: string) => line.length - line.trimStart().length;
// A call's arguments, when it has no keyword arguments (Skulpt gives null for a call without arguments).
const positional = (call: Node): Node[] => call.keywords?.length ? unsupported() : call.args ?? [];
const paramNames = (def: Node): string[] => def.args.args.map((arg: Node) => arg.arg.v);
// Inputs ADD0, ADD1, … (or another prefix) holding the blocks.
const numbered = (prefix: string, blocks: Block[]) => Object.fromEntries(blocks.map((block, i) => [prefix + i, block]));

// A literal that JavaScript holds exactly (no big integers, no complex numbers, no inf).
function numberValue(node: Node): number {
  const value = node.n.v;
  return typeof value === 'number' && Number.isFinite(value) ? value : unsupported();
}

// Whether a function returns a value somewhere (functions and classes defined inside it don't count).
function returnsValue(nodes: Node[]): boolean {
  return nodes.some(node => {
    if (kind(node) === 'Return') return Boolean(node.value);
    if (kind(node) === 'FunctionDef' || kind(node) === 'ClassDef') return false;
    const handlers = (node.handlers ?? []).map((handler: Node) => handler.body);
    return [node.body, node.orelse, node.finalbody, ...handlers].some(body => Array.isArray(body) && returnsValue(body));
  });
}

function chain(blocks: Block[]): Block | undefined {
  blocks.forEach((block, i) => { if (i + 1 < blocks.length) block.next = { block: blocks[i + 1] }; });
  return blocks[0];
}

class Converter {
  readonly lineToBlock = new Map<number, string>();
  private readonly lines: string[];
  private readonly comments: Comment[];
  private readonly commentLines: Set<number>; // lines holding only a comment
  private nextComment = 0;
  private inLoop = false; // break and continue are allowed
  private count = 0;
  private readonly procedures = new Map<string, Node>(); // the `def`s that become function blocks
  private finalReturn: Node = null; // the `return v` that ends the function being converted
  private returned?: Block; // its value, for the RETURN input

  constructor(source: string) {
    this.lines = source.split('\n');
    this.comments = scanComments(source);
    this.commentLines = new Set(this.comments.filter(c => !c.trailing).map(c => c.line));
  }

  // Function definitions become separate blocks; all other statements go under «when started».
  convert(nodes: Node[]): object {
    for (const node of nodes) {
      if (this.isProcedure(node) && !this.procedures.has(node.name.v)) this.procedures.set(node.name.v, node);
    }
    const start = this.block('robot_start');
    const functions: Block[] = [];
    const main: Block[] = [];
    let y = 0;
    nodes.forEach((node, i) => {
      const span = this.span(node, nodes[i + 1], this.lines.length);
      if (kind(node) === 'FunctionDef' && this.procedures.get(node.name.v) === node) {
        // Comments above a function are not flushed here: they go to the start of its body.
        functions.push({ ...this.procedure(node, span), x: 0, y });
        y += (span.end - span.start + 2) * ROW_HEIGHT;
      } else {
        this.statement(node, span, main);
      }
    });
    this.flush(this.lines.length, main); // comments after the last statement
    const first = chain(main);
    if (first) start.next = { block: first };
    return { blocks: { languageVersion: 0, blocks: [...functions, { ...start, x: 0, y }] } };
  }

  // A top-level `def` that becomes a function block: plain parameters, no decorators, no annotations.
  private isProcedure(node: Node): boolean {
    if (kind(node) !== 'FunctionDef') return false;
    const { args } = node;
    const params = paramNames(node);
    return isValidName(node.name.v) && !node.decorator_list.length && !node.returns
      && params.every(isValidName) && new Set(params).size === params.length // Python rejects a repeated name
      && !args.args.some((arg: Node) => arg.annotation) && !args.defaults.length
      && !args.vararg && !args.kwonlyargs.length && !args.kwarg;
  }

  // A function that returns a value somewhere is a procedures_defreturn. If it ends with `return v`,
  // v goes into the RETURN input (see spec()); any other return is a return block.
  private procedure(node: Node, span: Span): Block {
    const last = node.body[node.body.length - 1];
    this.finalReturn = kind(last) === 'Return' && last.value ? last : null;
    this.returned = undefined;
    const block = this.build({
      type: returnsValue(node.body) ? 'procedures_defreturn' : 'procedures_defnoreturn',
      fields: { NAME: node.name.v },
      extraState: { params: paramNames(node).map(name => ({ name, id: 'v:' + name })) },
      bodies: [{ input: 'STACK', nodes: node.body, end: span.end, inLoop: false }],
    }, span);
    if (this.returned) (block.inputs ??= {}).RETURN = { block: this.returned };
    return block;
  }

  // One statement into `out`: its block, or a Python-code block with its text when a part of it is unsupported.
  private statement(node: Node, span: Span, out: Block[]): void {
    this.flush(span.start - 1, out);
    const count = this.count;
    let spec: Spec | null;
    try {
      spec = this.spec(node, span);
    } catch (e) {
      if (!(e instanceof Unsupported)) throw e;
      this.count = count;
      this.takeComments(span.cut === undefined ? span.end : span.end - 1); // they stay in the text
      const block = this.block('python_code', { CODE: this.text(span) });
      this.mapLines(span, block.id);
      out.push(block);
      return;
    }
    this.flush(span.start, out); // a comment at the end of the statement's first line goes before it
    if (spec) out.push(this.build(spec, span));
  }

  private build(spec: Spec, span: Span): Block {
    const block = this.block(spec.type, spec.fields, spec.inputs, spec.extraState);
    this.mapLines(span, block.id); // inner statements override their lines
    for (const body of spec.bodies ?? []) {
      const first = this.body(body);
      if (first) (block.inputs ??= {})[body.input] = { block: first };
    }
    return block;
  }

  private body({ nodes, end, inLoop = this.inLoop }: Body): Block | undefined {
    const outer = this.inLoop;
    this.inLoop = inLoop;
    const out: Block[] = [];
    nodes.forEach((node, i) => this.statement(node, this.span(node, nodes[i + 1], end), out));
    this.flush(end, out); // comments at the end of the body stay in it
    this.inLoop = outer;
    return chain(out);
  }

  // The block of a supported statement, or null for a statement without one. Throws Unsupported otherwise.
  // Expressions are converted here; bodies only later, so an unsupported part leaves no trace.
  private spec(node: Node, span: Span): Spec | null {
    switch (kind(node)) {
      case 'Pass':
      case 'Global': // the generator writes a function's `global` line itself
        return null;
      case 'ImportFrom':
        return node.module?.v === 'robot' && !node.level && node.names.length === 1 && node.names[0].name.v === '*'
          ? null : unsupported();
      case 'Assign':
        return this.assign(node);
      case 'AugAssign': {
        const op = CHANGE_OPS[opName(node.op)];
        if (!op || kind(node.target) !== 'Name') return unsupported();
        const fields = { ...this.variable(node.target), OP: op };
        return { type: 'var_change', fields, inputs: { DELTA: this.expr(node.value) } };
      }
      case 'If':
        return this.ifSpec(node, span);
      case 'While': {
        if (node.orelse.length) return unsupported();
        const bodies = [{ input: 'DO', nodes: node.body, end: span.end, inLoop: true }];
        const forever = kind(node.test) === 'NameConstant' && node.test.value === sk().builtin.bool.true$;
        if (forever) return { type: 'controls_forever', bodies };
        return { type: 'controls_while', inputs: { COND: this.expr(node.test) }, bodies };
      }
      case 'For':
        return this.forSpec(node, span);
      case 'Break':
      case 'Continue': // outside a loop: Python's SyntaxError, and Blockly would disable the block
        if (!this.inLoop) return unsupported();
        return { type: 'controls_flow_statements', fields: { FLOW: kind(node).toUpperCase() } };
      case 'Return':
        if (node === this.finalReturn) { // no block: its value goes into the function block
          this.returned = this.expr(node.value);
          return null;
        }
        return { type: 'py_return', inputs: node.value ? { VALUE: this.expr(node.value) } : {} };
      case 'Expr':
        return this.callSpec(node.value);
      default:
        return unsupported();
    }
  }

  private assign(node: Node): Spec {
    const [target] = node.targets;
    if (node.targets.length !== 1) return unsupported();
    if (kind(target) === 'Name') {
      return { type: 'variables_set', fields: this.variable(target), inputs: { VALUE: this.expr(node.value) } };
    }
    if (kind(target) === 'Subscript' && kind(target.slice) === 'Index') {
      return { type: 'py_list_set',
        inputs: { LIST: this.expr(target.value), INDEX: this.expr(target.slice.value), VALUE: this.expr(node.value) } };
    }
    return unsupported();
  }

  // An `if` with its `elif`s and `else`; an `else` holding only an `if` becomes `elif`.
  private ifSpec(node: Node, span: Span): Spec {
    const inputs: Record<string, Block> = {};
    const bodies: Body[] = [];
    let branch = node;
    for (let n = 0; ; n++) {
      inputs['IF' + n] = this.expr(branch.test);
      const orelse: Node[] = branch.orelse;
      // The body ends before its `elif`/`else` line, without comments at the `if`'s indentation.
      const end = orelse.length ? this.trimEnd(branch.lineno, this.elseLine(orelse[0]) - 1, node.col_offset) : span.end;
      bodies.push({ input: 'DO' + n, nodes: branch.body, end });
      if (orelse.length === 1 && kind(orelse[0]) === 'If') {
        branch = orelse[0];
        continue;
      }
      if (orelse.length) bodies.push({ input: 'ELSE', nodes: orelse, end: span.end });
      return { type: 'controls_if', inputs, bodies, extraState: { elseIfCount: n, hasElse: orelse.length > 0 } };
    }
  }

  private forSpec(node: Node, span: Span): Spec {
    if (node.orelse.length || kind(node.target) !== 'Name') return unsupported();
    const bodies = [{ input: 'DO', nodes: node.body, end: span.end, inLoop: true }];
    const fields = this.variable(node.target);
    if (!isCall(node.iter, 'range')) {
      return { type: 'controls_forEach', fields, inputs: { LIST: this.expr(node.iter) }, bodies };
    }
    const args = this.args(node.iter, 1, 3);
    if (node.target.id.v === '_' && args.length === 1) {
      return { type: 'controls_repeat_ext', inputs: { TIMES: args[0] }, bodies };
    }
    const [start, stop, step] = args.length === 1 ? [this.number(0), args[0]] : args;
    return { type: 'py_for_range', fields, inputs: { START: start, STOP: stop, STEP: step ?? this.number(1) }, bodies };
  }

  // A robot command, print(x), x.append(v), or a call of one of the program's functions without a returned value.
  private callSpec(node: Node): Spec {
    if (kind(node) !== 'Call') return unsupported();
    if (kind(node.func) === 'Attribute' && node.func.attr.v === 'append') {
      return { type: 'py_list_append', inputs: { LIST: this.expr(node.func.value), VALUE: this.args(node, 1)[0] } };
    }
    if (kind(node.func) !== 'Name') return unsupported();
    const name: string = node.func.id.v;
    const command = COMMANDS.get(name);
    if (command) {
      const [type, ...inputNames] = command;
      const args = this.args(node, inputNames.length);
      return { type, inputs: Object.fromEntries(inputNames.map((input, i) => [input, args[i]])) };
    }
    const def = this.procedures.get(name);
    if (!def || returnsValue(def.body)) return unsupported();
    return { type: 'procedures_callnoreturn', ...this.procedureCall(node, def) };
  }

  // The inputs and extraState of a call of one of the program's functions: one argument for each parameter.
  private procedureCall(node: Node, def: Node) {
    const params = paramNames(def);
    return { inputs: numbered('ARG', this.args(node, params.length)), extraState: { name: def.name.v, params } };
  }

  private expr(node: Node): Block {
    switch (kind(node)) {
      case 'Num':
        return this.number(numberValue(node));
      case 'UnaryOp': {
        const op = opName(node.op);
        if (op === 'USub' && kind(node.operand) === 'Num') return this.number(-numberValue(node.operand));
        if (op === 'USub') return this.block('py_neg', {}, { VALUE: this.expr(node.operand) });
        if (op === 'Not') return this.block('logic_negate', {}, { BOOL: this.expr(node.operand) });
        return unsupported();
      }
      case 'NameConstant': {
        const { true$, false$ } = sk().builtin.bool;
        if (node.value !== true$ && node.value !== false$) return unsupported(); // None
        return this.block('logic_boolean', { BOOL: node.value === true$ ? 'TRUE' : 'FALSE' });
      }
      case 'Str':
        return this.block('text', { TEXT: node.s.v });
      case 'Name':
        return this.block('variables_get', this.variable(node));
      case 'BinOp': {
        const op = BINARY_OPS[opName(node.op)] ?? unsupported();
        return this.block('py_binop', { OP: op }, { A: this.expr(node.left), B: this.expr(node.right) });
      }
      case 'BoolOp': { // a and b and c → (a and b) and c
        const op = opName(node.op) === 'And' ? 'AND' : 'OR';
        return node.values.map((value: Node) => this.expr(value))
          .reduce((a: Block, b: Block) => this.block('logic_operation', { OP: op }, { A: a, B: b }));
      }
      case 'Compare':
        return this.compare(node);
      case 'Call':
        return this.callExpr(node);
      case 'List': {
        const items = node.elts.map((item: Node) => this.expr(item));
        return this.block('lists_create_with', {}, numbered('ADD', items), { itemCount: items.length });
      }
      case 'Subscript': // x[i]; a slice stays Python code
        if (kind(node.slice) !== 'Index') return unsupported();
        return this.block('py_list_get', {}, { LIST: this.expr(node.value), INDEX: this.expr(node.slice.value) });
      default:
        return unsupported();
    }
  }

  // A single comparison. A colour name compared with color(…) becomes a colour block.
  private compare(node: Node): Block {
    const op = COMPARE_OPS[opName(node.ops[0])];
    if (node.ops.length !== 1 || !op) return unsupported(); // chained, `in`, `is`
    const operand = (side: Node, other: Node) =>
      (op === 'EQ' || op === 'NEQ') && kind(side) === 'Str' && COLOR_NAMES.includes(side.s.v) && isCall(other, 'color')
        ? this.block('robot_color_value', { COLOR: side.s.v })
        : this.expr(side);
    const [left, right] = [node.left, node.comparators[0]];
    return this.block('logic_compare', { OP: op }, { A: operand(left, right), B: operand(right, left) });
  }

  // abs(x), round(x), len(x), sensor calls with a slot name, and calls of the program's functions that return a value.
  private callExpr(node: Node): Block {
    const name: string = kind(node.func) === 'Name' ? node.func.id.v : '';
    if (name === 'abs' || name === 'round') {
      return this.block('py_math_func', { FUNC: name }, { VALUE: this.args(node, 1)[0] });
    }
    if (name === 'len') return this.block('py_len', {}, { LIST: this.args(node, 1)[0] });
    const sensor = SENSORS.get(name);
    const args = positional(node);
    if (sensor && args.length === 1 && kind(args[0]) === 'Str' && SLOT_NAMES.includes(args[0].s.v)) {
      return this.block(sensor, { SLOT: args[0].s.v });
    }
    const def = this.procedures.get(name);
    if (!def || !returnsValue(def.body)) return unsupported();
    const { inputs, extraState } = this.procedureCall(node, def);
    return this.block('procedures_callreturn', {}, inputs, extraState);
  }

  // A call's positional arguments as blocks: `min`…`max` of them and no keyword arguments.
  private args(call: Node, min: number, max = min): Block[] {
    const args = positional(call);
    if (args.length < min || args.length > max) return unsupported();
    return args.map(arg => this.expr(arg));
  }

  // The VAR field for a Name node.
  private variable(node: Node) {
    const name: string = node.id.v;
    return isValidName(name) ? { VAR: { id: 'v:' + name, name } } : unsupported();
  }

  private number(value: number): Block {
    return this.block('math_number', { NUM: value });
  }

  private block(type: string, fields = {}, inputs: Record<string, Block> = {}, extraState?: object): Block {
    const block: Block = { type, id: `b${++this.count}` };
    if (Object.keys(fields).length) block.fields = fields;
    if (Object.keys(inputs).length) {
      block.inputs = Object.fromEntries(Object.entries(inputs).map(([name, child]) => [name, { block: child }]));
    }
    if (extraState) block.extraState = extraState;
    return block;
  }

  // Comments up to line `last` that are not taken yet become note blocks.
  private flush(last: number, out: Block[]): void {
    for (const comment of this.takeComments(last)) {
      const note = this.block('comment_note', { TEXT: comment.text });
      if (!comment.trailing) this.lineToBlock.set(comment.line, note.id);
      out.push(note);
    }
  }

  private takeComments(last: number): Comment[] {
    const first = this.nextComment;
    while (this.nextComment < this.comments.length && this.comments[this.nextComment].line <= last) this.nextComment++;
    return this.comments.slice(first, this.nextComment);
  }

  // From the statement's first line to the line before the next statement (or the body's end), without trailing
  // blank lines and comments indented at or left of it. A statement followed by `; next` is cut there.
  private span(node: Node, next: Node | undefined, end: number): Span {
    const { lineno: start, col_offset: col } = node;
    if (next && !this.startsLine(next)) return { start, end: next.lineno, col, cut: next.col_offset };
    return { start, end: this.trimEnd(start, next ? next.lineno - 1 : end, col), col };
  }

  private trimEnd(start: number, end: number, col: number): number {
    while (end > start && (this.isBlank(end) || this.commentLines.has(end) && indent(this.line(end)) <= col)) end--;
    return end;
  }

  // The line of the `elif …:` or `else:` before `node`, the first statement of an else part.
  private elseLine(node: Node): number {
    if (!this.startsLine(node)) return node.lineno; // `elif x:` (the node is its condition) or `else: stmt`
    let line = node.lineno - 1;
    while (line > 1 && (this.isBlank(line) || this.commentLines.has(line))) line--;
    return line;
  }

  // The statement's source text, dedented by its column.
  private text({ start, end, col, cut }: Span): string {
    const lines = this.lines.slice(start - 1, end);
    if (cut !== undefined) lines[lines.length - 1] = lines[lines.length - 1].slice(0, cut).replace(/[\s;]+$/, '');
    return lines.map((line, i) => line.slice(i === 0 ? col : Math.min(col, indent(line)))).join('\n');
  }

  private mapLines({ start, end }: Span, id: string): void {
    for (let line = start; line <= end; line++) this.lineToBlock.set(line, id);
  }

  private startsLine(node: Node): boolean {
    return this.line(node.lineno).slice(0, node.col_offset).trim() === '';
  }

  private isBlank(line: number): boolean {
    return this.line(line).trim() === '';
  }

  private line(line: number): string {
    return this.lines[line - 1] ?? '';
  }
}

export function pythonToBlocks(source: string): FromPythonResult {
  const text = source.replace(/\r\n/g, '\n');
  configureSkulpt({ output: () => {} }); // Skulpt parses Python 3 only once configured; a run configures it again
  let module: Node;
  try {
    const parsed = sk().parse('<stdin>.py', text);
    module = sk().astFromParse(parsed.cst, '<stdin>.py', parsed.flags);
  } catch (e) {
    return { ok: false, error: toProgramError(e, text, null) };
  }
  const converter = new Converter(text);
  const blocks = converter.convert(module.body);
  return { ok: true, blocks, lineToBlock: converter.lineToBlock };
}
