import type { BeatId, BeatMeta } from './beats/types';

export type IntroPhase = 'waitingForPlay' | 'playing' | 'exiting' | 'done' | 'ended';

export interface IntroState {
  phase: IntroPhase;
  beat: BeatId;
  /** Completed hold loops so far (0 during the first hold cycle). */
  cycle: number;
  skipVisible: boolean;
  paused: boolean;
}

export interface IntroClock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Current time in ms; defaults to `Date.now`. Used to keep the remaining time of a paused timer. */
  now?: () => number;
}

export interface IntroSequencerOptions {
  beats: BeatMeta[];
  mode: 'landing' | 'replay' | 'loop';
  /** loop mode only: the beats to loop (any order; played in story order). Defaults to all beats. */
  loopBeats?: BeatId[];
  reducedMotion: boolean;
  onChange: (state: IntroState) => void;
  clock?: IntroClock;
  /** Shortest hold: the time to read its narration. Defaults to the hold beat's durationMs. */
  holdMinMs?: number;
}

const defaultClock: IntroClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

interface PendingTimer {
  fn: () => void;
  dueAt: number;
}

/** Pure, framework-free step machine behind the landing intro (see docs/design/landing-intro.md). */
export class IntroSequencer {
  private readonly intros: BeatMeta[];
  private readonly hold: BeatMeta;
  private readonly exitBeat: BeatMeta;
  private readonly clock: IntroClock;
  private readonly loopList: BeatMeta[];
  private paused = false;
  private timerInfo: PendingTimer | null = null;
  private minTimerInfo: PendingTimer | null = null;
  private pausedTimer: { ms: number; fn: () => void } | null = null;
  private pausedMinTimer: { ms: number; fn: () => void } | null = null;
  private loaded = false;
  private started = false;
  private closed = false;
  private timer: unknown = null;
  private minTimer: unknown = null;
  private holdMinReached = false;
  private phase: IntroPhase = 'waitingForPlay';
  private beat: BeatId;
  private cycle = 0;

  private readonly opts: IntroSequencerOptions;

  constructor(opts: IntroSequencerOptions) {
    this.opts = opts;
    this.intros = opts.beats.filter((b) => b.role === 'intro');
    const hold = opts.beats.find((b) => b.role === 'hold');
    const exit = opts.beats.find((b) => b.role === 'exit');
    if (!hold || !exit || this.intros.length === 0) throw new Error('IntroSequencer needs intro, hold and exit beats');
    this.hold = hold;
    this.exitBeat = exit;
    this.clock = opts.clock ?? defaultClock;
    const selected = opts.loopBeats ? opts.beats.filter((b) => opts.loopBeats!.includes(b.id)) : opts.beats;
    this.loopList = selected.length > 0 ? selected : opts.beats;
    this.beat = opts.mode === 'loop' ? this.loopList[0].id : this.intros[0].id;
  }

  private now(): number {
    return (this.clock.now ?? Date.now)();
  }

  get state(): IntroState {
    const { phase } = this;
    const skipVisible =
      this.opts.mode === 'replay'
        ? phase === 'waitingForPlay' || phase === 'playing'
        : this.opts.mode === 'loop'
          ? phase === 'playing'
          : this.loaded && phase === 'playing';
    return { phase, beat: this.beat, cycle: this.cycle, skipVisible, paused: this.paused };
  }

  start(): void {
    this.started = true;
    if (this.opts.reducedMotion) {
      if (this.opts.mode === 'landing' && this.loaded) this.finish();
      else this.emit();
      return;
    }
    this.play();
  }

  play(): void {
    if (this.phase !== 'waitingForPlay') return;
    this.phase = 'playing';
    if (this.opts.mode === 'loop') this.enterLoop(0);
    else this.enterIntro(0);
  }

  skip(): void {
    if (!this.state.skipVisible) return;
    this.enterExit();
  }

  /** Freezes the running timers with their remaining time; `resume()` continues them. */
  pause(): void {
    if (this.paused || (this.phase !== 'playing' && this.phase !== 'exiting')) return;
    const take = (info: PendingTimer | null, handle: unknown) => {
      if (handle === null || info === null) return null;
      this.clock.clearTimeout(handle);
      return { ms: Math.max(0, info.dueAt - this.now()), fn: info.fn };
    };
    this.pausedTimer = take(this.timerInfo, this.timer);
    this.pausedMinTimer = take(this.minTimerInfo, this.minTimer);
    this.timer = null;
    this.minTimer = null;
    this.paused = true;
    this.emit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const { pausedTimer, pausedMinTimer } = this;
    this.pausedTimer = null;
    this.pausedMinTimer = null;
    if (this.opts.mode === 'landing' && this.phase === 'playing' && this.beat === this.hold.id && this.holdMinReached && this.loaded) {
      this.enterExit();
      return;
    }
    if (pausedTimer) this.schedule(pausedTimer.ms, pausedTimer.fn);
    if (pausedMinTimer) this.scheduleMin(pausedMinTimer.ms, pausedMinTimer.fn);
    this.emit();
  }

  notifyLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (this.opts.mode !== 'landing') return;
    if (this.phase === 'waitingForPlay' && this.started) this.finish();
    else if (this.phase === 'playing' && !this.paused && this.beat === this.hold.id && this.holdMinReached) this.enterExit();
    else this.emit();
  }

  /** Back to the first beat (landing/replay: the first intro beat; loop: the first selected beat), unpaused. */
  restart(): void {
    if (this.closed || (this.phase !== 'playing' && this.phase !== 'exiting')) return;
    this.clear();
    this.cycle = 0;
    this.holdMinReached = false;
    this.phase = 'playing';
    if (this.opts.mode === 'loop') this.enterLoop(0);
    else this.enterIntro(0);
  }

  /** Stops for good, at once: no timer fires and no state is emitted afterwards. */
  close(): void {
    this.closed = true;
    this.clear();
  }

  dispose(): void {
    this.clear();
  }

  private enterIntro(from: number): void {
    // Every intro beat plays, even when the tiles are already loaded.
    const i = from;
    // The hold always plays, at least for its narration's reading time, even when the tiles are already loaded.
    if (i >= this.intros.length) {
      this.enterHold();
      return;
    }
    const meta = this.intros[i];
    this.beat = meta.id;
    this.emit();
    this.schedule(meta.durationMs, () => this.enterIntro(i + 1));
  }

  // The hold has no loop seam to wait for: it ends as soon as the tiles are loaded
  // and its narration has had time to be read (replay: once that time has passed).
  private enterHold(): void {
    this.beat = this.hold.id;
    this.cycle = 0;
    this.holdMinReached = false;
    this.emit();
    this.scheduleLoop();
    this.scheduleMin(this.opts.holdMinMs ?? this.hold.durationMs, () => {
      this.holdMinReached = true;
      if (this.opts.mode === 'replay' || this.loaded) this.enterExit();
    });
  }

  // loop mode: every selected beat plays for its duration (the hold for its reading minimum), then the next one;
  // after the last one it starts again at the first.
  private enterLoop(i: number): void {
    this.clear();
    const index = i % this.loopList.length;
    const meta = this.loopList[index];
    const next = () => this.enterLoop(index + 1);
    this.beat = meta.id;
    this.phase = meta.role === 'exit' ? 'exiting' : 'playing';
    if (meta.role === 'hold') {
      this.cycle = 0;
      this.emit();
      this.scheduleLoop();
      this.scheduleMin(this.opts.holdMinMs ?? this.hold.durationMs, next);
      return;
    }
    this.emit();
    this.schedule(meta.durationMs, next);
  }

  private scheduleLoop(): void {
    this.schedule(this.hold.loopMs ?? this.hold.durationMs, () => {
      this.cycle++;
      this.emit();
      this.scheduleLoop();
    });
  }

  private enterExit(): void {
    this.clear();
    this.phase = 'exiting';
    this.beat = this.exitBeat.id;
    this.emit();
    this.schedule(this.exitBeat.durationMs, () => (this.opts.mode === 'loop' ? this.enterLoop(0) : this.finish()));
  }

  private finish(): void {
    this.clear();
    this.phase = this.opts.mode === 'landing' ? 'done' : 'ended';
    this.emit();
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.closed) return;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timerInfo = { fn, dueAt: this.now() + ms };
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private scheduleMin(ms: number, fn: () => void): void {
    if (this.closed) return;
    if (this.minTimer !== null) this.clock.clearTimeout(this.minTimer);
    this.minTimerInfo = { fn, dueAt: this.now() + ms };
    this.minTimer = this.clock.setTimeout(() => {
      this.minTimer = null;
      fn();
    }, ms);
  }

  private clear(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    if (this.minTimer !== null) this.clock.clearTimeout(this.minTimer);
    this.minTimer = null;
    this.timerInfo = null;
    this.minTimerInfo = null;
    this.pausedTimer = null;
    this.pausedMinTimer = null;
    this.paused = false;
  }

  private emit(): void {
    if (this.closed) return;
    this.opts.onChange({ ...this.state });
  }
}
