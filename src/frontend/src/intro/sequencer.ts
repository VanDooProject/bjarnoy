import type { BeatId, BeatMeta } from './beats/types';

export type IntroPhase = 'waitingForPlay' | 'playing' | 'exiting' | 'done' | 'ended';

export interface IntroState {
  phase: IntroPhase;
  beat: BeatId;
  /** Completed hold loops so far (0 during the first hold cycle). */
  cycle: number;
  skipVisible: boolean;
}

export interface IntroClock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface IntroSequencerOptions {
  beats: BeatMeta[];
  mode: 'landing' | 'replay';
  reducedMotion: boolean;
  onChange: (state: IntroState) => void;
  clock?: IntroClock;
  /** Shortest hold: the time to read its narration. Defaults to the hold beat's durationMs. */
  holdMinMs?: number;
}

const defaultClock: IntroClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Pure, framework-free step machine behind the landing intro (see docs/design/landing-intro.md). */
export class IntroSequencer {
  private readonly intros: BeatMeta[];
  private readonly hold: BeatMeta;
  private readonly exitBeat: BeatMeta;
  private readonly clock: IntroClock;
  private loaded = false;
  private started = false;
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
    this.beat = this.intros[0].id;
  }

  get state(): IntroState {
    const { phase } = this;
    const skipVisible =
      this.opts.mode === 'replay'
        ? phase === 'waitingForPlay' || phase === 'playing'
        : this.loaded && phase === 'playing';
    return { phase, beat: this.beat, cycle: this.cycle, skipVisible };
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
    this.enterIntro(0);
  }

  skip(): void {
    if (!this.state.skipVisible) return;
    this.enterExit();
  }

  notifyLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (this.opts.mode !== 'landing') return;
    if (this.phase === 'waitingForPlay' && this.started) this.finish();
    else if (this.phase === 'playing' && this.beat === this.hold.id && this.holdMinReached) this.enterExit();
    else this.emit();
  }

  dispose(): void {
    this.clear();
  }

  private enterIntro(from: number): void {
    let i = from;
    const dropOptional = this.opts.mode === 'landing' && this.loaded;
    while (i < this.intros.length && this.intros[i].optional && dropOptional) i++;
    if (i >= this.intros.length) {
      if (this.opts.mode === 'landing' && this.loaded) this.enterExit();
      else this.enterHold();
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
    this.minTimer = this.clock.setTimeout(() => {
      this.minTimer = null;
      this.holdMinReached = true;
      if (this.opts.mode === 'replay' || this.loaded) this.enterExit();
    }, this.opts.holdMinMs ?? this.hold.durationMs);
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
    this.schedule(this.exitBeat.durationMs, () => this.finish());
  }

  private finish(): void {
    this.clear();
    this.phase = this.opts.mode === 'landing' ? 'done' : 'ended';
    this.emit();
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(fn, ms);
  }

  private clear(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    if (this.minTimer !== null) this.clock.clearTimeout(this.minTimer);
    this.minTimer = null;
  }

  private emit(): void {
    this.opts.onChange({ ...this.state });
  }
}
