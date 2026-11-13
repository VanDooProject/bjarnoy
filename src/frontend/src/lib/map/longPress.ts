// Long press: a press held still for LONG_PRESS_MS. One tracker for every surface that needs it (the map canvas, the ring's
// Upgrade bubble), so the timing and the "moved too far = it is a pan, not a press" rule exist once. DOM-free: the caller feeds it
// pointer positions and the tracker owns only the timer, so fake timers drive it in tests.

/** How long a press has to be held to count as a long press. */
export const LONG_PRESS_MS = 500;

/** How far (CSS px) a held press may drift before it stops being a press: the same slop a map tap gets. */
export const LONG_PRESS_SLOP_PX = 6;

export interface Point {
  x: number;
  y: number;
}

export interface LongPressCallbacks {
  /** The hold began at `at`. */
  onStart?: (at: Point) => void;
  /** The hold ended without firing (released, moved off, cancelled). */
  onCancel?: () => void;
  /** The hold completed. `onCancel` does not follow it. */
  onFire: (at: Point) => void;
}

export class LongPressTracker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin: Point | null = null;

  private readonly callbacks: LongPressCallbacks;
  private readonly options: { ms?: number; slopPx?: number };

  constructor(callbacks: LongPressCallbacks, options: { ms?: number; slopPx?: number } = {}) {
    this.callbacks = callbacks;
    this.options = options;
  }

  /** Whether a hold is running right now. */
  get holding(): boolean {
    return this.origin !== null;
  }

  /** Starts a hold at `at`; one already running is dropped first. */
  start(at: Point): void {
    this.cancel();
    this.origin = at;
    this.callbacks.onStart?.(at);
    this.timer = setTimeout(() => {
      const origin = this.origin;
      this.timer = null;
      this.origin = null;
      if (origin) this.callbacks.onFire(origin);
    }, this.options.ms ?? LONG_PRESS_MS);
  }

  /** The pointer moved to `to`: past the slop the press is a drag, so the hold is cancelled. */
  move(to: Point): void {
    if (!this.origin) return;
    const slop = this.options.slopPx ?? LONG_PRESS_SLOP_PX;
    if (Math.hypot(to.x - this.origin.x, to.y - this.origin.y) >= slop) this.cancel();
  }

  /** Ends the hold without firing (release, a second finger, the pointer being taken away). */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.origin === null) return;
    this.origin = null;
    this.callbacks.onCancel?.();
  }
}
