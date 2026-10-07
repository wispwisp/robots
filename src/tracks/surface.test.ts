import { expect, test } from 'vitest';
import { rectContains } from '../geometry';
import { getTrack, TRACKS } from './tracks';
import { surfaceAt } from './surface';

const t = getTrack('colors');
test('on the line centre', () => expect(surfaceAt(t, t.line[5])).toEqual({ brightness: 10, color: 'black' }));
test('far from line', () => expect(surfaceAt(t, { x: 100, y: 110 })).toEqual({ brightness: 95, color: 'white' }));
test('line edge is in between', () => {
  const k = 6; // mid-way along the first smoothed segment
  const p = t.line[k];
  const dx = t.line[k + 1].x - t.line[k - 1].x;
  const dy = t.line[k + 1].y - t.line[k - 1].y;
  const len = Math.hypot(dx, dy);
  // 1.0 cm to the side of the line centre, measured perpendicular to the line
  expect(surfaceAt(t, { x: p.x - dy / len, y: p.y + dx / len }).brightness).toBe(53);
});
test('red square hides the line', () => expect(surfaceAt(t, { x: 131, y: 24 })).toEqual({ brightness: 55, color: 'red' }));
test('finish is green', () => expect(surfaceAt(t, { x: 182, y: 100 })).toEqual({ brightness: 60, color: 'green' }));
test('every track starts inside its start box and the mat', () => {
  for (const tr of TRACKS) { expect(rectContains(tr.startBox, tr.start)).toBe(true);
    for (const p of tr.line) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(120); } }
});
