import { vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

/**
 * Moves fake time forward in one synchronous sweep, then lets Vue render once.
 *
 * `vi.advanceTimersByTimeAsync` yields to the real event loop after every timer it fires. A component with a running
 * `requestAnimationFrame` loop (the intro's playhead) has a timer every 16 ms, so advancing a whole intro run (~45 s)
 * that way costs ~2,800 real event-loop turns: ~1.5 s alone, and past the 5 s test timeout on a loaded full run.
 * Use this for long stretches where the test only checks where the run ends up, not what renders on the way: timers
 * still fire in order, but Vue watchers and renders run once, after the sweep.
 */
export async function advanceAndRender(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await flushPromises();
}
