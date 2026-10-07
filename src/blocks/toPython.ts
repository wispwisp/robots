// Blocks → Python. Only the «when started» stack and function definitions produce code; loose blocks don't.
// Each Python line is mapped to the block it came from.
import type * as Blockly from 'blockly/core';
import { Order, PythonGenerator, pythonGenerator } from 'blockly/python';

export interface GeneratedPython { code: string; lineToBlock: Map<number, string> }

type Generator = (block: Blockly.Block, g: PythonGenerator) => string | [string, Order];

const generator = new PythonGenerator();
generator.INDENT = '    ';
let workspace: Blockly.Workspace | null = null;
// Names are already valid Python names, so they are used as they are
// (Blockly would turn `sum` into `sum2` because `sum` is a Python built-in).
generator.getVariableName = (id: string) => workspace?.getVariableMap().getVariableById(id)?.getName() ?? id;
generator.getProcedureName = (name: string) => name;

const MARKER = /^\s*#@@'(.*)'$/;

// The line-map marker for blocks that Blockly doesn't mark itself (`suppressPrefixSuffix`), and for the
// elif/else/return lines that should point at their own block rather than at the statement above them.
const marker = (block: Blockly.Block, g: PythonGenerator) => g.STATEMENT_PREFIX ? g.injectId(g.STATEMENT_PREFIX, block) : '';
const value = (block: Blockly.Block, g: PythonGenerator, name: string, order = Order.NONE, empty = '0') =>
  g.valueToCode(block, name, order) || empty;
const varName = (block: Blockly.Block, g: PythonGenerator) => g.getVariableName(block.getFieldValue('VAR'));
// The list before [i] or .append(…)
const list = (block: Blockly.Block, g: PythonGenerator) => value(block, g, 'LIST', Order.MEMBER, '[]');

// Python needs a statement in every body; comments don't count.
function withPass(code: string, g: PythonGenerator): string {
  const hasStatement = code.split('\n').some(line => line.trim() !== '' && !line.trim().startsWith('#'));
  return hasStatement ? code : code + g.INDENT + 'pass\n';
}
const body = (block: Blockly.Block, g: PythonGenerator, name: string) => withPass(g.statementToCode(block, name), g);

const quote = (text: string) =>
  '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';

function dedent(text: string): string {
  const lines = text.replace(/^\s*\n|\s+$/g, '').split('\n');
  const indents = lines.filter(line => line.trim() !== '').map(line => line.length - line.trimStart().length);
  const cut = Math.min(...indents);
  return lines.map(line => line.slice(cut)).join('\n');
}

const sensor = (fn: string): Generator => (block) => [`${fn}("${block.getFieldValue('SLOT')}")`, Order.FUNCTION_CALL];

// Variables a function assigns; they are declared `global` so that they are the program's variables.
export const ASSIGNING = ['variables_set', 'var_change', 'py_for_range', 'controls_forEach'];

function procedureDef(block: Blockly.Block, g: PythonGenerator): string {
  const params = block.getVarModels().map(v => v.getName());
  const assigning = block.getDescendants(false).filter(d => ASSIGNING.includes(d.type) && d.isEnabled());
  const assigned = new Set(assigning.map(d => varName(d, g)));
  const globals = [...assigned].filter(name => !params.includes(name)).sort();
  let code = globals.length ? `${g.INDENT}global ${globals.join(', ')}\n` : '';
  if (block.getInput('STACK')) code += g.statementToCode(block, 'STACK');
  const result = block.getInput('RETURN') ? g.valueToCode(block, 'RETURN', Order.NONE) : '';
  if (result) code += g.prefixLines(marker(block, g), g.INDENT) + `${g.INDENT}return ${result}\n`;
  return `def ${block.getFieldValue('NAME')}(${params.join(', ')}):\n` + withPass(code, g);
}

// Minimal parentheses: valueToCode wraps an operand whose order is not lower than the one asked for.
// Left-associative operators take an equal-order left operand without them (a - b - c); `**` is
// right-associative and takes unary minus on its right (a ** b ** c, 2 ** -a).
function binop(block: Blockly.Block, g: PythonGenerator): [string, Order] {
  const op = block.getFieldValue('OP');
  if (op === '**') {
    const [base, exponent] = [value(block, g, 'A', Order.EXPONENTIATION), value(block, g, 'B', Order.MULTIPLICATIVE)];
    return [`${base} ** ${exponent}`, Order.EXPONENTIATION];
  }
  const order = op === '+' || op === '-' ? Order.ADDITIVE : Order.MULTIPLICATIVE;
  return [`${value(block, g, 'A', order + 1)} ${op} ${value(block, g, 'B', order)}`, order];
}

const GENERATORS: Record<string, Generator> = {
  robot_start: () => '',
  robot_motors: (block, g) => `motors(${value(block, g, 'L')}, ${value(block, g, 'R')})\n`,
  robot_stop: () => 'stop()\n',
  robot_wait: (block, g) => `wait(${value(block, g, 'S')})\n`,
  robot_line: sensor('line'),
  robot_brightness: sensor('brightness'),
  robot_distance: sensor('distance'),
  robot_color: sensor('color'),
  robot_color_value: (block) => [`"${block.getFieldValue('COLOR')}"`, Order.ATOMIC],

  controls_if: (block, g) => {
    let code = '';
    for (let n = 0; block.getInput('IF' + n); n++) {
      const condition = value(block, g, 'IF' + n, Order.NONE, 'False');
      code += `${marker(block, g)}${n === 0 ? 'if' : 'elif'} ${condition}:\n${body(block, g, 'DO' + n)}`;
    }
    if (block.getInput('ELSE')) code += `${marker(block, g)}else:\n${body(block, g, 'ELSE')}`;
    return code;
  },
  controls_forever: (block, g) => `while True:\n${body(block, g, 'DO')}`,
  controls_while: (block, g) => `while ${value(block, g, 'COND', Order.NONE, 'False')}:\n${body(block, g, 'DO')}`,
  controls_repeat_ext: (block, g) => `for _ in range(${value(block, g, 'TIMES')}):\n${body(block, g, 'DO')}`,
  py_for_range: (block, g) => {
    const start = value(block, g, 'START');
    const stop = value(block, g, 'STOP');
    const step = value(block, g, 'STEP', Order.NONE, '1');
    const args = step !== '1' ? [start, stop, step] : start !== '0' ? [start, stop] : [stop];
    return `for ${varName(block, g)} in range(${args.join(', ')}):\n${body(block, g, 'DO')}`;
  },
  controls_forEach: (block, g) =>
    `for ${varName(block, g)} in ${value(block, g, 'LIST', Order.NONE, '[]')}:\n${body(block, g, 'DO')}`,
  controls_flow_statements: (block, g) =>
    marker(block, g) + (block.getFieldValue('FLOW') === 'BREAK' ? 'break\n' : 'continue\n'),

  py_binop: binop,
  py_neg: (block, g) => [`-${value(block, g, 'VALUE', Order.UNARY_SIGN)}`, Order.UNARY_SIGN],
  py_math_func: (block, g) => [`${block.getFieldValue('FUNC')}(${value(block, g, 'VALUE')})`, Order.FUNCTION_CALL],
  text: (block) => [quote(block.getFieldValue('TEXT')), Order.ATOMIC],
  text_print: (block, g) => `print(${value(block, g, 'TEXT', Order.NONE, '""')})\n`,
  var_change: (block, g) => `${varName(block, g)} ${block.getFieldValue('OP')} ${value(block, g, 'DELTA')}\n`,

  procedures_defnoreturn: procedureDef,
  procedures_defreturn: procedureDef,
  py_return: (block, g) => {
    const result = g.valueToCode(block, 'VALUE', Order.NONE);
    return result ? `return ${result}\n` : 'return\n';
  },

  py_list_get: (block, g) => [`${list(block, g)}[${value(block, g, 'INDEX')}]`, Order.MEMBER],
  py_list_set: (block, g) => `${list(block, g)}[${value(block, g, 'INDEX')}] = ${value(block, g, 'VALUE')}\n`,
  py_list_append: (block, g) => `${list(block, g)}.append(${value(block, g, 'VALUE')})\n`,
  py_len: (block, g) => [`len(${value(block, g, 'LIST', Order.NONE, '[]')})`, Order.FUNCTION_CALL],

  python_code: (block) => {
    const code = dedent(block.getFieldValue('CODE'));
    return code ? code + '\n' : '';
  },
  comment_note: (block) => `# ${block.getFieldValue('TEXT')}\n`,
};

// Blockly's generators that already give the one Python form we want.
const BLOCKLY_GENERATED = ['logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'math_number',
  'variables_get', 'variables_set', 'lists_create_with', 'procedures_callnoreturn', 'procedures_callreturn'];
for (const type of BLOCKLY_GENERATED) generator.forBlock[type] = pythonGenerator.forBlock[type];
Object.assign(generator.forBlock, GENERATORS);

const HEADER = 'from robot import *\n';
const hasCode = (text: string) => text.split('\n').some(line => line.trim() !== '' && !MARKER.test(line));

// Each statement is generated after a marker line `#@@'<block id>'`; the markers are then removed,
// and every line belongs to the nearest marker above it.
export function blocksToPython(ws: Blockly.Workspace): GeneratedPython {
  workspace = ws;
  generator.init(ws);
  generator.STATEMENT_PREFIX = '#@@%1\n';
  const top = ws.getTopBlocks(true); // ordered top to bottom
  const functions = top.filter(block => block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn');
  const start = top.find(block => block.type === 'robot_start');
  const sections = [...functions, ...(start ? [start] : [])]
    .map(block => generator.blockToCode(block) as string)
    .filter(hasCode);
  const raw = sections.length ? HEADER + '\n' + sections.join('\n') : HEADER;

  const lines: string[] = [];
  const lineToBlock = new Map<number, string>();
  let blockId: string | undefined;
  for (const line of raw.slice(0, -1).split('\n')) {
    const match = MARKER.exec(line);
    if (match) {
      blockId = match[1];
      continue;
    }
    lines.push(line.trimEnd());
    if (blockId !== undefined) lineToBlock.set(lines.length, blockId);
  }
  return { code: lines.join('\n') + '\n', lineToBlock };
}
