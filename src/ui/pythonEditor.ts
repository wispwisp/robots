// The Python editor (CodeMirror): the error underlined on its line and written below the editor,
// and the line being run highlighted.
import { python } from '@codemirror/lang-python';
import { setDiagnostics } from '@codemirror/lint';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { basicSetup, EditorView } from 'codemirror';

export interface EditorError { line: number | null; message: string }

export interface PythonEditor {
  getText(): string;
  setText(text: string): void; // doesn't call onChange
  setReadOnly(readOnly: boolean): void;
  setError(error: EditorError | null): void;
  highlightLine(line: number | null): void;
  setDark(dark: boolean): void;
}

const setRunLine = StateEffect.define<number | null>();

// The line being run, drawn with the class cm-run-line.
const runLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setRunLine)) continue;
      const line = effect.value;
      if (line === null || line < 1 || line > tr.state.doc.lines) return Decoration.none;
      return Decoration.set(Decoration.line({ class: 'cm-run-line' }).range(tr.state.doc.line(line).from));
    }
    return decorations.map(tr.changes);
  },
  provide: field => EditorView.decorations.from(field),
});

const editable = (on: boolean) => [EditorState.readOnly.of(!on), EditorView.editable.of(on)];

// onChange: the student changed the text.
export function createPythonEditor(parent: HTMLElement, onChange: (text: string) => void): PythonEditor {
  const theme = new Compartment();
  const access = new Compartment();
  let settingText = false;
  const view = new EditorView({
    parent,
    extensions: [
      basicSetup,
      python(),
      runLine,
      theme.of([]),
      access.of(editable(true)),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !settingText) onChange(update.state.doc.toString());
      }),
    ],
  });
  view.dom.dataset.testid = 'python-editor';
  const errorText = document.createElement('p');
  errorText.className = 'python-error';
  errorText.dataset.testid = 'python-error';
  errorText.hidden = true;
  parent.append(errorText);

  return {
    getText: () => view.state.doc.toString(),
    setText(text) {
      if (text === view.state.doc.toString()) return;
      settingText = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      } finally {
        settingText = false;
      }
    },
    setReadOnly: readOnly => view.dispatch({ effects: access.reconfigure(editable(!readOnly)) }),
    setError(error) {
      errorText.hidden = !error;
      errorText.textContent = error?.message ?? '';
      const { doc } = view.state;
      const at = error?.line ? doc.line(Math.min(error.line, doc.lines)) : null;
      const diagnostics = at ? [{ from: at.from, to: at.to, severity: 'error' as const, message: error!.message }] : [];
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    // The line is scrolled into view (only as far as needed), so the student can follow the run.
    highlightLine(line) {
      const { doc } = view.state;
      const shown = line !== null && line >= 1 && line <= doc.lines;
      const scroll = shown ? [EditorView.scrollIntoView(doc.line(line).from, { y: 'nearest' })] : [];
      view.dispatch({ effects: [setRunLine.of(line), ...scroll] });
    },
    setDark: dark => view.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) }),
  };
}
