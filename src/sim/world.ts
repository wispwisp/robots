// The simulated world: robot, motors and the rules of the track. No DOM.
import { polygonToSegment, rectContains } from '../geometry';
import { bodyCorners, stepPose } from '../robot/robot';
import type { Assembly, Pose } from '../robot/robot';
import { MAT } from '../tracks/tracks';
import type { Track } from '../tracks/tracks';

export const DT = 1 / 60;

const EPS = 1e-9; // time sums of DT land a hair under round numbers
const CRASH_DISTANCE = 1; // cm between the body and the closed barrier
const BARRIER_NEAR_DISTANCE = 25; // cm
const BARRIER_OPEN_TIME = 3; // s spent near the barrier
const RED_STILL_TIME = 2; // s standing still on the red square

export type Outcome = 'running' | 'success' | 'crash' | 'offField' | 'missedRed';

export interface World {
  track: Track;
  assembly: Assembly;
  pose: Pose;
  motors: { left: number; right: number };
  time: number;
  barrierOpen: boolean;
  barrierNearTime: number; // seconds the robot has been near the closed barrier in a row
  red: { inside: boolean; stillTime: number; done: boolean };
  outcome: Outcome;
}

export function createWorld(track: Track, assembly: Assembly): World {
  return {
    track,
    assembly,
    pose: { ...track.start },
    motors: { left: 0, right: 0 },
    time: 0,
    barrierOpen: false,
    barrierNearTime: 0,
    red: { inside: false, stillTime: 0, done: false },
    outcome: 'running',
  };
}

export function setMotors(w: World, left: number, right: number): void {
  w.motors = { left: clampSpeed(left), right: clampSpeed(right) };
}

function clampSpeed(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function stepWorld(w: World): void {
  if (w.outcome !== 'running') return;
  w.pose = stepPose(w.pose, w.motors.left, w.motors.right, DT);
  w.time += DT;

  const barrier = w.track.barrier;
  if (barrier && !w.barrierOpen) {
    const gap = polygonToSegment(bodyCorners(w.pose), barrier);
    if (gap <= CRASH_DISTANCE) end(w, 'crash');
    w.barrierNearTime = gap <= BARRIER_NEAR_DISTANCE ? w.barrierNearTime + DT : 0;
    if (w.barrierNearTime >= BARRIER_OPEN_TIME - EPS) w.barrierOpen = true;
  }

  const redSquare = w.track.redSquare;
  if (redSquare) {
    const inside = rectContains(redSquare, w.pose);
    if (inside) {
      const standing = w.motors.left === 0 && w.motors.right === 0;
      w.red.stillTime = standing ? w.red.stillTime + DT : 0;
      if (w.red.stillTime >= RED_STILL_TIME - EPS) w.red.done = true;
    } else if (w.red.inside && !w.red.done) {
      end(w, 'missedRed');
    }
    w.red.inside = inside;
  }

  if (w.pose.x < 0 || w.pose.x > MAT.width || w.pose.y < 0 || w.pose.y > MAT.height) end(w, 'offField');
  if (rectContains(w.track.finish, w.pose)) end(w, 'success');
}

// Records the first thing that ended the run and stops the motors.
function end(w: World, outcome: Outcome): void {
  if (w.outcome !== 'running') return;
  w.outcome = outcome;
  w.motors = { left: 0, right: 0 };
}
