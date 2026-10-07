import { expect, test } from 'vitest';
import { getTrack } from '../tracks/tracks';
import { createWorld, setMotors, stepWorld } from './world';

test('barrier opens after 3 s within 25 cm', () => {
  const w = createWorld(getTrack('barrier'), {}); w.pose = { x: 115, y: 100, heading: 0 };
  for (let i = 0; i < 179; i++) stepWorld(w); expect(w.barrierOpen).toBe(false);
  stepWorld(w); expect(w.barrierOpen).toBe(true);
});

test('touching closed barrier crashes', () => {
  const w = createWorld(getTrack('barrier'), {}); w.pose = { x: 120, y: 100, heading: 0 }; setMotors(w, 100, 100);
  for (let i = 0; i < 120 && w.outcome === 'running'; i++) stepWorld(w);
  expect(w.outcome).toBe('crash'); expect(w.motors).toEqual({ left: 0, right: 0 });
});

test('red square: 2 s still then leave is fine; leaving early fails', () => {
  const ok = createWorld(getTrack('colors'), {}); ok.pose = { x: 131, y: 24, heading: 0 };
  for (let i = 0; i < 120; i++) stepWorld(ok); setMotors(ok, 100, 100);
  for (let i = 0; i < 60; i++) stepWorld(ok); expect(ok.outcome).toBe('running'); expect(ok.red.done).toBe(true);
  const bad = createWorld(getTrack('colors'), {}); bad.pose = { x: 131, y: 24, heading: 0 }; setMotors(bad, 100, 100);
  for (let i = 0; i < 60; i++) stepWorld(bad); expect(bad.outcome).toBe('missedRed');
});

test('off field and finish', () => {
  const off = createWorld(getTrack('first_steps'), {}); off.pose = { x: 199, y: 10, heading: 0 }; setMotors(off, 100, 100);
  for (let i = 0; i < 30; i++) stepWorld(off); expect(off.outcome).toBe('offField');
  const fin = createWorld(getTrack('first_steps'), {}); fin.pose = { x: 165, y: 60, heading: 0 }; setMotors(fin, 100, 100);
  for (let i = 0; i < 30; i++) stepWorld(fin); expect(fin.outcome).toBe('success');
});

test('motors clamp', () => { const w = createWorld(getTrack('first_steps'), {}); setMotors(w, 500, -500); expect(w.motors).toEqual({ left: 100, right: -100 }); });
