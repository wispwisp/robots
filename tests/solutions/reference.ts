// The reference assembly and the Python solutions of the three tracks, shared by unit and e2e tests.
import { readFileSync } from 'node:fs';
import type { Assembly } from '../../src/robot/robot';
import type { TrackId } from '../../src/tracks/tracks';

export const REFERENCE_ASSEMBLY: Assembly = { front_left: 'line', front_right: 'line', front_center: 'distance', right: 'color' };

// Resolved next to this file, not from the working directory, so any test runner can use it.
export function readSolution(id: TrackId): string {
  return readFileSync(new URL(`./${id}.py`, import.meta.url), 'utf8');
}
