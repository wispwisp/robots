// The project saved in the browser (localStorage). Broken or blocked storage never stops the app:
// loading then gives null (the app starts a new project) and saving is skipped.
import type { Lang } from './i18n';
import type { Assembly } from './robot/robot';
import type { TrackId } from './tracks/tracks';

export interface SavedState {
  v: 1;
  lang: Lang;
  theme: 'light' | 'dark' | null; // null: follow the operating system
  step: 'assembly' | 'program';
  trackId: TrackId;
  assembly: Assembly;
  python: string;
  blocks: object | null; // Blockly workspace JSON; null: build the blocks from `python`
}

const KEY = 'robo-trassa:v1';
export const DEFAULT_PYTHON = 'from robot import *\n';

export function newProject(lang: Lang, theme: SavedState['theme']): SavedState {
  return { v: 1, lang, theme, step: 'assembly', trackId: 'first_steps', assembly: {}, python: DEFAULT_PYTHON, blocks: null };
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const s = JSON.parse(raw);
    return s?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveState(s: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // full or blocked storage: the work stays on screen, it just isn't kept after a reload
  }
}
