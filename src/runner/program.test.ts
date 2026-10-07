import { expect, test } from 'vitest';
import { fakeIO, run } from '../test/fakeIO';
import { Program } from './program';

test('one loop iteration per step', async () => {
  const io = fakeIO(); const p = new Program('while True:\n    motors(10, 20)\n', io);
  await run(p, 5); expect(io.motorCalls.length).toBe(5); expect(p.line).toBe(2);
});

test('wait pauses for simulated time', async () => {
  const io = fakeIO(); const p = new Program('motors(1, 1)\nwait(0.5)\nmotors(2, 2)\n', io);
  await run(p, 31); expect(io.motorCalls.at(-1)).toEqual([1, 1]);
  await run(p, 1); expect(io.motorCalls.at(-1)).toEqual([2, 2]);
  await run(p, 1); expect(p.state).toBe('finished');
});

test('sensor reads do not pause', async () => {
  const io = fakeIO({ line: true }); const p = new Program('a = line("front_left")\nb = line("front_left")\nprint(a, b)\n', io);
  await run(p, 1); expect(io.printed).toEqual(['True True']);
});

test('stop interrupts an empty infinite loop', async () => {
  const p = new Program('while True:\n    pass\n', fakeIO());
  await run(p, 2); p.stop(); await run(p, 1); expect(p.state).toBe('stopped');
});

test('a stopped program runs no more Python, so it cannot affect the next one', async () => {
  const io1 = fakeIO(); const p1 = new Program('while True:\n    motors(1, 1)\n', io1);
  await run(p1, 2); p1.stop();
  const io2 = fakeIO(); const p2 = new Program('while True:\n    motors(2, 2)\n', io2);
  await run(p2, 3);
  expect(p1.state).toBe('stopped'); expect(io1.motorCalls.length).toBe(2);
  expect(io2.motorCalls).toEqual([[2, 2], [2, 2], [2, 2]]);
});

test('runtime errors carry kind, line and name', async () => {
  const p = new Program('x = 1\nmotor(1, 2)\n', fakeIO()); await run(p, 1);
  expect(p.state).toBe('error'); expect(p.error).toMatchObject({ kind: 'NameError', line: 2, name: 'motor' });
});

test('sensor error', async () => {
  const io = fakeIO({ throwOn: 'left' }); const p = new Program('line("left")\n', io); await run(p, 1);
  expect(p.error).toMatchObject({ kind: 'SensorError', line: 1, slot: 'left', needed: 'line' });
});

test('bad arguments', async () => {
  const p1 = new Program('motors("fast", 1)\n', fakeIO()); await run(p1, 1); expect(p1.error?.kind).toBe('TypeError');
  const p2 = new Program('wait(-1)\n', fakeIO()); await run(p2, 1); expect(p2.error?.kind).toBe('ValueError');
});

test('non-finite numbers are a ValueError', async () => {
  const io = fakeIO(); const p1 = new Program('motors(float("nan"), 1)\n', io); await run(p1, 1);
  expect(p1.error?.kind).toBe('ValueError'); expect(io.motorCalls).toEqual([]);
  const p2 = new Program('wait(float("inf"))\n', fakeIO()); await run(p2, 1); expect(p2.error?.kind).toBe('ValueError');
});

test('speeds outside -100..100 are passed through', async () => {
  const io = fakeIO(); const p = new Program('motors(150, -200)\n', io); await run(p, 1);
  expect(io.motorCalls).toEqual([[150, -200]]);
});

test('highlight line inside a function', async () => {
  const p = new Program('def go():\n    motors(1, 1)\n\nwhile True:\n    go()\n', fakeIO()); await run(p, 1); expect(p.line).toBe(2);
});
