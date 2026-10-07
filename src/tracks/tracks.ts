// The mat and the three tracks (centimetres, x right, y down). Display names come from i18n, keyed by id.
import { smoothPath } from '../geometry';
import type { Point, Rect, Segment } from '../geometry';
import type { Pose } from '../robot/robot';

export const MAT = { width: 200, height: 120, lineWidth: 2 } as const;

export type TrackId = 'first_steps' | 'barrier' | 'colors';

export interface Track {
  id: TrackId;
  line: Point[]; // smoothed line centre
  start: Pose;
  startBox: Rect;
  finish: Rect;
  barrier?: Segment;
  redSquare?: Rect;
}

const SAMPLES_PER_SEGMENT = 12;

function makeTrack(t: Omit<Track, 'line'> & { controlPoints: [number, number][] }): Track {
  const { controlPoints, ...rest } = t;
  return { ...rest, line: smoothPath(controlPoints.map(([x, y]) => ({ x, y })), SAMPLES_PER_SEGMENT) };
}

export const TRACKS: readonly Track[] = [
  makeTrack({
    id: 'first_steps',
    controlPoints: [[15, 95], [45, 95], [75, 85], [100, 60], [125, 45], [155, 50], [185, 60]],
    start: { x: 25, y: 95, heading: 0 },
    startBox: { x: 14, y: 84, w: 22, h: 22 },
    finish: { x: 170, y: 48, w: 24, h: 24 },
  }),
  makeTrack({
    id: 'barrier',
    controlPoints: [[15, 25], [55, 25], [80, 40], [80, 65], [60, 85], [75, 100], [110, 100], [150, 100], [185, 100]],
    start: { x: 25, y: 25, heading: 0 },
    startBox: { x: 14, y: 14, w: 22, h: 22 },
    finish: { x: 170, y: 88, w: 24, h: 24 },
    barrier: { a: { x: 135, y: 90 }, b: { x: 135, y: 110 } },
  }),
  makeTrack({
    id: 'colors',
    controlPoints: [[15, 100], [50, 100], [72, 88], [74, 64], [76, 42], [82, 29], [94, 24], [112, 24], [130, 24], [150, 24], [168, 38], [178, 62], [182, 90]],
    start: { x: 25, y: 100, heading: 0 },
    startBox: { x: 14, y: 89, w: 22, h: 22 },
    finish: { x: 170, y: 86, w: 24, h: 24 },
    redSquare: { x: 121, y: 14, w: 20, h: 20 },
    barrier: { a: { x: 168, y: 70 }, b: { x: 192, y: 70 } },
  }),
];

export function getTrack(id: TrackId): Track {
  const track = TRACKS.find(t => t.id === id);
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
}
