import { expect, test } from 'vitest';
import { readSolution, REFERENCE_ASSEMBLY } from '../../tests/solutions/reference';
import { getTrack } from '../tracks/tracks';
import { Session } from './session';
import { DT } from './world';

async function runToEnd(s: Session, maxSeconds = 180): Promise<void> {
  for (let i = 0; i < maxSeconds / DT && s.outcome === 'running'; i++) await s.step();
}

for (const id of ['first_steps', 'barrier', 'colors'] as const)
  test(`reference solution completes ${id}`, async () => {
    const s = new Session(getTrack(id), REFERENCE_ASSEMBLY, readSolution(id));
    await runToEnd(s); expect(s.outcome).toBe('success');
  });

test('ignoring the barrier crashes', async () => {
  const s = new Session(getTrack('barrier'), REFERENCE_ASSEMBLY, readSolution('first_steps')); await runToEnd(s); expect(s.outcome).toBe('crash');
});

test('skipping the red stop fails', async () => {
  const s = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('barrier')); await runToEnd(s); expect(s.outcome).toBe('missedRed');
});

test('driving straight leaves the field', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'while True:\n    motors(50, 50)\n'); await runToEnd(s); expect(s.outcome).toBe('offField');
});

test('program end stops motors', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'motors(50, 50)\nwait(1)\n'); await runToEnd(s);
  expect(s.outcome).toBe('programEnded'); expect(s.world.motors).toEqual({ left: 0, right: 0 });
});

test('a program error ends the run and stops motors', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'motors(50, 50)\nline("left")\n'); await runToEnd(s);
  expect(s.outcome).toBe('programError'); expect(s.program.error?.kind).toBe('SensorError'); expect(s.world.motors).toEqual({ left: 0, right: 0 });
});

test('stop during time.sleep freezes the world', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'import time\nmotors(50, 50)\ntime.sleep(10)\n');
  await s.step(); const time = s.world.time; const pose = { ...s.world.pose };
  const pending = s.step(); await new Promise(r => setTimeout(r, 20)); s.stop(); await pending; await s.step();
  expect(s.outcome).toBe('stopped'); expect(s.program.state).toBe('stopped');
  expect(s.world.time).toBe(time); expect(s.world.pose).toEqual(pose);
});

test('output keeps last 5 lines', async () => {
  const s = new Session(getTrack('first_steps'), {}, 'for i in range(8):\n    print(i)\n'); await runToEnd(s);
  expect(s.output).toEqual(['3', '4', '5', '6', '7']);
});

test('identical runs', async () => {
  const a = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors')); await runToEnd(a);
  const b = new Session(getTrack('colors'), REFERENCE_ASSEMBLY, readSolution('colors')); await runToEnd(b);
  expect(a.world.time).toBe(b.world.time); expect(a.world.pose).toEqual(b.world.pose);
});
