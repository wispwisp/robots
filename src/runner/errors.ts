// Turns whatever stopped a Python program into a plain description the UI can translate.
import type { SensorType } from '../robot/robot';
import type { SensorError } from '../sim/sensors';

export type ErrorKind = 'SyntaxError' | 'IndentationError' | 'NonLatinName' | 'NameError' | 'TypeError'
  | 'ValueError' | 'ZeroDivisionError' | 'IndexError' | 'SensorError' | 'Other';

export interface ProgramError {
  kind: ErrorKind;
  line: number | null;
  message: string;           // Python's original English text
  name?: string;             // the missing name, for NameError
  slot?: string;
  needed?: SensorType | null;
}

const PYTHON_KINDS: string[] = ['SyntaxError', 'IndentationError', 'NameError', 'TypeError', 'ValueError',
  'ZeroDivisionError', 'IndexError'];

// e is a Skulpt exception; sensorError is set when e was raised for that sensor error.
export function toProgramError(e: unknown, source: string, sensorError: SensorError | null): ProgramError {
  const err = e as any;
  const line: number | null = err?.traceback?.[0]?.lineno ?? null;
  const message = String(err?.args?.v?.[0]?.v ?? err?.message ?? e);
  if (sensorError) return { kind: 'SensorError', line, message, slot: sensorError.slot, needed: sensorError.needed };
  const type: string = err?.tp$name ?? '';
  if (type === 'SyntaxError' && line !== null && hasNonLatinLetter(source.split('\n')[line - 1] ?? '')) {
    return { kind: 'NonLatinName', line, message };
  }
  if (type === 'SyntaxError' && line !== null && isIndentationMistake(message, source.split('\n'), line)) {
    return { kind: 'IndentationError', line, message };
  }
  if (type === 'NameError') return { kind: 'NameError', line, message, name: /'(.*)'/.exec(message)?.[1] };
  return { kind: PYTHON_KINDS.includes(type) ? type as ErrorKind : 'Other', line, message };
}

// Skulpt 1.2.0 reports indentation mistakes as a SyntaxError: "unindent does not match …", or a bare "bad input"
// for an unexpected indent and for a missing indented block. A "bad input" is taken for one when its line is
// indented deeper than the code line before it although that line doesn't end with `:`, or when that line ends
// with `:` and this one isn't indented deeper.
function isIndentationMistake(message: string, lines: string[], line: number): boolean {
  if (message.includes('indent')) return true;
  if (message !== 'bad input') return false;
  let before = line - 1;
  while (before >= 1 && /^\s*(#|$)/.test(lines[before - 1])) before--; // blank and comment lines don't count
  if (before < 1) return false;
  const opensBlock = lines[before - 1].replace(/\s*#[^"']*$/, '').trimEnd().endsWith(':'); // a comment without quotes is cut
  const deeper = indentOf(lines[line - 1] ?? '') > indentOf(lines[before - 1]);
  return opensBlock !== deeper;
}

const indentOf = (line: string) => line.length - line.trimStart().length;

// Skulpt 1.2.0 rejects non-Latin letters in names with a bare "bad token" syntax error.
// Letters inside strings and comments are fine, so they are skipped.
function hasNonLatinLetter(line: string): boolean {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '#') {
      return false;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c > '\x7f' && /\p{L}/u.test(c)) {
      return true;
    }
  }
  return false;
}
