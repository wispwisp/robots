import { expect, test } from 'vitest';
import { bodyCorners, slotDirection, slotPoint, stepPose } from './robot';

test('straight 1 s at 100', () => expect(stepPose({x:0,y:0,heading:0},100,100,1)).toEqual({x:30,y:0,heading:0}));
test('spin in place', () => {
  const p = stepPose({x:0,y:0,heading:0},-50,50,1);
  expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(0); expect(p.heading).toBeCloseTo(-1.875);
});
test('right wheel faster turns left (up the screen)', () => {
  let p = {x:0,y:0,heading:0}; for (let i=0;i<60;i++) p = stepPose(p,0,50,1/60);
  expect(p.heading).toBeLessThan(0); expect(p.y).toBeLessThan(0);
});
test('slot positions', () => {
  expect(slotPoint({x:100,y:50,heading:0},'front_left')).toEqual({x:109,y:47.5});
  expect(slotPoint({x:100,y:50,heading:0},'right')).toEqual({x:104,y:57.5});
  const p = slotPoint({x:100,y:50,heading:Math.PI/2},'front_left');
  expect(p.x).toBeCloseTo(102.5); expect(p.y).toBeCloseTo(59);
  expect(slotDirection({x:0,y:0,heading:0},'left')).toBeCloseTo(-Math.PI/2);
});
test('body corners at heading 0', () => {
  expect(bodyCorners({x:100,y:50,heading:0})).toEqual([
    {x:109,y:42.5}, {x:109,y:57.5}, {x:91,y:57.5}, {x:91,y:42.5}]);
});
