// Runs the student's Python on Skulpt in lock-step with the simulation: a simulation step lets the
// program run until its next robot command, or until it has read the sensors SENSOR_READS_PER_STEP
// times without one. Pure computation is cut into YIELD_MS slices so the page stays responsive; a
// slice ends an advance() without completing the step.
import type { SensorFunction } from '../sim/sensors';
import { SensorError } from '../sim/sensors';
import { toProgramError } from './errors';
import type { ProgramError } from './errors';
import { configureSkulpt, sk } from './sk';

export interface RobotIO {
  setMotors(left: number, right: number): void;
  read(fn: SensorFunction, slot: string): boolean | number | string;
  print(text: string): void; // a print's whole text, `end` included (usually a newline)
}

export type ProgramState = 'idle' | 'running' | 'finished' | 'error' | 'stopped';

export const YIELD_MS = 4; // Skulpt yieldLimit: pure Python computation is interrupted after this many ms
// A step ends after this many sensor reads without a command, so that a loop which only polls a
// sensor (`while distance("front_center") > 20: pass`) sees the world move. Counted, not timed,
// so every machine gives the same run.
export const SENSOR_READS_PER_STEP = 100;

const STEP = 'robot.step'; // suspension type that ends a step (a command, or the read limit)
const SENSORS: SensorFunction[] = ['line', 'brightness', 'distance', 'color'];

// Thrown from the suspension handler to abandon a stopped program without running more Python.
class StopSignal {}

// The data of a suspension that ends a step. Python continues with `result`, or `error` is raised.
interface StepEnd {
  type: typeof STEP;
  finish: () => unknown;
  result?: unknown;
  error?: unknown;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

export class Program {
  private _state: ProgramState = 'idle';
  private _line: number | null = null;
  private _error: ProgramError | null = null;
  private waitLeft = 0;
  private reads = 0;                   // sensor reads in the current step
  private stepEnd: StepEnd | null = null; // the robot call that ended the last step, finished by advance()
  private gate = deferred();           // opened to let Python continue from its current pause
  private pause = deferred<boolean>(); // resolved when Python pauses or the program ends: is the step complete?
  private sensorFailure: { error: SensorError; raised: unknown } | null = null;

  constructor(private readonly source: string, private readonly io: RobotIO) {}

  get state(): ProgramState { return this._state; }
  get line(): number | null { return this._line; }
  get error(): ProgramError | null { return this._error; }

  // Runs the program for a simulation step of dt seconds. Returns true when the step is complete: a
  // command was given, the read limit was reached, a wait() used up dt, or the program has ended.
  // Returns false when Python was only interrupted after YIELD_MS: no simulated time has passed,
  // and the next call continues the step.
  async advance(dt: number): Promise<boolean> {
    if (this._state === 'running' && this.waitLeft > 0) {
      this.waitLeft -= dt;
      if (this.waitLeft > 1e-9) return true;
      this.waitLeft = 0;
    }
    if (this._state !== 'idle' && this._state !== 'running') return true;
    this.pause = deferred<boolean>();
    if (this._state === 'idle') {
      this.start();
    } else {
      this.finishStepEnd();
      this.gate.resolve();
    }
    return this.pause.promise;
  }

  // Finishes the robot call that ended the last step (e.g. a read deferred by the read limit), now that
  // the world has moved on. It runs here, before Python resumes, because Skulpt times the resume:
  // a resume slower than YIELD_MS would make Skulpt yield there and lose the call's value.
  private finishStepEnd(): void {
    const end = this.stepEnd;
    this.stepEnd = null;
    if (!end) return;
    try {
      end.result = end.finish();
    } catch (e) {
      end.error = e;
    }
  }

  // Halts the program where it is paused; no more Python runs after this.
  stop(): void {
    if (this._state !== 'idle' && this._state !== 'running') return;
    this._state = 'stopped';
    this.gate.resolve();
    this.pause.resolve(true); // releases an advance() waiting on a real-time pause such as time.sleep
  }

  private start(): void {
    this._state = 'running';
    configureSkulpt({ output: () => {}, yieldLimit: YIELD_MS }); // print is our own built-in
    this.installBuiltins();
    sk().misceval.asyncToPromise(
      () => sk().importMainWithBody('<stdin>', false, this.source, true),
      { '*': (susp: any) => this.onSuspension(susp) },
    ).then(() => this.end('finished', null), (e: unknown) => this.end('error', e));
  }

  private end(state: 'finished' | 'error', e: unknown): void {
    if (this._state === 'running') { // a stopped program stays stopped
      this._state = state;
      if (state === 'error') {
        const failure = this.sensorFailure;
        this._error = toProgramError(e, this.source, failure && failure.raised === e ? failure.error : null);
      }
    }
    this.pause.resolve(true);
  }

  private onSuspension(susp: any): Promise<unknown> | null {
    this._line = stdinLine(susp) ?? this._line;
    if (this._state === 'stopped') throw new StopSignal();
    const type = susp.data.type;
    if (type === 'Sk.promise') { // e.g. time.sleep: waits in real time, not for the next step
      const settled = susp.data.promise.then(
        (v: unknown) => { susp.data.result = v; },
        (e: unknown) => { susp.data.error = e; },
      );
      return this.resumeAfter(settled, susp);
    }
    if (type !== STEP && type !== 'Sk.yield') return null;
    this.gate = deferred();
    this.pause.resolve(type === STEP); // after a yield the step is not complete yet
    return this.resumeAfter(this.gate.promise, susp);
  }

  // Continues Python once `ready` settles, unless the program has been stopped meanwhile.
  private resumeAfter(ready: Promise<unknown>, susp: any): Promise<unknown> {
    return ready.then(() => {
      if (this._state === 'stopped') throw new StopSignal();
      return susp.resume();
    });
  }

  // A robot command does its effect and ends the step.
  private command(effect: () => void): any {
    if (this._state !== 'stopped') effect();
    return this.endStep(() => sk().builtin.none.none$);
  }

  // Ends the step: Python pauses here until the next advance(), which calls `finish`; Python then
  // continues with its result, or its error is raised. resume() itself does no work (see finishStepEnd).
  private endStep(finish: () => unknown): any {
    this.reads = 0;
    const end: StepEnd = this.stepEnd = { type: STEP, finish };
    const susp = new (sk().misceval.Suspension)();
    susp.data = end;
    susp.resume = () => {
      if (end.error) throw end.error;
      return end.result;
    };
    return susp;
  }

  private read(fn: SensorFunction, slot: any): any {
    // Over the limit: end the step first, and read in the next one, which sees the world moved on.
    if (this.reads >= SENSOR_READS_PER_STEP) return this.endStep(() => this.read(fn, slot));
    this.reads++;
    const Sk = sk();
    try {
      return Sk.ffi.remapToPy(this.io.read(fn, new Sk.builtin.str(slot).v));
    } catch (e) {
      if (!(e instanceof SensorError)) throw e;
      const raised = new Sk.builtin.RuntimeError(e.message);
      this.sensorFailure = { error: e, raised };
      throw raised;
    }
  }

  private installBuiltins(): void {
    const Sk = sk();
    const builtin = (name: string, nargs: number, body: (...args: any[]) => any) =>
      new Sk.builtin.func((...args: any[]) => {
        Sk.builtin.pyCheckArgsLen(name, args.length, nargs, nargs);
        return body(...args);
      });
    Sk.builtins.motors = builtin('motors', 2, (l, r) =>
      this.command(() => this.io.setMotors(toNumber('motors', l), toNumber('motors', r))));
    Sk.builtins.stop = builtin('stop', 0, () => this.command(() => this.io.setMotors(0, 0)));
    Sk.builtins.wait = builtin('wait', 1, s => this.command(() => {
      const seconds = toNumber('wait', s);
      if (seconds < 0) throw new Sk.builtin.ValueError('wait() time must not be negative');
      this.waitLeft = seconds;
    }));
    // print(..., sep=" ", end="\n"): the output gets the whole text, which goes on the current line until a newline.
    const text = (name: string, value: any, otherwise: string): string => {
      if (value === Sk.builtin.none.none$) return otherwise;
      if (value instanceof Sk.builtin.str) return value.v;
      throw new Sk.builtin.TypeError(`${name} must be None or a string, not ${Sk.abstr.typeName(value)}`);
    };
    const print = (args: any[], kwargs?: any[]) => {
      const none = Sk.builtin.none.none$;
      const [sep, end] = Sk.abstr.copyKeywordsToNamedArgs('print', ['sep', 'end'], [], kwargs, [none, none]);
      const [sepText, endText] = [text('sep', sep, ' '), text('end', end, '\n')];
      return this.command(() => this.io.print(args.map(a => new Sk.builtin.str(a).v).join(sepText) + endText));
    };
    Sk.builtins.print = new Sk.builtin.func(Object.assign(print, { co_fastcall: true })); // called with (args, kwargs)
    for (const fn of SENSORS) Sk.builtins[fn] = builtin(fn, 1, slot => this.read(fn, slot));
  }
}

function toNumber(fn: string, x: any): number {
  const Sk = sk();
  if (!Sk.builtin.checkNumber(x)) throw new Sk.builtin.TypeError(`${fn}() needs a number, not '${Sk.abstr.typeName(x)}'`);
  const value = Number(Sk.ffi.remapToJs(x));
  if (!Number.isFinite(value)) throw new Sk.builtin.ValueError(`${fn}() needs a finite number, not ${value}`);
  return value;
}

// The line of the student's code where Python paused: the deepest frame from '<stdin>'.
function stdinLine(susp: any): number | null {
  let line = null;
  for (let s = susp; s; s = s.child) if (s.$filename?.includes('<stdin>')) line = s.$lineno;
  return line;
}
