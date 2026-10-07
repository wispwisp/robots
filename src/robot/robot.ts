// Robot body, sensor slots and differential-drive kinematics (centimetres, seconds, radians). No DOM.
import type { Point } from '../geometry';

export const ROBOT = { width: 15, length: 18, wheelBase: 16, maxSpeed: 30 } as const;

export type SlotName = 'front_left' | 'front_center' | 'front_right' | 'left' | 'right';
export const SLOT_NAMES: readonly SlotName[] = ['front_left', 'front_center', 'front_right', 'left', 'right'];

export type SensorType = 'line' | 'distance' | 'color';
export type Assembly = Partial<Record<SlotName, SensorType>>;

// Slot position in the robot frame (cm forward of the centre, cm to the left of it) and the direction
// the sensor faces relative to the heading.
export const SLOTS: Record<SlotName, { forward: number; left: number; facing: number }> = {
  front_left: { forward: 9, left: 2.5, facing: 0 },
  front_center: { forward: 9, left: 0, facing: 0 },
  front_right: { forward: 9, left: -2.5, facing: 0 },
  left: { forward: 4, left: 7.5, facing: -Math.PI / 2 },
  right: { forward: 4, left: -7.5, facing: Math.PI / 2 },
};

export interface Pose { x: number; y: number; heading: number }

// Robot-frame (forward, left) to world coordinates. A positive heading turns clockwise on screen (y is down).
export function toWorld(pose: Pose, forward: number, left: number): Point {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: pose.x + forward * cos + left * sin, y: pose.y + forward * sin - left * cos };
}

export function slotPoint(pose: Pose, slot: SlotName): Point {
  return toWorld(pose, SLOTS[slot].forward, SLOTS[slot].left);
}

export function slotDirection(pose: Pose, slot: SlotName): number {
  return pose.heading + SLOTS[slot].facing;
}

export function bodyCorners(pose: Pose): Point[] {
  const f = ROBOT.length / 2;
  const l = ROBOT.width / 2;
  return [toWorld(pose, f, l), toWorld(pose, f, -l), toWorld(pose, -f, -l), toWorld(pose, -f, l)];
}

// Advance the pose by dt seconds. Motor speeds are -100...100 (100 = ROBOT.maxSpeed cm/s).
export function stepPose(pose: Pose, left: number, right: number, dt: number): Pose {
  const vl = left / 100 * ROBOT.maxSpeed;
  const vr = right / 100 * ROBOT.maxSpeed;
  const v = (vl + vr) / 2;
  const omega = (vr - vl) / ROBOT.wheelBase; // positive: turning left, which lowers the heading
  const midHeading = pose.heading - omega * dt / 2;
  return {
    x: pose.x + v * Math.cos(midHeading) * dt,
    y: pose.y + v * Math.sin(midHeading) * dt,
    heading: pose.heading - omega * dt,
  };
}
