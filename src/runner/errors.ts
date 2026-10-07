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
  if (type === 'NameError') return { kind: 'NameError', line, message, name: /'(.*)'/.exec(message)?.[1] };
  return { kind: PYTHON_KINDS.includes(type) ? type as ErrorKind : 'Other', line, message };
}

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
