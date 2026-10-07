import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadState, newProject, saveState } from './storage';

// A Map-backed stand-in for the browser's localStorage.
let fake: Map<string, string>;
beforeEach(() => {
  fake = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => fake.get(k) ?? null,
    setItem: (k: string, v: string) => { fake.set(k, v); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

// As in Chrome with site data blocked: even reading `localStorage` throws.
function makeStorageThrow(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
}

test('round trip', () => { const s = newProject('ru', null); saveState(s); expect(loadState()).toEqual(s); });
test('corrupt json → null', () => { fake.set('robo-trassa:v1', '{oops'); expect(loadState()).toBeNull(); });
test('old version → null', () => { fake.set('robo-trassa:v1', JSON.stringify({ v: 0 })); expect(loadState()).toBeNull(); });
test('throwing storage → null, save does not throw', () => { makeStorageThrow(); expect(loadState()).toBeNull(); expect(() => saveState(newProject('ru', null))).not.toThrow(); });

test('missing → null', () => expect(loadState()).toBeNull());
test('JSON that is not an object → null', () => { fake.set('robo-trassa:v1', 'null'); expect(loadState()).toBeNull(); });
test('new project', () => expect(newProject('kk', 'dark')).toEqual({
  v: 1, lang: 'kk', theme: 'dark', step: 'assembly', trackId: 'first_steps', assembly: {}, python: 'from robot import *\n', blocks: null,
}));
