// Test helpers for the Python runner: a robot that records commands, and stepping a program.
import type { Program } from '../runner/program';
import { SensorError } from '../sim/sensors';

export function fakeIO(opts: { line?: boolean; throwOn?: string } = {}) {
  const io = {
    motorCalls: [] as [number, number][],
    printed: [] as string[],
    setMotors(left: number, right: number) { io.motorCalls.push([left, right]); },
    read(_fn: string, slot: string) {
      if (slot === opts.throwOn) throw new SensorError(slot, 'line');
      return opts.line ?? false;
    },
    print(text: string) { io.printed.push(text); },
  };
  return io;
}

// Advances until `steps` simulation steps are complete; an advance interrupted by Skulpt's time
// slice does not count. Bounded, so a program that never completes a step fails the test.
export async function run(p: Program, steps: number): Promise<void> {
  for (let done = 0, calls = 0; done < steps; calls++) {
    if (calls >= 100 * steps) throw new Error(`only ${done} of ${steps} steps completed in ${calls} advances`);
    if (await p.advance(1 / 60)) done++;
  }
}
