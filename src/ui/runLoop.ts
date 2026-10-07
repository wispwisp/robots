// Paces a run to real time: each animation frame runs the simulation steps owed since the last frame, at most
// MAX_STEPS_PER_FRAME of them (a slow laptop slows the run down instead of skipping steps), then shows the frame.
import type { Session } from '../sim/session';
import { DT } from '../sim/world';

const MAX_STEPS_PER_FRAME = 4;

export function startRunLoop(session: Session, onFrame: () => void): { stop(): void } {
  let stopped = false;
  let last: number | null = null;
  let owed = 0; // simulated seconds the run is behind real time
  let frame = requestAnimationFrame(tick);

  async function tick(now: number): Promise<void> {
    // Capped, so time lost to a slow laptop (or to Python computing without commands) is not made up in a rush.
    owed = Math.min(owed + (last === null ? DT : (now - last) / 1000), MAX_STEPS_PER_FRAME * DT);
    last = now;
    // Half a step of slack: frame times that land a hair under DT still give one step per frame.
    for (let i = 0; i < MAX_STEPS_PER_FRAME && owed > DT / 2 && session.outcome === 'running'; i++) {
      const time = session.world.time;
      await session.step(); // not re-entrant: each step finishes before the next
      if (stopped) return;
      if (session.world.time === time) break; // Python was cut short before a command: the page gets the rest
      owed -= DT;
    }
    onFrame();
    if (!stopped && session.outcome === 'running') frame = requestAnimationFrame(tick);
  }

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
