// Separates frames that measure the device from frames that don't, for every
// fps governor. A frame counts only while the page is visible and focused,
// the frame rate is not capped by the browser, and the first second after any
// pause has passed. The renderer keeps rendering while unfocused; only the
// counting stops. Pure class plus a thin DOM reader.

export type FrameMode = 'active' | 'background';
export type BackgroundReason = 'hidden' | 'unfocused' | 'throttled' | 'settling';

export interface FrameEnv {
  hidden: boolean;
  focused: boolean;
}

export interface FrameClassification {
  mode: FrameMode;
  reason: BackgroundReason | null;
  /** True on every edge between active and background, so callers can reset their governors. */
  resumed: boolean;
}

/** A single frame interval longer than this is a resumed or stalled frame, not a frame rate. */
export const GAP_MS = 250;
export const SETTLE_MS = 1000;
/** Throttle heuristic: this many intervals ... */
export const THROTTLE_WINDOW = 30;
/** ... with a mean in this band (a 30 fps cap; a steady slower rate is a slow device, not a cap) ... */
export const THROTTLE_MIN_MEAN_MS = 30;
export const THROTTLE_MAX_MEAN_MS = 36;
/** ... and a standard deviation below this look like a browser frame cap. */
export const THROTTLE_MAX_STDDEV_MS = 1.5;

export class FrameActivity {
  private recent: number[] = [];
  private settledMs = SETTLE_MS;
  private previous: FrameMode = 'active';

  classify(frameMs: number, env: FrameEnv): FrameClassification {
    const reason = this.reasonFor(frameMs, env);
    const mode: FrameMode = reason ? 'background' : 'active';
    const resumed = mode !== this.previous;
    this.previous = mode;
    return { mode, reason, resumed };
  }

  private reasonFor(frameMs: number, env: FrameEnv): BackgroundReason | null {
    if (env.hidden) return this.enterBackground('hidden');
    if (!env.focused) return this.enterBackground('unfocused');
    if (frameMs > GAP_MS) return this.enterBackground('settling');

    this.recent.push(frameMs);
    if (this.recent.length > THROTTLE_WINDOW) this.recent.shift();
    if (this.looksThrottled()) {
      this.settledMs = 0;
      return 'throttled';
    }
    if (this.settledMs < SETTLE_MS) {
      this.settledMs += frameMs;
      return 'settling';
    }
    return null;
  }

  private enterBackground(reason: BackgroundReason): BackgroundReason {
    this.recent = [];
    this.settledMs = 0;
    return reason;
  }

  private looksThrottled(): boolean {
    if (this.recent.length < THROTTLE_WINDOW) return false;
    const mean = this.recent.reduce((sum, ms) => sum + ms, 0) / this.recent.length;
    if (mean < THROTTLE_MIN_MEAN_MS || mean > THROTTLE_MAX_MEAN_MS) return false;
    const variance = this.recent.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / this.recent.length;
    return Math.sqrt(variance) < THROTTLE_MAX_STDDEV_MS;
  }
}

/** The page's current visibility and focus. */
export function readFrameEnv(): FrameEnv {
  return { hidden: document.hidden, focused: document.hasFocus() };
}
