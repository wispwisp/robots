import { expect, test } from 'vitest';
import { getTrack } from '../tracks/tracks';
import { createWorld } from './world';
import { readAll, readSensor, SensorError } from './sensors';

const asm = { front_left: 'line', front_center: 'distance', right: 'color' } as const;

test('wrong sensor type', () => {
  const w = createWorld(getTrack('first_steps'), asm);
  expect(() => readSensor(w, 'line', 'right')).toThrowError(SensorError);
  try { readSensor(w, 'line', 'right'); } catch (e) { expect((e as SensorError).needed).toBe('line'); }
});

test('unknown slot', () => {
  try { readSensor(createWorld(getTrack('first_steps'), asm), 'distance', 'front'); } catch (e) { expect((e as SensorError).needed).toBeNull(); }
});

test('distance sees closed barrier only', () => {
  const w = createWorld(getTrack('barrier'), asm);
  w.pose = { x: 110, y: 100, heading: 0 };              // front slot at x=119, barrier at x=135
  expect(readSensor(w, 'distance', 'front_center')).toBe(16);
  w.barrierOpen = true;
  expect(readSensor(w, 'distance', 'front_center')).toBe(100);
});

test('unknown slot throws', () => {
  expect(() => readSensor(createWorld(getTrack('first_steps'), asm), 'distance', 'front')).toThrowError(SensorError);
});

test('line, brightness and color readings', () => {
  const w = createWorld(getTrack('first_steps'), { front_center: 'line', right: 'color' });
  // At the start the front slot sits on the line and the right slot on white mat.
  expect(readSensor(w, 'line', 'front_center')).toBe(true);
  expect(readSensor(w, 'brightness', 'front_center')).toBe(10);
  expect(readSensor(w, 'color', 'right')).toBe('white');
  w.pose = { x: 182, y: 60, heading: 0 };
  expect(readSensor(w, 'color', 'right')).toBe('green');
  expect(readAll(w)).toEqual([
    { slot: 'front_center', type: 'line', line: false, brightness: 60 },
    { slot: 'right', type: 'color', color: 'green' },
  ]);
});

test('readAll order', () => expect(readAll(createWorld(getTrack('first_steps'), asm)).map(r => r.slot)).toEqual(['front_left', 'front_center', 'right']));
