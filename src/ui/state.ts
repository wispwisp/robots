// The app state: loaded from storage at start (or a new project), saved 300 ms after the last change.
import { loadState, newProject, saveState, type SavedState } from '../storage';

let state: SavedState = loadState() ?? newProject('ru', null);
const listeners = new Set<(s: SavedState) => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function getState(): SavedState {
  return state;
}

export function update(patch: Partial<SavedState>): void {
  state = { ...state, ...patch };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn: (s: SavedState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function save(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saveState(state);
}

// A reload or a closed tab within the 300 ms must not lose the last change. Only a pending change is
// written, so closing an idle second tab doesn't overwrite newer work saved by another tab.
addEventListener('pagehide', () => { if (saveTimer !== undefined) save(); });
