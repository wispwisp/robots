// The Blockly workspace with our toolbox, in the current language and theme. Blocks not attached to
// «при запуске» are greyed out (function definitions stand alone and stay active).
import DarkTheme from '@blockly/theme-dark';
import * as Blockly from 'blockly/core';
import { registerBlocks } from '../blocks/definitions';
import { applyBlocklyLocale } from '../blocks/locale';
import { installNameValidation } from '../blocks/names';
import { buildToolbox, registerToolboxCallbacks } from '../blocks/toolbox';
import { getLang } from '../i18n';

const MARGIN = 16; // between arranged blocks and the pane's edge

export interface BlocksPane {
  // Replaces the blocks without calling onChange. `arrange`: lay them out in a column (converted Python).
  // Throws when the blocks can't be loaded (e.g. a block type that no longer exists); the pane is then empty.
  load(json: object, arrange?: boolean): void;
  save(): object;
  workspace(): Blockly.WorkspaceSvg;
  setReadOnly(readOnly: boolean): void; // while a program runs
  // While the Python is ahead of the blocks (null: it isn't); `hint` is shown on the locked pane ('' for none).
  setSyncLock(hint: string | null): void;
  highlight(blockId: string | null): void;
  relocalize(): void;
  setDark(dark: boolean): void;
}

// onChange: the student changed the blocks.
export function createBlocksPane(parent: HTMLElement, onChange: () => void): BlocksPane {
  registerBlocks();
  installNameValidation();
  const el = document.createElement('div');
  el.className = 'blocks-pane';
  el.dataset.testid = 'blocks-pane';
  el.dataset.highlight = '';
  // The lock is a cover that takes every click while the blocks are read-only or locked by the sync.
  el.innerHTML = '<div class="blocks-host"></div><div class="blocks-lock" hidden><p class="blocks-lock-hint"></p></div>';
  parent.append(el);
  const host = el.querySelector<HTMLElement>('.blocks-host')!;
  const lock = el.querySelector<HTMLElement>('.blocks-lock')!;
  let readOnly = false;
  let syncHint: string | null = null;
  let dark = false;
  let ws = inject();
  // Also catches the screen being shown. While hidden, Blockly has no size and pins its view to the blocks'
  // corner, so a shown pane starts again from the workspace's own corner (the blocks keep their margin).
  let visible = false;
  new ResizeObserver(() => {
    const wasVisible = visible;
    visible = host.offsetWidth > 0;
    Blockly.svgResize(ws);
    if (visible && !wasVisible) ws.scroll(0, 0);
  }).observe(host);

  function inject(): Blockly.WorkspaceSvg {
    applyBlocklyLocale(getLang());
    const workspace = Blockly.inject(host, {
      toolbox: buildToolbox(),
      theme: dark ? DarkTheme : Blockly.Themes.Classic,
      media: 'vendor/blockly-media/', // copied from blockly/media, so nothing is fetched from the internet
      oneBasedIndex: false,
      comments: false, // a block comment would come back from Python as a note block
      trashcan: false, // blocks are deleted by dropping them on the toolbox
      zoom: { controls: true, wheel: true },
      move: { wheel: true }, // the wheel scrolls; Ctrl + wheel zooms
    });
    registerToolboxCallbacks(workspace);
    workspace.addChangeListener(Blockly.Events.disableOrphans);
    workspace.addChangeListener(event => { if (!event.isUiEvent) onChange(); });
    return workspace;
  }

  function load(json: object, arrange = false): void {
    Blockly.Events.disable();
    try {
      loadOrClear(json);
      if (arrange) {
        ws.cleanUp(); // a column from the top-left corner, in their order
        for (const block of ws.getTopBlocks()) block.moveBy(MARGIN, MARGIN);
      }
    } finally {
      Blockly.Events.enable();
    }
    ws.clearUndo(); // undoing must not bring back blocks from before the load
  }

  // Blockly's load, when it fails half-way, leaves its loading state set and some blocks created.
  function loadOrClear(json: object): void {
    const recordUndo = Blockly.Events.getRecordUndo();
    const group = Blockly.Events.getGroup();
    try {
      Blockly.serialization.workspaces.load(json, ws);
    } catch (error) {
      Blockly.Events.setRecordUndo(recordUndo);
      Blockly.Events.setGroup(group);
      Blockly.utils.dom.stopTextWidthCache();
      ws.setResizesEnabled(true);
      ws.clear();
      throw error;
    }
  }

  function updateLock(): void {
    const locked = readOnly || syncHint !== null;
    if (locked && lock.hidden) Blockly.hideChaff(); // closes an open flyout or dropdown
    lock.hidden = !locked;
    lock.firstElementChild!.textContent = readOnly ? '' : syncHint;
  }

  // The block is scrolled into view when it is outside it (the student can't scroll the locked pane during a run).
  function highlight(blockId: string | null): void {
    el.dataset.highlight = blockId ?? '';
    ws.highlightBlock(blockId);
    const block = blockId ? ws.getBlockById(blockId) : null;
    if (block) ws.scrollBoundsIntoView(block.getBoundingRectangleWithoutChildren());
  }

  return {
    load,
    save: () => Blockly.serialization.workspaces.save(ws),
    workspace: () => ws,
    setReadOnly(value) {
      readOnly = value;
      updateLock();
    },
    setSyncLock(hint) {
      syncHint = hint;
      updateLock();
    },
    highlight,
    // Blockly reads its texts when blocks are created, so a new language needs a new workspace.
    relocalize() {
      const json = Blockly.serialization.workspaces.save(ws);
      ws.dispose();
      ws = inject();
      load(json); // block ids are kept, so line-to-block maps stay valid
      highlight(el.dataset.highlight || null);
    },
    setDark(value) {
      if (value === dark) return;
      dark = value;
      ws.setTheme(dark ? DarkTheme : Blockly.Themes.Classic);
    },
  };
}
