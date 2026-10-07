// A run must not depend on how fast the machine is: stalls that interrupt the program's Python
// change nothing in the world. Stalls are injected into sensor reads, so this file mocks them.
import { expect, test, vi } from 'vitest';
import { readSolution, REFERENCE_ASSEMBLY } from '../../tests/solutions/reference';
import { getTrack } from '../tracks/tracks';
import { Session } from './session';

const stalls = vi.hoisted(() => ({ every: 0, reads: 0 }));

vi.mock('./sensors', async importOriginal => {
  const real = await importOriginal<typeof import('./sensors')>();
  return {
    ...real,
    readSensor: (...args: Parameters<typeof real.readSensor>) => {
      if (stalls.every > 0 && ++stalls.reads % stalls.every === 0) {
        const end = Date.now() + 10;
        while (Date.now() < end); // busy-wait: longer than Skulpt's time slice
      }
      return real.readSensor(...args);
    },
  };
});

async function runColors(stallEvery: number) {
  stalls.every = stallEvery; stalls.reads = 0;
  const s = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors'));
  const advance = vi.spyOn(s.program, 'advance');
  for (let i = 0; i < 100_000 && s.outcome === 'running'; i++) await s.step();
  const results = await Promise.all(advance.mock.results.map(r => r.value));
  return { s, interrupted: results.filter(completed => !completed).length };
}

test('stalls during sensor reads do not change the run', async () => {
  const smooth = await runColors(0);
  const stalled = await runColors(50);
  expect(stalled.interrupted).toBeGreaterThan(0); // the stalls really interrupted the program
  expect(stalled.s.outcome).toBe(smooth.s.outcome);
  expect(stalled.s.world.time).toBe(smooth.s.world.time);
  expect(stalled.s.world.pose).toEqual(smooth.s.world.pose);
}, 30_000);
