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
