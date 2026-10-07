// Step 2, the program (layout option C): the blocks above their Python on the left, the track on the right.
import { onLangChange, t, type UiKey } from '../i18n';
import { createBlocksPane } from './blocksPane';
import { createPythonEditor } from './pythonEditor';
import { getState, subscribe, update } from './state';
import { CodeSync, type ProgramState } from './sync';
import { currentTheme, onThemeChange } from './theme';

export function renderProgramScreen(root: HTMLElement): void {
  const code = root.querySelector<HTMLElement>('.program-code')!;
  code.innerHTML = `
    <div class="pane"><h2 class="pane-title" data-text="blocksTitle"></h2></div>
    <div class="pane"><h2 class="pane-title" data-text="pythonTitle"></h2></div>`;
  const [blocksBox, pythonBox] = code.querySelectorAll<HTMLElement>('.pane');

  // The panes report the student's edits to the sync, which is created right after them.
  const blocks = createBlocksPane(blocksBox, () => sync.blocksChanged());
  const editor = createPythonEditor(pythonBox, () => sync.pythonChanged());
  const sync = new CodeSync(blocks, editor);

  const applyTheme = () => {
    const dark = currentTheme() === 'dark';
    blocks.setDark(dark);
    editor.setDark(dark);
  };
  applyTheme();
  onThemeChange(applyTheme);

  const translate = () => {
    for (const e of code.querySelectorAll<HTMLElement>('[data-text]')) e.textContent = t(e.dataset.text as UiKey);
  };
  translate();
  onLangChange(() => {
    translate();
    blocks.relocalize();
  });

  // The program saved last; any other program in the state (a new project) is loaded into the editors.
  // Loaded last, so the screen is fully set up whatever the saved program holds.
  let saved: ProgramState | null = null;
  sync.onState(state => {
    saved = state;
    update(state);
  });
  const loadProgram = () => {
    const { python, blocks: json } = getState();
    if (python !== saved?.python || json !== saved?.blocks) sync.load(python, json);
  };
  subscribe(loadProgram);
  loadProgram();
}
