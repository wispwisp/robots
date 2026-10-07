// Keeps the blocks and their Python in step.
// - Blocks edited: the Python is regenerated at once (a Python edit still waiting is dropped).
// - Python edited: 0.5 s after typing stops, the blocks are rebuilt if the text parses. Otherwise the error is
//   shown on its line, the blocks keep their last good state and Run stays blocked until it is fixed.
// The Python text is never rewritten while the student types. lineToBlock always describes the text in the
// editor: the generator's map after a block edit, the converter's after a Python edit.
import { pythonToBlocks } from '../blocks/fromPython';
import { blocksToPython } from '../blocks/toPython';
import { formatProgramError, onLangChange } from '../i18n';
import type { ProgramError } from '../runner/errors';
import type { BlocksPane } from './blocksPane';
import type { PythonEditor } from './pythonEditor';

export interface ProgramState { python: string; blocks: object }

const TYPING_PAUSE_MS = 500;
// Only «при запуске»: the blocks of a new program whose Python can't be read.
const START_ONLY = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 0, y: 0 }] } };

export class CodeSync {
  private map = new Map<number, string>();
  private error: ProgramError | null = null;
  private pending: ReturnType<typeof setTimeout> | undefined; // a Python edit waiting for the typing pause
  private readonly listeners = new Set<(state: ProgramState) => void>();

  constructor(private readonly blocks: BlocksPane, private readonly editor: PythonEditor) {
    onLangChange(() => this.showError());
  }

  get lineToBlock(): ReadonlyMap<number, string> {
    return this.map;
  }

  get runBlocked(): boolean {
    return this.error !== null;
  }

  // Called with the program to save after every change.
  onState(cb: (state: ProgramState) => void): void {
    this.listeners.add(cb);
  }

  // A saved program; without blocks (a new project) the blocks are built from the Python.
  load(python: string, blocks: object | null): void {
    this.cancelPending();
    this.editor.setText(python);
    this.blocks.load(blocks ?? START_ONLY);
    // The saved Python is the blocks' own code unless the last edit was made in Python.
    const generated = blocksToPython(this.blocks.workspace());
    if (blocks && generated.code === python) this.settle(generated.lineToBlock, null);
    else this.convert();
  }

  blocksChanged(): void {
    this.cancelPending();
    const { code, lineToBlock } = blocksToPython(this.blocks.workspace());
    this.editor.setText(code);
    this.settle(lineToBlock, null);
  }

  pythonChanged(): void {
    this.cancelPending();
    this.pending = setTimeout(() => this.flush(), TYPING_PAUSE_MS);
    this.report(); // the text is saved even before the pause
  }

  // Applies a Python edit still waiting for the typing pause (Run calls this first).
  flush(): void {
    if (this.pending === undefined) return;
    this.cancelPending();
    this.convert();
  }

  private convert(): void {
    const result = pythonToBlocks(this.editor.getText());
    if (result.ok) {
      this.blocks.load(result.blocks, true);
      this.settle(result.lineToBlock, null);
    } else {
      this.settle(new Map(), result.error); // the blocks stay as they were
    }
  }

  private settle(lineToBlock: Map<number, string>, error: ProgramError | null): void {
    this.map = lineToBlock;
    this.error = error;
    this.showError();
    this.report();
  }

  private showError(): void {
    this.editor.setError(this.error && { line: this.error.line, message: formatProgramError(this.error) });
  }

  private report(): void {
    const state = { python: this.editor.getText(), blocks: this.blocks.save() };
    for (const cb of this.listeners) cb(state);
  }

  private cancelPending(): void {
    clearTimeout(this.pending);
    this.pending = undefined;
  }
}
