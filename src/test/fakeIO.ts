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

export async function run(p: Program, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) await p.advance(1 / 60);
}
