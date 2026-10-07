import { expect, test, vi } from 'vitest';
import { fakeIO, run } from '../test/fakeIO';
import { SensorError } from '../sim/sensors';
import { Program } from './program';

const DT = 1 / 60;

// Runs fn with a fake clock that only the IO's slow sensor read moves, by 10 ms per read.
// Skulpt checks that clock to interrupt Python, so interruptions happen at exact places.
async function withSlowReads(fn: (io: ReturnType<typeof fakeIO>) => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    await fn({ ...fakeIO(), read: () => { vi.advanceTimersByTime(10); return false; } });
  } finally {
    vi.useRealTimers();
  }
}

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
  const durations: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now(); expect(await p.advance(DT)).toBe(false); durations.push(Date.now() - t);
  }
  expect(durations.sort((a, b) => a - b)[2]).toBeLessThan(50); // the median, so a stall on a busy machine is fine
  p.stop(); expect(await p.advance(DT)).toBe(true); expect(p.state).toBe('stopped');
});

test('a stopped program runs no more Python, so it cannot affect the next one', async () => {
  const io1 = fakeIO(); const p1 = new Program('while True:\n    motors(1, 1)\n', io1);
  await run(p1, 2); p1.stop();
  const io2 = fakeIO(); const p2 = new Program('while True:\n    motors(2, 2)\n', io2);
  await run(p2, 3);
  expect(p1.state).toBe('stopped'); expect(io1.motorCalls.length).toBe(2);
  expect(io2.motorCalls).toEqual([[2, 2], [2, 2], [2, 2]]);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('a program stopped inside time.sleep is released and cannot affect the next one', async () => {
  const io1 = fakeIO(); const p1 = new Program('import time\nstop()\ntime.sleep(0.1)\nmotors(9, 9)\n', io1);
  await run(p1, 1);
  const sleeping = p1.advance(DT);
  await sleep(20); p1.stop();
  const first = await Promise.race([sleeping.then(() => 'released'), sleep(60).then(() => 'still asleep')]);
  expect(first).toBe('released');
  const io2 = fakeIO(); const p2 = new Program('while True:\n    motors(2, 2)\n', io2);
  await run(p2, 1); await sleep(150); // past the end of the sleep
  expect(io1.motorCalls).toEqual([[0, 0]]); expect(io2.motorCalls).toEqual([[2, 2]]);
});

test('an advance interrupted by the time slice returns false; the next one completes the step', () => withSlowReads(async io => {
  // Skulpt checks the clock on entering go(), right after the slow read.
  const p = new Program('def go():\n    motors(1, 1)\n\nwhile True:\n    line("front_left")\n    go()\n', io);
  const results: boolean[] = [];
  for (let i = 0; i < 6; i++) results.push(await p.advance(DT));
  expect(results).toEqual([false, true, false, true, false, true]); expect(io.motorCalls.length).toBe(3);
}));

test('interrupted advances use up no simulated time, not even from a wait', () => withSlowReads(async io => {
  // The step right after the wait is interrupted once; motors(2, 2) still comes 0.5 s after the wait.
  const p = new Program('def go():\n    motors(2, 2)\n\nmotors(1, 1)\nwait(0.5)\nline("front_left")\ngo()\n', io);
  await run(p, 31); expect(io.motorCalls.at(-1)).toEqual([1, 1]);
  await run(p, 1); expect(io.motorCalls.at(-1)).toEqual([2, 2]);
}));

test('100 reads and a command per iteration still make one step per iteration', async () => {
  const io = fakeIO();
  const p = new Program('while True:\n    for i in range(100):\n        line("front_left")\n    motors(1, 1)\n', io);
  await run(p, 5); expect(io.motorCalls.length).toBe(5);
});

test('the 101st read without a command ends the step first, then reads the new step', async () => {
  let completed = 0; // stands in for the world: what a read sees changes only between steps
  const io = { ...fakeIO(), read: () => completed };
  const p = new Program('v = []\nfor i in range(101):\n    v.append(brightness("front_left"))\nprint(v[0], v[99], v[100])\n', io);
  for (let i = 0; i < 1000 && io.printed.length === 0; i++) if (await p.advance(DT)) completed++;
  expect(io.printed).toEqual(['0 0 1']);
});

test('a slow 101st read still gives its value to Python', async () => {
  let completed = 0; let reads = 0;
  const read = () => {
    if (++reads === 101) { const end = Date.now() + 6; while (Date.now() < end); } // longer than YIELD_MS
    return completed;
  };
  const io = { ...fakeIO(), read };
  const p = new Program('v = []\nfor i in range(101):\n    v.append(brightness("front_left"))\nprint(v[0], v[99], v[100])\n', io);
  for (let i = 0; i < 1000 && io.printed.length === 0 && !p.error; i++) if (await p.advance(DT)) completed++;
  expect(p.error).toBeNull(); expect(io.printed).toEqual(['0 0 1']);
});

test('a sensor error on the 101st read is reported at that read', async () => {
  let reads = 0;
  const read = (_fn: string, slot: string) => { if (++reads === 101) throw new SensorError(slot, 'line'); return 0; };
  const p = new Program('for i in range(101):\n    brightness("left")\n', { ...fakeIO(), read });
  await run(p, 3);
  expect(p.error).toMatchObject({ kind: 'SensorError', line: 2, slot: 'left', needed: 'line' });
});

test('a function that computes across several time slices still returns its result', async () => {
  const io = fakeIO();
  const p = new Program('def count():\n    x = 0\n    while x < 20000:\n        x += 1\n    return x\nprint(count())\n', io);
  for (let i = 0; i < 10_000 && io.printed.length === 0 && !p.error; i++) await p.advance(DT);
  expect(p.error).toBeNull(); expect(io.printed).toEqual(['20000']);
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
