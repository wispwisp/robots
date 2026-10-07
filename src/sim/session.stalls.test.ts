// A run must not depend on how fast the machine is: stalls that interrupt the program's Python
// change nothing in the world. Stalls are injected into sensor reads, so this file mocks them.
import { expect, test, vi } from 'vitest';
import { readSolution, REFERENCE_ASSEMBLY } from '../../tests/solutions/reference';
import { getTrack } from '../tracks/tracks';
import { Session } from './session';

const stalls = vi.hoisted(() => ({ reads: 0, when: (_read: number): boolean => false }));

vi.mock('./sensors', async importOriginal => {
  const real = await importOriginal<typeof import('./sensors')>();
  return {
    ...real,
    readSensor: (...args: Parameters<typeof real.readSensor>) => {
      if (stalls.when(++stalls.reads)) {
        const end = Date.now() + 10;
        while (Date.now() < end); // busy-wait: longer than Skulpt's time slice
      }
      return real.readSensor(...args);
    },
  };
});

// Runs the session until it ends or `seconds` of world time have passed, stalling the reads (counted
// from 1) that `when` picks. Also counts the advances that Skulpt's time slice interrupted.
async function runWithStalls(s: Session, when: (read: number) => boolean, seconds = Infinity) {
  stalls.reads = 0; stalls.when = when;
  const advance = vi.spyOn(s.program, 'advance');
  for (let i = 0; i < 100_000 && s.outcome === 'running' && s.world.time < seconds; i++) await s.step();
  const results = await Promise.all(advance.mock.results.map(r => r.value));
  return { s, interrupted: results.filter(completed => !completed).length };
}

const colors = () => new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors'));

function polling(): Session {
  const source = 'motors(50, 50)\nwhile distance("front_center") > 20:\n    pass\nstop()\nwait(10)\n';
  const s = new Session(getTrack('barrier'), REFERENCE_ASSEMBLY, source);
  s.world.pose = { x: 60, y: 100, heading: 0 }; // driving straight at the closed barrier (x = 135)
  return s;
}

test('stalls during sensor reads do not change the run', async () => {
  const smooth = await runWithStalls(colors(), () => false);
  const stalled = await runWithStalls(colors(), read => read % 50 === 0);
  expect(stalled.interrupted).toBeGreaterThan(0); // the stalls really interrupted the program
  expect(stalled.s.outcome).toBe(smooth.s.outcome);
  expect(stalled.s.world.time).toBe(smooth.s.world.time);
  expect(stalled.s.world.pose).toEqual(smooth.s.world.pose);
}, 30_000);

test('stalls on the reads a polling loop defers to the next step do not change the run', async () => {
  const smooth = await runWithStalls(polling(), () => false, 5);
  // Each polling step reads 100 times, so reads 101, 201, ... are deferred. Stall every tenth of them.
  const stalled = await runWithStalls(polling(), read => read % 1000 === 101, 5);
  expect(stalled.s.program.error).toBeNull();
  expect(stalled.s.outcome).toBe(smooth.s.outcome);
  expect(stalled.s.world.time).toBe(smooth.s.world.time);
  expect(stalled.s.world.pose).toEqual(smooth.s.world.pose);
}, 30_000);
