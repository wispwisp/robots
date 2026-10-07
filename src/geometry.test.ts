import { expect, test } from 'vitest';
import { distanceToPolyline, distanceToSegment, polygonToSegment, rayToSegment, rectContains, smoothPath } from './geometry';

test('distanceToSegment', () => expect(distanceToSegment({x:5,y:3},{a:{x:0,y:0},b:{x:10,y:0}})).toBe(3));
test('rayToSegment hit and miss', () => {
  const s = {a:{x:10,y:-5}, b:{x:10,y:5}};
  expect(rayToSegment({x:0,y:0}, 0, s)).toBeCloseTo(10);
  expect(rayToSegment({x:0,y:0}, Math.PI, s)).toBeNull();
});
test('polygonToSegment is 0 when crossing', () => {
  const sq = [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}];
  expect(polygonToSegment(sq, {a:{x:2,y:-1},b:{x:2,y:5}})).toBe(0);
  expect(polygonToSegment(sq, {a:{x:7,y:0},b:{x:7,y:4}})).toBeCloseTo(3);
});
test('smoothPath keeps endpoints', () => {
  const p = smoothPath([{x:0,y:0},{x:10,y:5},{x:20,y:0}], 8);
  expect(p[0]).toEqual({x:0,y:0}); expect(p.at(-1)).toEqual({x:20,y:0}); expect(p.length).toBe(17);
});
test('distanceToPolyline picks the nearest segment', () => {
  const line = [{x:0,y:0},{x:10,y:0},{x:10,y:10}];
  expect(distanceToPolyline({x:12,y:5}, line)).toBe(2);
  expect(distanceToPolyline({x:5,y:-1}, line)).toBe(1);
});
test('rectContains includes the edges', () => {
  const r = {x:10,y:20,w:30,h:40};
  expect(rectContains(r, {x:10,y:20})).toBe(true);
  expect(rectContains(r, {x:40,y:60})).toBe(true);
  expect(rectContains(r, {x:40.1,y:30})).toBe(false);
});
test('polygonToSegment is 0 for a segment fully inside', () => {
  const sq = [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}];
  expect(polygonToSegment(sq, {a:{x:1,y:1},b:{x:3,y:3}})).toBe(0);
});
test('smoothPath passes through every input point', () => {
  const input = [{x:0,y:0},{x:10,y:5},{x:20,y:0},{x:30,y:8}];
  const p = smoothPath(input, 4);
  input.forEach((q, i) => expect(p[i * 4]).toEqual(q));
});
