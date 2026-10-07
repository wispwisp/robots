// What a downward-looking sensor sees at a point of the mat. No DOM.
import { distanceToPolyline, rectContains } from '../geometry';
import type { Point } from '../geometry';
import { MAT } from './tracks';
import type { Track } from './tracks';

export type ColorName = 'black' | 'white' | 'red' | 'green';

export const BRIGHTNESS: Record<ColorName, number> = { black: 10, white: 95, red: 55, green: 60 };

export function surfaceAt(track: Track, p: Point): { brightness: number; color: ColorName } {
  if (p.x < 0 || p.x > MAT.width || p.y < 0 || p.y > MAT.height) return { brightness: 0, color: 'black' };
  // Zones are painted over the line.
  if (track.redSquare && rectContains(track.redSquare, p)) return { brightness: BRIGHTNESS.red, color: 'red' };
  if (rectContains(track.finish, p)) return { brightness: BRIGHTNESS.green, color: 'green' };
  // The line edge is soft: fully black up to 0.75 cm from its centre, fully white from 1.25 cm.
  const d = distanceToPolyline(p, track.line);
  const coverage = Math.min(1, Math.max(0, (1.25 - d) / 0.5));
  return {
    brightness: Math.round(BRIGHTNESS.white - (BRIGHTNESS.white - BRIGHTNESS.black) * coverage),
    color: coverage >= 0.5 ? 'black' : 'white',
  };
}
