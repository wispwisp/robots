import { expect, test } from 'vitest';
import { fakeIO, run } from '../test/fakeIO';
import { Program } from './program';

test('cyrillic name is NonLatinName', async () => {
  const p = new Program('скорость = 5\n', fakeIO()); await run(p, 1); expect(p.error).toMatchObject({ kind: 'NonLatinName', line: 1 });
});

test('cyrillic text in a string or comment stays a SyntaxError', async () => {
  const p = new Program('x = = "привет"  # тест\n', fakeIO()); await run(p, 1);
  expect(p.error).toMatchObject({ kind: 'SyntaxError', line: 1 });
});

// Skulpt 1.2.0 reports these as a SyntaxError ("bad input", "unindent does not match …").
test.each([
  ['unexpected indent', 'x = 1\n    y = 2\n', 2],
  ['missing indented block', 'while True:\nmotors(1, 1)\n', 2],
  ['missing indented block after comments', 'while True:  # forever\n\n# go\nmotors(1, 1)\n', 4],
  ['missing indented block at the end', 'motors(1, 1)\nwhile True:\n', 4], // Skulpt's line is past the end
  ['unindent mismatch', 'while True:\n    motors(1, 1)\n  stop()\n', 3],
])('%s is an IndentationError', async (_name, source, line) => {
  const p = new Program(source, fakeIO()); await run(p, 1); expect(p.error).toMatchObject({ kind: 'IndentationError', line });
});

test.each([
  ['an unclosed bracket', 'motors(1, 1\nstop()\n'],
  ['a mistake in an indented block', 'while True:\n    motors(1, = 2)\n'],
  ['a missing colon', 'while True\n    stop()\n'],
])('%s stays a SyntaxError', async (_name, source) => {
  const p = new Program(source, fakeIO()); await run(p, 1); expect(p.error).toMatchObject({ kind: 'SyntaxError' });
});
