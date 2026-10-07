import { readFileSync } from 'node:fs';
import * as Blockly from 'blockly/core';
import { beforeAll, expect, test } from 'vitest';
import { readSolution } from '../../tests/solutions/reference';
import { scanComments } from './comments';
import { registerBlocks } from './definitions';
import { pythonToBlocks } from './fromPython';
import { applyBlocklyLocale } from './locale';
import { blocksToPython } from './toPython';
import { createHeadlessWorkspace } from './workspace';

beforeAll(() => { registerBlocks(); applyBlocklyLocale('ru'); });

const readFixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const HEADER = 'from robot import *\n\n';

function convert(src: string) {
  const r = pythonToBlocks(src);
  if (!r.ok) throw new Error(`not converted: ${r.error.kind} ${r.error.message}`);
  return r;
}
function load(blocks: object) {
  const ws = createHeadlessWorkspace();
  Blockly.serialization.workspaces.load(blocks, ws);
  return ws;
}
const roundTrip = (src: string) => blocksToPython(load(convert(src).blocks)).code;
const json = (src: string) => JSON.stringify(convert(src).blocks);

// The serialized blocks as a flat list (every block, nested ones included).
type Json = { type: string; id: string; fields?: Record<string, unknown>; [key: string]: unknown };
function allBlocks(value: unknown, found: Json[] = []): Json[] {
  if (value && typeof value === 'object') {
    if (typeof (value as Json).type === 'string') found.push(value as Json);
    for (const child of Object.values(value)) allBlocks(child, found);
  }
  return found;
}
const types = (src: string) => allBlocks(convert(src).blocks).map(block => block.type);
// The blocks of the main program, in order.
function mainStack(src: string): Json[] {
  const stack: Json[] = [];
  const start = allBlocks(convert(src).blocks).find(block => block.type === 'robot_start') as any;
  for (let next = start?.next?.block; next; next = next.next?.block) stack.push(next);
  return stack;
}

for (const f of ['robot', 'control', 'math', 'comments', 'fallback'])
  test(`canonical ${f}.py is a fixed point`, () => expect(roundTrip(readFixture(`${f}.py`))).toBe(readFixture(`${f}.py`)));
test('normalisation', () => {
  expect(roundTrip("from robot import *\n\nx=1\ns = 'a'\n")).toBe('from robot import *\n\nx = 1\ns = "a"\n');
  expect(roundTrip('from robot import *\n\nfor i in range(0, 5):\n    pass\n')).toBe('from robot import *\n\nfor i in range(5):\n    pass\n');
  expect(roundTrip('from robot import *\n\nmotors(1, 1)  # go\n')).toBe('from robot import *\n\n# go\nmotors(1, 1)\n');
});
test('fallback keeps text and runs where it was', () => {
  const r = pythonToBlocks('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n');
  expect(r.ok && JSON.stringify(r.blocks)).toContain('d = {\\"a\\": 1}');
  expect(roundTrip('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n')).toBe('from robot import *\n\nwhile True:\n    d = {"a": 1}\n    motors(1, 1)\n');
});
// 2-space indentation, single quotes, `x=1`, trailing comments, `else:` holding only an `if`, `range(0, n)`
const messy = "from robot import *\nx=1\ns = 'hi'  # greeting\nif x>0:\n  motors(50,50)   # go\nelse:\n  if x<0:\n    stop()\n"
  + '  elif x == 0:\n    wait(1)\nfor i in range(0, 3):\n  print(i)\n';
test('idempotent on messy input', () => { const once = roundTrip(messy); expect(roundTrip(once)).toBe(once); });
test('messy input is normalised', () => expect(roundTrip(messy)).toBe(HEADER + 'x = 1\n# greeting\ns = "hi"\nif x > 0:\n    # go\n'
  + '    motors(50, 50)\nelif x < 0:\n    stop()\nelif x == 0:\n    wait(1)\nfor i in range(3):\n    print(i)\n'));
test('crlf and tabs', () => expect(roundTrip('from robot import *\r\n\r\nwhile True:\r\n\tmotors(1, 1)\r\n')).toBe('from robot import *\n\nwhile True:\n    motors(1, 1)\n'));
test('syntax error', () => expect(pythonToBlocks('if x\n  y\n')).toMatchObject({ ok: false, error: { kind: 'SyntaxError', line: 1 } }));
test('nonLatinName', () => expect(pythonToBlocks('скорость = 5\n')).toMatchObject({ ok: false, error: { kind: 'NonLatinName', line: 1 } }));
test('line map', () => { const r = pythonToBlocks(readFixture('control.py')); expect(r.ok && r.lineToBlock.get(4)).toMatch(/^b\d+$/); });

test('reference solutions become blocks only and stay the same', () => {
  for (const id of ['first_steps', 'barrier', 'colors'] as const) {
    expect(types(readSolution(id)), id).not.toContain('python_code');
    expect(roundTrip(readSolution(id)), id).toBe(readSolution(id));
  }
});

test('supported fixtures have no Python-code blocks', () => {
  for (const f of ['robot', 'control', 'math', 'comments']) expect(types(readFixture(`${f}.py`)), f).not.toContain('python_code');
});

test('Python forms that print alike map to their own blocks', () => {
  expect(types(readFixture('robot.py')).filter(type => type === 'robot_color_value')).toHaveLength(2);
  expect(mainStack(HEADER + 'print("red")\n')[0]).toMatchObject({ type: 'text_print', inputs: { TEXT: { block: { type: 'text' } } } });
  expect(mainStack(HEADER + 'x = color("left") == "blue"\n')[0])
    .toMatchObject({ inputs: { VALUE: { block: { inputs: { B: { block: { type: 'text' } } } } } } });
  expect(types(HEADER + 'while True:\n    pass\nfor _ in range(3):\n    pass\n')).toEqual(['robot_start', 'controls_forever', 'controls_repeat_ext', 'math_number']);
  expect(mainStack(HEADER + 'x = -5\n')[0]).toMatchObject({ inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: -5 } } } } });
  expect(mainStack(HEADER + 'x = -(5 + 1)\n')[0]).toMatchObject({ inputs: { VALUE: { block: { type: 'py_neg' } } } });
});

const fallbacks = ['import random', 'class Robot:\n    speed = 50', 'd = {"a": 1}', 'squares = [n * n for n in range(5)]',
  'try:\n    wait(1)\nexcept Exception:\n    stop()', 'xs.sort()', 'print(xs, d)', 'print()', 'print("a", end="")',
  'while n > 0:\n    n -= 1\nelse:\n    stop()', 'for i in range(3):\n    pass\nelse:\n    stop()', 'x *= 2', 'a, b = 1, 2',
  'x = a if b else c', 'x = 1 < y < 3', 'x = a in b', 'x = a is None', 'x = round(a, 2)', 'x = line("middle")', 'x = line(slot)',
  'motors(1)', 'x = 12345678901234567890', 'x = 3j', 'x = +a', 'x = a & b', 'x = f"{a}"', 'foo()', 'for a, b in pairs:\n    pass',
  'xs[1:] = ys', 'x = y = 1', 'with open("f") as f:\n    pass', '"""Just a string"""'];
test.each(fallbacks)('falls back: %s', src => {
  expect(mainStack(HEADER + src + '\n')).toMatchObject([{ type: 'python_code', fields: { CODE: src } }]);
  expect(roundTrip(HEADER + src + '\n')).toBe(HEADER + src + '\n');
});

test('only the statement with an unsupported part falls back', () => {
  const stack = mainStack(HEADER + 'if a in b:\n    stop()\nwhile a:\n    x = {}\n    stop()\n');
  expect(stack.map(block => block.type)).toEqual(['python_code', 'controls_while']);
  expect(stack[0].fields).toEqual({ CODE: 'if a in b:\n    stop()' });
});

test('statements sharing a line, and bodies on the header line', () => {
  expect(roundTrip(HEADER + 'd = {}; motors(1, 1); e = {}\n')).toBe(HEADER + 'd = {}\nmotors(1, 1)\ne = {}\n');
  expect(roundTrip(HEADER + 'if a: d = {}\nelse: stop()\nwhile True: x = 1; y = {}\n'))
    .toBe(HEADER + 'if a:\n    d = {}\nelse:\n    stop()\nwhile True:\n    x = 1\n    y = {}\n');
});

test('functions without a returned value', () => {
  const src = HEADER + 'def go():\n    motors(50, 50)\n    return\n\ngo()\n';
  expect(roundTrip(src)).toBe(src);
  expect(types(src)).toEqual(['procedures_defnoreturn', 'robot_motors', 'math_number', 'math_number', 'py_return',
    'robot_start', 'procedures_callnoreturn']);
  expect(roundTrip(HEADER + 'go()\n\ndef go():\n    stop()\n')).toBe(HEADER + 'def go():\n    stop()\n\ngo()\n');
  // Blockly would rename a second function block `go` to `go2`, so a redefinition stays Python code.
  expect(roundTrip(HEADER + 'def go():\n    stop()\ndef go():\n    wait(1)\ngo()\n'))
    .toBe(HEADER + 'def go():\n    stop()\n\ndef go():\n    wait(1)\ngo()\n');
});

test('comments above a function land at the start of its body', () => {
  expect(roundTrip('# My program\nfrom robot import *\n\nstop()\n# Spin\ndef spin():  # fast\n    motors(-50, 50)\n\nspin()\n# Done\n'))
    .toBe(HEADER + 'def spin():\n    # Spin\n    # fast\n    motors(-50, 50)\n\n# My program\nstop()\nspin()\n# Done\n');
});

test('comments in a fallback statement stay in its text', () => {
  const src = HEADER + 'try:  # risky\n    # inside\n    wait(1)\nexcept Exception:\n    pass\n    # still inside\n# outside\n';
  expect(mainStack(src).map(block => block.type)).toEqual(['python_code', 'comment_note']);
  expect(roundTrip(src)).toBe(src);
});

test('comments at the end of a body stay in it; # in a string is no comment', () => {
  const src = HEADER + 'if a:\n    stop()\n    # in if\n# before else\nelse:\n    print("# not a comment")\n';
  expect(roundTrip(src)).toBe(HEADER + 'if a:\n    stop()\n    # in if\nelse:\n    # before else\n    print("# not a comment")\n');
});

test('scanComments skips strings', () => {
  expect(scanComments('x = "#no"  # yes\n#whole  \ns = """\n# not\n"""  # after\ny = \'a\\\'#\'#  z\n#\n')).toEqual([
    { line: 1, text: 'yes', trailing: true },
    { line: 2, text: 'whole', trailing: false },
    { line: 5, text: 'after', trailing: true },
    { line: 6, text: ' z', trailing: true },
    { line: 7, text: '', trailing: false },
  ]);
});

test('line map: statement spans, inner statements override', () => {
  const r = convert(HEADER + 'while True:\n    d = {\n        "a": 1}\n\n    motors(1, 1)\n# end\n');
  const typeOf = new Map(allBlocks(r.blocks).map(block => [block.id, block.type]));
  const lines = [1, 2, 3, 4, 5, 6, 7, 8].map(line => typeOf.get(r.lineToBlock.get(line) ?? ''));
  expect(lines).toEqual([undefined, undefined, 'controls_forever', 'python_code', 'python_code', 'controls_forever',
    'robot_motors', 'comment_note']);
});

test('empty program, pass, ids and variable ids', () => {
  expect(roundTrip('')).toBe('from robot import *\n');
  expect(types('from robot import *\n')).toEqual(['robot_start']);
  expect(types(HEADER + 'while True:\n    pass\n')).toEqual(['robot_start', 'controls_forever']);
  const src = HEADER + 'x = 1\nx += 2\n';
  expect(json(src)).toBe(json(src));
  const ids = allBlocks(convert(src).blocks).map(block => block.id).sort();
  expect(ids).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
  expect(json(src)).toContain('"VAR":{"id":"v:x","name":"x"}');
});

test('list element assignment', () => {
  expect(roundTrip(HEADER + 'xs[i + 1] = -1\n')).toBe(HEADER + 'xs[i + 1] = -1\n');
  expect(types(HEADER + 'xs[0] = 5\n')).toContain('py_list_set');
});
