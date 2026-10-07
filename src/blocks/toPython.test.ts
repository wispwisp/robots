import { readFileSync } from 'node:fs';
import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { kk, ru } from '../i18n';
import { registerBlocks } from './definitions';
import { applyBlocklyLocale } from './locale';
import { blocksToPython } from './toPython';
import { createHeadlessWorkspace } from './workspace';

beforeAll(() => { registerBlocks(); applyBlocklyLocale('ru'); });
afterEach(() => applyBlocklyLocale('ru'));

const readFixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// Builders for Blockly serialization JSON. A statement input takes an array: the blocks of its stack.
type B = Record<string, unknown>;
const chain = (stack: B[]): B => stack.reduceRight((next, blk) => ({ ...blk, next: { block: next } }));
function b(type: string, fields: B = {}, inputs: Record<string, B | B[]> = {}, extra: B = {}): B {
  const ins = Object.entries(inputs).filter(([, v]) => !Array.isArray(v) || v.length > 0)
    .map(([k, v]) => [k, { block: Array.isArray(v) ? chain(v) : v }]);
  return { type, fields, inputs: Object.fromEntries(ins), ...extra };
}
const num = (n: number) => b('math_number', { NUM: n });
const varField = (name: string) => ({ VAR: { id: `v:${name}`, name } });
const get = (name: string) => b('variables_get', varField(name));
const set = (name: string, value: B) => b('variables_set', varField(name), { VALUE: value });
const binop = (a: B, op: string, c: B) => b('py_binop', { OP: op }, { A: a, B: c });
const motors = (l: number, r: number, id?: string) => b('robot_motors', {}, { L: num(l), R: num(r) }, id ? { id } : {});
const range = (start: number, stop: number, step: number) =>
  b('py_for_range', varField('i'), { START: num(start), STOP: num(stop), STEP: num(step) });
const program = (main: B[], ...others: B[]) =>
  ({ blocks: { languageVersion: 0, blocks: [b('robot_start', {}, {}, main.length ? { next: { block: chain(main) } } : {}), ...others] } });

function gen(json: object) {
  const ws = createHeadlessWorkspace();
  Blockly.serialization.workspaces.load(json, ws);
  return blocksToPython(ws);
}
const HEADER = 'from robot import *\n\n';
const mainCode = (...main: B[]) => gen(program(main)).code.replace(HEADER, '');

const lineFollowerJson = program([
  b('controls_forever', {}, { DO: [
    b('controls_if', {}, {
      IF0: b('robot_line', { SLOT: 'front_left' }), DO0: [motors(0, 50, 'motorsLeftId')],
      IF1: b('robot_line', { SLOT: 'front_right' }), DO1: [motors(50, 0)],
      ELSE: [motors(50, 50)],
    }, { id: 'ifId', extraState: { elseIfCount: 1, hasElse: true } }),
  ] }),
]);
const looseOnlyJson = program([], motors(1, 1), num(5), b('robot_stop', {}, {}, { x: 300, y: 300 }));
const funcJson = program([b('procedures_callnoreturn', {}, {}, { extraState: { name: 'go', params: [] } })],
  b('procedures_defnoreturn', { NAME: 'go' }, { STACK: [set('speed', num(5)), b('robot_motors', {}, { L: get('speed'), R: get('turn') })] }));
const miscJson = program([set('speed', num(0)), b('var_change', { ...varField('speed'), OP: '+=' }, { DELTA: num(2) }),
  b('controls_repeat_ext', {}, { TIMES: num(3), DO: [b('robot_stop')] })]);
const rangesJson = program([range(0, 5, 1), range(2, 5, 1), range(0, 10, 2)]);
const precJson = program([
  set('x', binop(binop(get('a'), '+', get('b')), '*', get('c'))),
  set('y', binop(get('a'), '-', binop(get('b'), '-', get('c')))),
  set('z', binop(b('py_neg', {}, { VALUE: get('a') }), '**', num(2))),
]);
const listJson = program([set('x', b('py_list_get', {}, { LIST: get('xs'), INDEX: num(0) }))]);

test('line follower', () => expect(gen(lineFollowerJson).code).toBe(readFixture('line_follower.py')));
test('loose blocks are ignored and empty program is just the header', () => expect(gen(looseOnlyJson).code).toBe('from robot import *\n'));
test('global only for assigned variables', () => expect(gen(funcJson).code).toContain('def go():\n    global speed\n    speed = 5\n'));
test('var_change and repeat', () => { const c = gen(miscJson).code; expect(c).toContain('speed += 2\n'); expect(c).toContain('for _ in range(3):\n'); });
test('range forms', () => expect(gen(rangesJson).code).toContain('for i in range(5):\n    pass\nfor i in range(2, 5):\n    pass\nfor i in range(0, 10, 2):\n    pass\n'));
test('precedence', () => expect(gen(precJson).code).toContain('x = (a + b) * c\ny = a - (b - c)\nz = (-a) ** 2\n'));
test('list indices are zero-based', () => expect(gen(listJson).code).toContain('x = xs[0]\n'));
test('line map', () => { const g = gen(lineFollowerJson); expect(g.lineToBlock.get(5)).toBe('motorsLeftId'); });

test('line map: elif and else lines belong to the if block, header to nothing', () => {
  const g = gen(lineFollowerJson);
  expect(g.code.split('\n')[5]).toBe('    elif line("front_right"):');
  expect(g.lineToBlock.get(4)).toBe('ifId');
  expect(g.lineToBlock.get(6)).toBe('ifId');
  expect(g.lineToBlock.get(8)).toBe('ifId');
  expect(g.lineToBlock.has(1)).toBe(false);
});

// Every block in the block set and its one Python form (inside the main program).
const x = (value: B) => set('x', value);
const forms: [string, B[], string][] = [
  ['robot_motors', [motors(50, -50)], 'motors(50, -50)\n'],
  ['robot_stop', [b('robot_stop')], 'stop()\n'],
  ['robot_wait', [b('robot_wait', {}, { S: num(1.5) })], 'wait(1.5)\n'],
  ['robot_line', [x(b('robot_line', { SLOT: 'front_left' }))], 'x = line("front_left")\n'],
  ['robot_brightness', [x(b('robot_brightness', { SLOT: 'front_center' }))], 'x = brightness("front_center")\n'],
  ['robot_distance', [x(b('robot_distance', { SLOT: 'front_right' }))], 'x = distance("front_right")\n'],
  ['robot_color', [x(b('robot_color', { SLOT: 'left' }))], 'x = color("left")\n'],
  ['robot_color_value', [b('logic_compare', { OP: 'EQ' }, { A: b('robot_color', { SLOT: 'right' }), B: b('robot_color_value', { COLOR: 'green' }) })]
    .map(x), 'x = color("right") == "green"\n'],
  ['controls_if', [b('controls_if', {}, { IF0: get('a'), DO0: [b('robot_stop')] })], 'if a:\n    stop()\n'],
  ['controls_if else', [b('controls_if', {}, { IF0: get('a'), ELSE: [b('robot_stop')] }, { extraState: { hasElse: true } })],
    'if a:\n    pass\nelse:\n    stop()\n'],
  ...(['EQ ==', 'NEQ !=', 'LT <', 'LTE <=', 'GT >', 'GTE >='].map(s => s.split(' ')).map(([op, py]): [string, B[], string] =>
    [`logic_compare ${op}`, [x(b('logic_compare', { OP: op }, { A: get('a'), B: num(1) }))], `x = a ${py} 1\n`])),
  ['logic_operation and', [x(b('logic_operation', { OP: 'AND' }, { A: get('a'), B: get('c') }))], 'x = a and c\n'],
  ['logic_operation or', [x(b('logic_operation', { OP: 'OR' }, { A: get('a'), B: get('c') }))], 'x = a or c\n'],
  ['logic_negate', [x(b('logic_negate', {}, { BOOL: get('a') }))], 'x = not a\n'],
  ['logic_boolean', [x(b('logic_boolean', { BOOL: 'TRUE' })), x(b('logic_boolean', { BOOL: 'FALSE' }))], 'x = True\nx = False\n'],
  ['controls_forever', [b('controls_forever', {}, { DO: [b('robot_stop')] })], 'while True:\n    stop()\n'],
  ['controls_while', [b('controls_while', {}, { COND: b('logic_compare', { OP: 'LT' }, { A: get('a'), B: num(5) }) })],
    'while a < 5:\n    pass\n'],
  ['controls_repeat_ext', [b('controls_repeat_ext', {}, { TIMES: num(3) })], 'for _ in range(3):\n    pass\n'],
  ['controls_forEach', [b('controls_forEach', varField('item'), { LIST: get('xs'), DO: [b('text_print', {}, { TEXT: get('item') })] })],
    'for item in xs:\n    print(item)\n'],
  ['controls_flow_statements', [b('controls_forever', {}, { DO: [b('controls_flow_statements', { FLOW: 'CONTINUE' }),
    b('controls_flow_statements', { FLOW: 'BREAK' })] })], 'while True:\n    continue\n    break\n'],
  ['math_number', [x(num(3.5)), x(num(-2))], 'x = 3.5\nx = -2\n'],
  ...(['+', '-', '*', '/', '//', '%', '**'].map((op): [string, B[], string] =>
    [`py_binop ${op}`, [x(binop(get('a'), op, num(2)))], `x = a ${op} 2\n`])),
  ['py_neg', [x(b('py_neg', {}, { VALUE: get('a') }))], 'x = -a\n'],
  ['py_math_func', [x(b('py_math_func', { FUNC: 'abs' }, { VALUE: get('a') })), x(b('py_math_func', { FUNC: 'round' }, { VALUE: get('a') }))],
    'x = abs(a)\nx = round(a)\n'],
  ['text', [x(b('text', { TEXT: 'say "hi"\\\nok' }))], 'x = "say \\"hi\\"\\\\\\nok"\n'],
  ['text_print', [b('text_print', {}, { TEXT: b('text', { TEXT: 'hello' }) })], 'print("hello")\n'],
  ['variables_get/set', [x(get('a'))], 'x = a\n'],
  ['var_change', [b('var_change', { ...varField('a'), OP: '+=' }, { DELTA: num(1) }), b('var_change', { ...varField('a'), OP: '-=' }, { DELTA: get('c') })],
    'a += 1\na -= c\n'],
  ['lists_create_with', [x(b('lists_create_with', {}, { ADD0: num(1), ADD1: num(2) }, { extraState: { itemCount: 2 } })),
    x(b('lists_create_with', {}, {}, { extraState: { itemCount: 0 } }))], 'x = [1, 2]\nx = []\n'],
  ['py_list_get', [x(b('py_list_get', {}, { LIST: get('xs'), INDEX: num(-1) }))], 'x = xs[-1]\n'],
  ['py_list_set', [b('py_list_set', {}, { LIST: get('xs'), INDEX: num(1), VALUE: num(5) })], 'xs[1] = 5\n'],
  ['py_list_append', [b('py_list_append', {}, { LIST: get('xs'), VALUE: num(4) })], 'xs.append(4)\n'],
  ['py_len', [x(b('py_len', {}, { LIST: get('xs') }))], 'x = len(xs)\n'],
  ['python_code', [b('python_code', { CODE: 'd = {"a": 1}' })], 'd = {"a": 1}\n'],
  ['python_code re-indented', [b('controls_forever', {}, { DO: [b('python_code', { CODE: '  try:\n      x = 1\n\n  except:\n      pass\n' })] })],
    'while True:\n    try:\n        x = 1\n\n    except:\n        pass\n'],
  ['comment_note', [b('comment_note', { TEXT: 'turn left' })], '# turn left\n'],
];
test.each(forms)('%s', (_name, main, python) => expect(mainCode(...main)).toBe(python));

test('functions: def, return, calls, params are not global', () => {
  const twice = b('procedures_defreturn', { NAME: 'twice' }, {
    STACK: [b('controls_if', {}, { IF0: get('a'), DO0: [b('py_return', {}, { VALUE: num(0) })] }), set('a', num(1))],
    RETURN: binop(get('a'), '*', num(2)),
  }, { id: 'twiceId', extraState: { params: [{ name: 'a', id: 'v:a' }] } });
  const go = b('procedures_defnoreturn', { NAME: 'go' }, { STACK: [b('py_return')] }, { y: -100 });
  const main = [b('procedures_callnoreturn', {}, {}, { extraState: { name: 'go', params: [] } }),
    set('x', b('procedures_callreturn', {}, { ARG0: num(3) }, { extraState: { name: 'twice', params: ['a'] } }))];
  const g = gen(program(main, twice, go));
  expect(g.code).toBe('from robot import *\n\n'
    + 'def go():\n    return\n\n'
    + 'def twice(a):\n    if a:\n        return 0\n    a = 1\n    return a * 2\n\n'
    + 'go()\nx = twice(3)\n');
  expect([g.lineToBlock.get(6), g.lineToBlock.get(10)]).toEqual(['twiceId', 'twiceId']); // def line, final return
});

test('global lists assigned and loop variables, sorted', () => {
  const f = b('procedures_defnoreturn', { NAME: 'f' }, { STACK: [
    set('b', num(1)), range(0, 3, 1), b('controls_forEach', varField('item'), { LIST: get('xs') }),
    b('var_change', { ...varField('a'), OP: '-=' }, { DELTA: num(1) }), b('text_print', {}, { TEXT: get('zz') }),
  ] });
  expect(gen(program([], f)).code).toContain('def f():\n    global a, b, i, item\n');
});

test('empty and comment-only bodies get pass; empty function', () => {
  const f = b('procedures_defnoreturn', { NAME: 'f' });
  expect(gen(program([b('controls_forever', {}, { DO: [b('comment_note', { TEXT: 'later' })] })], f)).code)
    .toBe('from robot import *\n\ndef f():\n    pass\n\nwhile True:\n    # later\n    pass\n');
});

test('valid names are kept even when Blockly reserves them', () => {
  const f = b('procedures_defnoreturn', { NAME: 'max' }, { STACK: [set('sum', num(1))] });
  const main = [set('random', num(2)), set('len', num(3)), b('procedures_callnoreturn', {}, {}, { extraState: { name: 'max', params: [] } })];
  expect(gen(program(main, f)).code).toBe('from robot import *\n\ndef max():\n    global sum\n    sum = 1\n\nrandom = 2\nlen = 3\nmax()\n');
});

test('default Blockly names are Latin in both languages', () => {
  for (const lang of ['ru', 'kk'] as const) {
    applyBlocklyLocale(lang);
    expect([Blockly.Msg.VARIABLES_DEFAULT_NAME, Blockly.Msg.PROCEDURES_DEFNORETURN_PROCEDURE,
      Blockly.Msg.PROCEDURES_DEFRETURN_PROCEDURE, Blockly.Msg.UNNAMED_KEY]).toEqual(['item', 'do_something', 'do_something', 'unnamed']);
    const ws = createHeadlessWorkspace();
    ws.newBlock('variables_set');
    expect(ws.getVariableMap().getAllVariables().map(v => v.getName())).toEqual(['item']);
  }
});

test('Kazakh: Blockly and block texts, no tooltips; switching back restores Russian', () => {
  applyBlocklyLocale('kk');
  expect(Blockly.Msg.CONTROLS_IF_MSG_IF).toBe(kk.blocklyBuiltins.CONTROLS_IF_MSG_IF);
  expect(Blockly.Msg.ROBOT_STOP).toBe(kk.blocks.ROBOT_STOP);
  const ws = createHeadlessWorkspace();
  for (const type of ['controls_if', 'logic_compare', 'logic_operation', 'math_number', 'text', 'text_print', 'variables_get',
    'controls_repeat_ext', 'controls_forEach', 'procedures_defnoreturn', 'procedures_defreturn', 'lists_create_with', 'robot_motors']) {
    expect(Blockly.Tooltip.getTooltipOfObject(ws.newBlock(type)), type).toBe('');
  }
  applyBlocklyLocale('ru');
  expect(Blockly.Msg.CONTROLS_IF_MSG_IF).toBe(ru.blocklyBuiltins.CONTROLS_IF_MSG_IF);
  expect(Blockly.Msg.ROBOT_STOP).toBe(ru.blocks.ROBOT_STOP);
});

// On a rendered workspace Blockly disables break/continue that it doesn't see inside a loop block.
test('break and continue count as inside every loop block', async () => {
  const flowIn = (loop: string) => b(loop, ['py_for_range', 'controls_forEach'].includes(loop) ? varField('i') : {},
    { DO: [b('controls_flow_statements', { FLOW: 'BREAK' }), b('controls_flow_statements', { FLOW: 'CONTINUE' })] });
  const cases: [B, string][] = [
    ...['controls_forever', 'controls_while', 'py_for_range', 'controls_repeat_ext', 'controls_forEach']
      .map((loop): [B, string] => [flowIn(loop), '    break\n    continue\n']),
    [b('controls_flow_statements', { FLOW: 'BREAK' }), 'from robot import *\n'], // outside a loop: disabled
  ];
  for (const [main, expected] of cases) {
    const ws = createHeadlessWorkspace();
    Object.assign(ws, { isDragging: () => false }); // as on a WorkspaceSvg, which makes the check run
    Blockly.serialization.workspaces.load(program([main]), ws);
    await new Promise(resolve => setTimeout(resolve, 0)); // let Blockly fire its events
    expect(blocksToPython(ws).code, String(main.type)).toContain(expected);
  }
});

test('any value block fits any value input, as in Python', () => {
  expect(mainCode(b('controls_if', {}, { IF0: num(1) }), b('controls_forEach', varField('ch'), { LIST: b('text', { TEXT: 'ab' }) }),
    b('controls_repeat_ext', {}, { TIMES: b('logic_boolean', { BOOL: 'TRUE' }) })))
    .toBe('if 1:\n    pass\nfor ch in "ab":\n    pass\nfor _ in range(True):\n    pass\n');
});
