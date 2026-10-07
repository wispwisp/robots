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
  load(json: object, arrange?: boolean): void;
  save(): object;
  workspace(): Blockly.WorkspaceSvg;
  setReadOnly(readOnly: boolean): void;
  highlight(blockId: string | null): void;
  relocalize(): void;
  setDark(dark: boolean): void;
  resize(): void;
}

// onChange: the student changed the blocks.
export function createBlocksPane(parent: HTMLElement, onChange: () => void): BlocksPane {
  registerBlocks();
  installNameValidation();
  const el = document.createElement('div');
  el.className = 'blocks-pane';
  el.dataset.testid = 'blocks-pane';
  el.dataset.highlight = '';
  // The lock is a transparent cover that takes every click while the blocks are read-only.
  el.innerHTML = '<div class="blocks-host"></div><div class="blocks-lock" hidden></div>';
  parent.append(el);
  const host = el.querySelector<HTMLElement>('.blocks-host')!;
  const lock = el.querySelector<HTMLElement>('.blocks-lock')!;
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
      Blockly.serialization.workspaces.load(json, ws);
      if (arrange) {
        ws.cleanUp(); // a column from the top-left corner, in their order
        for (const block of ws.getTopBlocks()) block.moveBy(MARGIN, MARGIN);
      }
    } finally {
      Blockly.Events.enable();
    }
    ws.clearUndo(); // undoing must not bring back blocks from before the load
  }

  function highlight(blockId: string | null): void {
    el.dataset.highlight = blockId ?? '';
    ws.highlightBlock(blockId);
  }

  return {
    load,
    save: () => Blockly.serialization.workspaces.save(ws),
    workspace: () => ws,
    setReadOnly(readOnly) {
      if (readOnly) Blockly.hideChaff(); // closes an open flyout or dropdown
      lock.hidden = !readOnly;
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
    resize: () => Blockly.svgResize(ws),
  };
}
