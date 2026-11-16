import { vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

/**
 * Moves fake time forward in one synchronous sweep, then lets Vue render once.
 *
 * `vi.advanceTimersByTimeAsync` yields to the real event loop after every timer it fires. A component with a running
 * `requestAnimationFrame` loop (the intro's playhead) has a timer every 16 ms, so advancing a whole intro run (~45 s)
 * that way costs ~2,800 real event-loop turns: ~1.5 s alone, and past the 5 s test timeout on a loaded full run.
 * Use this for long stretches where the test only checks where the run ends up, not what renders on the way: timers
 * still fire in order, but Vue watchers and renders run once, after the sweep. Two consequences:
 * - an event a watcher emits (e.g. on a phase change) only sees the state at the sweep's end, so "never emits X" across
 *   a sweep cannot catch a state the run passes through; stop the sweep in that state to check it
 * - a timer a watcher would schedule mid-sweep is only created after it, at the sweep's end time
 */
export async function advanceAndRender(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await flushPromises();
}
