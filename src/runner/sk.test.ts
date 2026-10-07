import { expect, test } from 'vitest';
import { configureSkulpt, sk } from './sk';

test('runs python and imports the empty robot module', async () => {
  const out: string[] = [];
  configureSkulpt({ output: s => out.push(s) });
  await sk().misceval.asyncToPromise(() =>
    sk().importMainWithBody('<stdin>', false, 'from robot import *\nimport math\nprint(1 + 1)\n', true));
  expect(out.join('')).toBe('2\n');
});

test('configuring without yieldLimit keeps the current one', () => {
  configureSkulpt({ output: () => {}, yieldLimit: 7 });
  configureSkulpt({ output: () => {} });
  expect(sk().yieldLimit).toBe(7);
});
