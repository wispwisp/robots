// One run: the student's program and the world, advanced together step by step. World time
// passes only on steps the program completes, so a run is the same on every machine. No DOM.
import type { Assembly } from '../robot/robot';
import { Program } from '../runner/program';
import type { Track } from '../tracks/tracks';
import { readSensor } from './sensors';
import { createWorld, DT, setMotors, stepWorld } from './world';
import type { Outcome, World } from './world';

export type RunOutcome = Outcome | 'programEnded' | 'programError' | 'stopped';

const OUTPUT_LINES = 5;

export class Session {
  readonly world: World;
  readonly program: Program;
  readonly output: string[] = []; // the last OUTPUT_LINES printed lines
  private _outcome: RunOutcome = 'running';

  constructor(track: Track, assembly: Assembly, source: string) {
    this.world = createWorld(track, assembly);
    this.program = new Program(source, {
      setMotors: (left, right) => setMotors(this.world, left, right),
      read: (fn, slot) => readSensor(this.world, fn, slot),
      print: text => {
        this.output.push(text);
        if (this.output.length > OUTPUT_LINES) this.output.shift();
      },
    });
  }

  get outcome(): RunOutcome { return this._outcome; }

  // A step whose Python was only interrupted by Skulpt's time slice is not complete: the world
  // stays as it is, and the next call continues the same step.
  async step(): Promise<void> {
    if (this._outcome !== 'running') return;
    const completed = await this.program.advance(DT);
    if (!completed) return;
    if (this._outcome !== 'running') return; // stopped while the program was paused, e.g. in time.sleep
    if (this.program.state === 'finished') return this.end('programEnded');
    if (this.program.state === 'error') return this.end('programError');
    stepWorld(this.world);
    if (this.world.outcome !== 'running') this.end(this.world.outcome);
  }

  stop(): void {
    if (this._outcome === 'running') this.end('stopped');
  }

  // Records what ended the run, halts the program and stops the motors.
  private end(outcome: RunOutcome): void {
    this._outcome = outcome;
    this.program.stop();
    if (this.world.outcome === 'running') setMotors(this.world, 0, 0); // an ended world has stopped them itself
  }
}
