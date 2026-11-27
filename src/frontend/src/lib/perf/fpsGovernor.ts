// The one stepped fps governor, shared by the building-animation setting
// (2 levels: off, on) and the render-resolution setting (one level per
// resolution step). Pure: no DOM, no timers; frame intervals are passed in.
// Which frames may be fed at all (active vs background) is decided by
// `frameActivity.ts`, and which direction may move right now by the caller's
// gates (see `frameGovernors.ts`).

/** Mean fps is judged per bucket of this length, not per frame, so one hitch can't decide a window. */
export const BUCKET_MS = 1000;
/** UP: bucket fps >= 30 for 10 s sustained. */
export const UP_FPS = 30;
export const UP_SUSTAIN_MS = 10_000;
/** DOWN: bucket fps < 30 for 5 s sustained. */
export const DOWN_FPS = 30;
export const DOWN_SUSTAIN_MS = 5_000;
/** RETRY (the step above a level that failed once): bucket fps >= 60 for 30 s sustained. */
export const RETRY_FPS = 60;
export const RETRY_SUSTAIN_MS = 30_000;

export type GovernorWindow = 'up' | 'retry' | 'down';

export interface GovernorProgress {
  /** Mean fps of the last full bucket; null until one has completed. */
  fps: number | null;
  /** The window that currently shows progress; null when nothing can move. */
  window: GovernorWindow | null;
  /** Consecutive qualifying time so far in that window. */
  goodMs: number;
  requiredMs: number;
  thresholdFps: number;
}

export interface GovernorGates {
  up: boolean;
  down: boolean;
}

/**
 * Starts at level 0 (the lowest, cheapest). Climbs one level per window and
 * drops one level per window. A level that was dropped out of once may be
 * re-entered only through the stricter retry window; after a second drop out
 * of it the governor never climbs into it again this session. Every level
 * change starts all windows afresh.
 */
export class FpsGovernor {
  private level = 0;
  private readonly levelCount: number;
  private readonly failed: number[];
  private bucketFrames = 0;
  private bucketMs = 0;
  private lastFps: number | null = null;
  private upStreakMs = 0;
  private downStreakMs = 0;

  constructor(levelCount: number) {
    this.levelCount = levelCount;
    this.failed = new Array<number>(levelCount).fill(0);
  }

  getLevel(): number {
    return this.level;
  }

  getMaxLevel(): number {
    return this.levelCount - 1;
  }

  /** How many times the governor dropped down out of `level`. */
  failures(level: number): number {
    return this.failed[level] ?? 0;
  }

  /** Whether the governor ever dropped out of any level. */
  hasFailures(): boolean {
    return this.failed.some((count) => count > 0);
  }

  /** The next step up exists and has never failed (normal 10 s window applies). */
  canClimbNormally(): boolean {
    return this.level < this.getMaxLevel() && this.failures(this.level + 1) === 0;
  }

  /** The window that decides the next step up, or null at the top / when the next level is latched. */
  private upWindow(): { window: 'up' | 'retry'; fps: number; ms: number } | null {
    if (this.level >= this.getMaxLevel()) return null;
    const failures = this.failures(this.level + 1);
    if (failures === 0) return { window: 'up', fps: UP_FPS, ms: UP_SUSTAIN_MS };
    if (failures === 1) return { window: 'retry', fps: RETRY_FPS, ms: RETRY_SUSTAIN_MS };
    return null;
  }

  getProgress(): GovernorProgress {
    const fps = this.lastFps;
    if (this.downStreakMs > 0) {
      return { fps, window: 'down', goodMs: this.downStreakMs, requiredMs: DOWN_SUSTAIN_MS, thresholdFps: DOWN_FPS };
    }
    const up = this.upWindow();
    if (up) return { fps, window: up.window, goodMs: this.upStreakMs, requiredMs: up.ms, thresholdFps: up.fps };
    return { fps, window: null, goodMs: 0, requiredMs: 0, thresholdFps: 0 };
  }

  /**
   * Feed one frame interval. A direction whose gate is false has its streak
   * reset, so its window restarts from zero once the gate opens.
   */
  sample(frameMs: number, gates: GovernorGates): void {
    if (!(frameMs > 0)) return;
    this.bucketFrames += 1;
    this.bucketMs += frameMs;
    if (this.bucketMs < BUCKET_MS) return;

    const fps = (this.bucketFrames * 1000) / this.bucketMs;
    this.lastFps = fps;
    this.bucketFrames = 0;
    this.bucketMs = 0;

    if (this.level > 0 && gates.down && fps < DOWN_FPS) {
      this.downStreakMs += BUCKET_MS;
      if (this.downStreakMs >= DOWN_SUSTAIN_MS) {
        this.failed[this.level] += 1;
        this.level -= 1;
        this.resetWindows();
        return;
      }
    } else {
      this.downStreakMs = 0;
    }

    const up = this.upWindow();
    if (up && gates.up && fps >= up.fps) {
      this.upStreakMs += BUCKET_MS;
      if (this.upStreakMs >= up.ms) {
        this.level += 1;
        this.resetWindows();
      }
    } else {
      this.upStreakMs = 0;
    }
  }

  /** Drops the in-progress bucket and streaks; keeps the level and the failures. */
  reset(): void {
    this.resetWindows();
  }

  private resetWindows(): void {
    this.bucketFrames = 0;
    this.bucketMs = 0;
    this.upStreakMs = 0;
    this.downStreakMs = 0;
  }
}
