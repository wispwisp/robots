// What the robot's sensors report in the current world. No DOM.
import { rayToSegment } from '../geometry';
import { SLOT_NAMES, slotDirection, slotPoint } from '../robot/robot';
import type { SensorType, SlotName } from '../robot/robot';
import { surfaceAt } from '../tracks/surface';
import type { ColorName } from '../tracks/surface';
import type { World } from './world';

export type SensorFunction = 'line' | 'brightness' | 'distance' | 'color';

export const DISTANCE_MAX = 100; // cm
const LINE_BRIGHTNESS_LIMIT = 50; // darker than this counts as "on the line"

const NEEDED_SENSOR: Record<SensorFunction, SensorType> = {
  line: 'line',
  brightness: 'line',
  distance: 'distance',
  color: 'color',
};

// needed is null when the slot name itself is unknown.
export class SensorError extends Error {
  constructor(readonly slot: string, readonly needed: SensorType | null) {
    super(needed === null ? `Unknown sensor slot: ${slot}` : `Slot ${slot} has no ${needed} sensor`);
    this.name = 'SensorError';
  }
}

export function readSensor(w: World, fn: SensorFunction, slot: string): boolean | number | ColorName {
  if (!isSlotName(slot)) throw new SensorError(slot, null);
  const needed = NEEDED_SENSOR[fn];
  if (w.assembly[slot] !== needed) throw new SensorError(slot, needed);
  switch (fn) {
    case 'line': return brightnessAt(w, slot) < LINE_BRIGHTNESS_LIMIT;
    case 'brightness': return brightnessAt(w, slot);
    case 'distance': return distanceFrom(w, slot);
    case 'color': return surfaceUnder(w, slot).color;
  }
}

export interface Reading {
  slot: SlotName;
  type: SensorType;
  line?: boolean;
  brightness?: number;
  distance?: number;
  color?: ColorName;
}

// Every installed sensor, in slot order.
export function readAll(w: World): Reading[] {
  const readings: Reading[] = [];
  for (const slot of SLOT_NAMES) {
    const type = w.assembly[slot];
    if (type === 'line') {
      const brightness = brightnessAt(w, slot);
      readings.push({ slot, type, line: brightness < LINE_BRIGHTNESS_LIMIT, brightness });
    } else if (type === 'distance') {
      readings.push({ slot, type, distance: distanceFrom(w, slot) });
    } else if (type === 'color') {
      readings.push({ slot, type, color: surfaceUnder(w, slot).color });
    }
  }
  return readings;
}

function isSlotName(slot: string): slot is SlotName {
  return (SLOT_NAMES as readonly string[]).includes(slot);
}

function surfaceUnder(w: World, slot: SlotName) {
  return surfaceAt(w.track, slotPoint(w.pose, slot));
}

function brightnessAt(w: World, slot: SlotName): number {
  return surfaceUnder(w, slot).brightness;
}

// Only the closed barrier can be seen; the open barrier and the mat edge are not obstacles.
function distanceFrom(w: World, slot: SlotName): number {
  const barrier = w.track.barrier;
  if (!barrier || w.barrierOpen) return DISTANCE_MAX;
  const hit = rayToSegment(slotPoint(w.pose, slot), slotDirection(w.pose, slot), barrier);
  return hit === null ? DISTANCE_MAX : Math.min(DISTANCE_MAX, Math.round(hit));
}
