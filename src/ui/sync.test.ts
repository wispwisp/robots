import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { registerBlocks } from '../blocks/definitions';
import { applyBlocklyLocale } from '../blocks/locale';
import { createHeadlessWorkspace } from '../blocks/workspace';
import { setLang } from '../i18n';
import { DEFAULT_PYTHON } from '../storage';
import type { BlocksPane } from './blocksPane';
import type { EditorError, PythonEditor } from './pythonEditor';
import { CodeSync, type SavedProgram } from './sync';

beforeAll(() => { registerBlocks(); applyBlocklyLocale('ru'); });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); setLang('ru'); });

const LINE_FOLLOWER = 'from robot import *\n\nwhile True:\n    if line("front_left"):\n        motors(0, 50)\n';

// Saved blocks that the blocks pane can't load any more.
const STALE = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_old_move' }] } };

// Stand-ins for the two panes: a headless workspace, and the editor's text and error.
function setup() {
  const ws = createHeadlessWorkspace();
  const arranged: boolean[] = [];
  const pane = { lock: null as string | null };
  const blocks = {
    load(json: object, arrange = false) {
      if (json === STALE) throw new Error('Invalid block definition');
      Blockly.serialization.workspaces.load(json, ws);
      arranged.push(arrange);
    },
    save: () => Blockly.serialization.workspaces.save(ws),
    workspace: () => ws,
    setSyncLock: (hint: string | null) => { pane.lock = hint; },
  } as unknown as BlocksPane;
  const editor = { text: '', error: null as EditorError | null };
  const editorPane = {
    getText: () => editor.text,
    setText: (text: string) => { editor.text = text; },
    setError: (error: EditorError | null) => { editor.error = error; },
  } as unknown as PythonEditor;
  const sync = new CodeSync(blocks, editorPane);
  const states: SavedProgram[] = [];
  sync.onState(state => states.push(state));
  // The student types: the editor's text changes and it tells the sync.
  const type = (text: string) => { editor.text = text; sync.pythonChanged(); };
  const typeOf = (line: number) => ws.getBlockById(sync.lineToBlock.get(line)!)?.type;
  // A block edit: the stop block under «при запуске», then the pane's change callback.
  const addStop = () => {
    const stop = ws.newBlock('robot_stop');
    ws.getBlocksByType('robot_start')[0].nextConnection!.connect(stop.previousConnection!);
    sync.blocksChanged();
  };
  return { ws, sync, editor, pane, states, arranged, type, typeOf, addStop };
}

test('a new project gets its blocks from the Python', () => {
  const { ws, sync, editor, states } = setup();
  sync.load(DEFAULT_PYTHON, null);
  expect(ws.getTopBlocks().map(b => b.type)).toEqual(['robot_start']);
  expect(editor.text).toBe(DEFAULT_PYTHON);
  expect(sync.runBlocked).toBe(false);
  expect(states.at(-1)).toEqual({ python: DEFAULT_PYTHON, blocks: expect.any(Object) });
});

test('a Python edit is applied after the typing pause, with the converter line map', () => {
  const { ws, sync, editor, states, arranged, type, typeOf } = setup();
  sync.load(DEFAULT_PYTHON, null);
  type(LINE_FOLLOWER);
  expect(states.at(-1)!.python).toBe(LINE_FOLLOWER); // saved at once
  vi.advanceTimersByTime(499);
  expect(ws.getBlocksByType('robot_motors')).toHaveLength(0);
  vi.advanceTimersByTime(1);
  expect(ws.getBlocksByType('robot_motors')).toHaveLength(1);
  expect(arranged.at(-1)).toBe(true);
  expect(editor.text).toBe(LINE_FOLLOWER); // not rewritten
  expect([3, 4, 5].map(typeOf)).toEqual(['controls_forever', 'controls_if', 'robot_motors']);
});

test('flush applies a waiting edit at once and does nothing otherwise', () => {
  const { ws, sync, states, type } = setup();
  sync.load(DEFAULT_PYTHON, null);
  type('stop()\n');
  sync.flush();
  expect(ws.getBlocksByType('robot_stop')).toHaveLength(1);
  const reported = states.length;
  sync.flush();
  vi.runAllTimers();
  expect(states).toHaveLength(reported);
});

test('a syntax error blocks Run and keeps the blocks; fixing it clears the error', () => {
  const { ws, sync, editor, type } = setup();
  sync.load(LINE_FOLLOWER, null);
  type('from robot import *\n\nif x\n');
  sync.flush();
  expect(sync.runBlocked).toBe(true);
  expect(editor.error).toEqual({ line: 3, message: expect.stringContaining('Строка 3') });
  expect(ws.getBlocksByType('robot_motors')).toHaveLength(1);
  setLang('kk');
  expect(editor.error!.message).toContain('3-жол');
  type('stop()\n');
  sync.flush();
  expect(sync.runBlocked).toBe(false);
  expect(editor.error).toBeNull();
});

test('a block edit regenerates the Python with the generator line map', () => {
  const { sync, editor, pane, typeOf, addStop } = setup();
  sync.load(DEFAULT_PYTHON, null);
  expect(pane.lock).toBeNull();
  addStop();
  expect(editor.text).toBe('from robot import *\n\nstop()\n');
  expect(typeOf(3)).toBe('robot_stop');
});

test('while the Python is ahead of the blocks they are locked and never overwrite it (R18b)', () => {
  const { ws, sync, editor, pane, type, addStop } = setup();
  sync.load(DEFAULT_PYTHON, null);
  type('motors(1,2)\n');
  expect(pane.lock).toBe(''); // waiting for the typing pause: locked, no hint
  addStop();
  expect(editor.text).toBe('motors(1,2)\n');
  vi.runAllTimers();
  expect(pane.lock).toBeNull();
  expect(ws.getBlocksByType('robot_motors')).toHaveLength(1);
  expect(ws.getBlocksByType('robot_stop')).toHaveLength(0); // the typed Python won

  const broken = 'from robot import *\n\nif x\n';
  type(broken);
  sync.flush();
  expect(pane.lock).toContain('Исправь ошибку в Python');
  addStop();
  expect(editor.text).toBe(broken);
  setLang('kk');
  expect(pane.lock).toContain('қатені түзет');
  type('stop()\n');
  sync.flush();
  expect(pane.lock).toBeNull();
});

test('saved blocks that no longer load are rebuilt from the saved Python (R18a)', () => {
  const { ws, sync, editor, pane, states, typeOf } = setup();
  sync.load('from robot import *\n\nstop()\n', STALE);
  expect(editor.text).toBe('from robot import *\n\nstop()\n');
  expect(typeOf(3)).toBe('robot_stop');
  expect(states.at(-1)!.blocks).not.toEqual(STALE);

  sync.load('from robot import *\n\nif x\n', STALE); // and Python that doesn't parse either
  expect(ws.getTopBlocks().map(b => b.type)).toEqual(['robot_start']);
  expect(sync.runBlocked).toBe(true);
  expect(pane.lock).toContain('Исправь');
});

test('saved blocks are kept when the saved Python is their code, rebuilt when it was edited', () => {
  const first = setup();
  first.sync.load(LINE_FOLLOWER, null);
  first.ws.newBlock('robot_stop'); // a loose block: no code, but part of the saved work
  first.sync.blocksChanged();
  const saved = first.states.at(-1)!;

  const kept = setup();
  kept.sync.load(saved.python, saved.blocks);
  expect(kept.ws.getBlocksByType('robot_stop')).toHaveLength(1);
  expect(kept.typeOf(5)).toBe('robot_motors');

  const edited = setup();
  edited.sync.load('from robot import *\n\nstop()\n', saved.blocks);
  expect(edited.ws.getBlocksByType('robot_motors')).toHaveLength(0);
  expect(edited.typeOf(3)).toBe('robot_stop');
});
