// Keeps the render loop from monopolising the main thread.
//
// Pixi renders from a requestAnimationFrame loop. On a device whose frames
// cost more than a vsync interval (no GPU, a weak integrated one, a busy
// machine - the settlement view's water and fog passes are full-viewport
// fragment work) the next frame is due the moment the last one ends, so the
// main thread never goes idle. Everything else that needs it then waits for
// the loop: pointer and keyboard events, timers, DevTools protocol calls.
// Measured on a software-rendered 1280x720 view (~300 ms a frame): a no-op
// `page.evaluate` took ~1 s, a mouse move ~1 s per step; the same page with
// the loop paced to leave a gap between frames answered in ~60 ms. For a
// player that is input lag of a second or more on top of an already low frame
// rate; for the Playwright specs it multiplied every round trip until a
// ring-menu spec could not finish inside its budget.
//
// So a frame that is expensive earns the loop a pause: when the smoothed cost
// of a frame is above `PACE_ABOVE_MS` the ticker is capped so that each frame
// is followed by a gap of `GAP_SHARE` of its own cost. A device that holds
// the frame budget never sees this (the cap stays off), and one that cannot
// loses almost no smoothness - it was already drawing a handful of frames a
// second - while input stays responsive between them. It reacts to the
// measured cost only; nothing here knows what is running the page.

/** Smoothed frame cost above which the loop is paced: such a frame cannot reach 20 fps anyway. */
export const PACE_ABOVE_MS = 50;
/** Smoothed frame cost below which the pacing is lifted again (hysteresis, so the cap does not flap). */
export const PACE_BELOW_MS = 35;
/** The idle gap left after a paced frame, as a share of the frame's own cost. */
export const GAP_SHARE = 0.6;
/** Weight of the newest frame in the smoothed cost. */
const SMOOTHING = 0.1;

/** The slice of Pixi's Ticker this needs, so it can be driven without a canvas. */
export interface PacedTicker {
  maxFPS: number;
  minFPS: number;
  add(fn: () => void, context?: unknown, priority?: number): unknown;
  remove(fn: () => void, context?: unknown): unknown;
}

/** Pure pacing decision: feed it each frame's cost, read back the cap to apply. */
export class FramePacer {
  private smoothedMs = 0;
  private paced = false;

  /** Records one frame's cost (ms of main-thread work, render included) and returns the `maxFPS` to apply: 0 is uncapped. */
  record(frameMs: number): number {
    this.smoothedMs = this.smoothedMs === 0 ? frameMs : this.smoothedMs + (frameMs - this.smoothedMs) * SMOOTHING;
    if (!this.paced && this.smoothedMs > PACE_ABOVE_MS) this.paced = true;
    else if (this.paced && this.smoothedMs < PACE_BELOW_MS) this.paced = false;
    return this.paced ? 1000 / (this.smoothedMs * (1 + GAP_SHARE)) : 0;
  }

  /** Forgets what it has measured (the tab came back from being hidden, say), so a stale cost does not pace the first frames. */
  reset(): void {
    this.smoothedMs = 0;
    this.paced = false;
  }
}

/** Pixi's `UPDATE_PRIORITY` values this relies on: the render runs at LOW, so HIGH starts a frame's clock and UTILITY (after the render) stops it. */
const FIRST = 25;
const LAST = -50;
/** A longer gap than this is a hidden tab or a debugger pause, not a frame. */
const MAX_FRAME_MS = 1000;

export interface PacingEnv {
  now(): number;
  requestFrame(fn: (frameStart: number) => void): number;
  cancelFrame(id: number): void;
}

const browserEnv: PacingEnv = {
  now: () => performance.now(),
  requestFrame: (fn) => requestAnimationFrame(fn),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

/**
 * Paces `ticker` by the measured cost of its frames. Returns the function that
 * stops pacing and lifts the cap.
 *
 * A frame's cost is not the time its listeners take: handing a frame to a slow
 * rasteriser costs the JS a few milliseconds, and the main thread then sits
 * blocked until the browser can start the next frame (measured: ~3 ms of
 * ticker work in a ~300 ms frame). So the cost is the ticker work plus the wait
 * from its end to the start of the next animation frame the browser delivers - which is a
 * vsync away on a device that keeps up, and the whole stall on one that does not.
 */
export function attachFramePacing(ticker: PacedTicker, env: PacingEnv = browserEnv): () => void {
  const pacer = new FramePacer();
  // Pixi keeps `minFPS` (which caps a frame's `deltaMS`) at or below `maxFPS`, and its two setters call each other to do it: a
  // `maxFPS` below `minFPS` lowers `minFPS`, which can raise `maxFPS` again when the old one rounds down (its getter rounds), and
  // a fractional cap can leave them chasing float rounding until the stack runs out. So a cap is applied with the cap lifted, the
  // floor moved well under it, and only then the cap - no setter finds anything to reconcile. The floor goes back when the cap does.
  const minFPS = ticker.minFPS;
  const apply = (cap: number) => {
    ticker.maxFPS = 0;
    if (cap === 0) {
      ticker.minFPS = minFPS;
      return;
    }
    ticker.minFPS = Math.min(minFPS, cap / 2);
    ticker.maxFPS = cap;
  };
  let startedAt = 0;
  let workMs = 0;
  let endedAt = -1;
  let raf = 0;
  const watch = (frameStart: number) => {
    raf = env.requestFrame(watch);
    // Only the first frame that starts after a render ended is that render's wait: the frame the render ran in started before it
    // ended, and the frames after that are ticks the cap skips.
    if (endedAt < 0 || frameStart <= endedAt) return;
    const cost = Math.min(MAX_FRAME_MS, workMs + (frameStart - endedAt));
    endedAt = -1;
    apply(pacer.record(cost));
  };
  const begin = () => {
    startedAt = env.now();
    // Pixi asks for its next animation frame after its listeners have run, so asking from in here puts this watcher ahead of it:
    // it sees the new frame's start before the tick that frame runs can overwrite the render it is waiting to measure.
    env.cancelFrame(raf);
    raf = env.requestFrame(watch);
  };
  const end = () => {
    endedAt = env.now();
    workMs = endedAt - startedAt;
  };
  ticker.add(begin, undefined, FIRST);
  ticker.add(end, undefined, LAST);
  raf = env.requestFrame(watch);
  return () => {
    env.cancelFrame(raf);
    ticker.remove(begin);
    ticker.remove(end);
    apply(0);
  };
}
