import type { BeatId, BeatMeta } from './beats/types';
import { buildTimeline, chapterIndexAt, seekLimitMs, selectBeats, type Timeline } from './timeline';

export type IntroPhase = 'waitingForPlay' | 'playing' | 'exiting' | 'done' | 'ended';

export interface IntroState {
  phase: IntroPhase;
  beat: BeatId;
  /** Completed hold loops so far (0 during the first hold cycle). */
  cycle: number;
  /** Passes through the beats: a loop pass or a restart starts a new one (0 on the first pass). */
  round: number;
  skipVisible: boolean;
  paused: boolean;
  /** How far into the beat it was entered: 0 normally, more after a seek. */
  offsetMs: number;
  /** Counts the seeks, so the host re-syncs even when a seek stays within the same beat. */
  seq: number;
  /** Landing: the hold has run its shortest time and the tiles are not loaded yet, so the playhead waits at its end. */
  waiting: boolean;
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
  /** The player asked for the intro (the landing page's "Play intro"): it plays at once, as if play was pressed. */
  playNow?: boolean;
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
  /** The chapters of this run: what the timeline shows and what `seek` addresses. */
  readonly timeline: Timeline;
  private readonly holdMin: number;
  /** Clock time at which the current beat would have started in a straight play (so `now - startedAt` is the time into the beat). */
  private startedAt = 0;
  private pausedAtMs = 0;
  private entryOffset = 0;
  private seq = 0;
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
  private round = 0;
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
    this.loopList = selectBeats(opts.beats, 'loop', opts.loopBeats);
    this.holdMin = opts.holdMinMs ?? hold.durationMs;
    this.timeline = buildTimeline(selectBeats(opts.beats, opts.mode, opts.loopBeats), this.holdMin);
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
    const waiting =
      this.opts.mode === 'landing' && phase === 'playing' && this.beat === this.hold.id && this.holdMinReached && !this.loaded;
    return {
      phase,
      beat: this.beat,
      cycle: this.cycle,
      round: this.round,
      skipVisible,
      paused: this.paused,
      offsetMs: this.entryOffset,
      seq: this.seq,
      waiting,
    };
  }

  /** Where the run is on the timeline, in ms: frozen while paused, parked at the hold's end while it waits for the tiles. */
  positionMs(): number {
    if (this.phase === 'waitingForPlay') return 0;
    if (this.phase === 'done' || this.phase === 'ended') return this.timeline.totalMs;
    const chapter = this.timeline.chapters.find((c) => c.id === this.beat);
    if (!chapter) return this.timeline.totalMs; // a skip to an exit the loop does not list
    const at = this.paused ? this.pausedAtMs : this.now();
    return chapter.startMs + Math.min(chapter.durMs, Math.max(0, at - this.startedAt));
  }

  start(): void {
    this.started = true;
    if (this.opts.reducedMotion && !this.opts.playNow) {
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
    this.pausedAtMs = this.now();
    this.paused = true;
    this.emit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.startedAt += this.now() - this.pausedAtMs;
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

  /**
   * Jumps to a position on the timeline. Ignored before play, after the end and while the landing exits. In the
   * landing it stops at the hold's end until the tiles are loaded. A paused run stays paused.
   */
  seek(ms: number): void {
    if (this.closed || (this.phase !== 'playing' && this.phase !== 'exiting')) return;
    if (this.opts.mode === 'landing' && this.phase === 'exiting') return;
    const { chapters } = this.timeline;
    const holdIndex = chapters.findIndex((c) => c.role === 'hold');
    const gated = this.opts.mode === 'landing' && !this.loaded;
    const limit = seekLimitMs(this.timeline, gated);
    const target = Math.max(0, Math.min(limit, ms));
    const wasPaused = this.paused;
    this.clear();
    this.seq++;
    this.cycle = 0;
    this.phase = 'playing';
    // the hold's end belongs to the landfall chapter, but a gated seek parks on the hold
    const parked = gated && holdIndex !== -1 && target >= limit;
    const index = parked ? holdIndex : chapterIndexAt(this.timeline, target);
    const chapter = chapters[index];
    const offset = parked ? chapter.durMs : target - chapter.startMs;
    if (this.opts.mode === 'loop') this.enterLoop(index, offset);
    else if (chapter.role === 'intro') this.enterIntro(index, offset);
    else if (chapter.role === 'hold') this.enterHold(offset);
    else this.enterExit(offset);
    if (wasPaused) this.pause();
  }

  /** Stops for good, at once: no timer fires and no state is emitted afterwards. */
  close(): void {
    this.closed = true;
    this.clear();
  }

  dispose(): void {
    this.clear();
  }

  private enterIntro(from: number, offset = 0): void {
    // Every intro beat plays, even when the tiles are already loaded.
    const i = from;
    // The hold always plays, at least as long as its voice clip, even when the tiles are already loaded.
    if (i >= this.intros.length) {
      this.enterHold();
      return;
    }
    const meta = this.intros[i];
    this.beat = meta.id;
    this.begin(offset);
    this.emit();
    this.schedule(meta.durationMs - offset, () => this.enterIntro(i + 1));
  }

  // The hold has no loop seam to wait for: it ends as soon as the tiles are loaded
  // and its narration has had time to be read (replay: once that time has passed).
  private enterHold(offset = 0): void {
    this.beat = this.hold.id;
    this.begin(offset);
    const loopMs = this.hold.loopMs ?? this.hold.durationMs;
    this.cycle = Math.floor(offset / loopMs);
    this.holdMinReached = offset >= this.holdMin;
    this.emit();
    this.scheduleLoop(loopMs - (offset % loopMs));
    if (!this.holdMinReached) {
      this.scheduleMin(this.holdMin - offset, () => {
        this.holdMinReached = true;
        if (this.opts.mode === 'replay' || this.loaded) this.enterExit();
        else this.emit(); // landing: the playhead waits at the hold's end
      });
    } else if (this.opts.mode === 'replay' || this.loaded) this.enterExit();
  }

  // loop mode: every selected beat plays for its duration (the hold for its reading minimum), then the next one;
  // after the last one it starts again at the first.
  private enterLoop(i: number, offset = 0): void {
    this.clear();
    if (i >= this.loopList.length) this.round++;
    const index = i % this.loopList.length;
    const meta = this.loopList[index];
    const next = () => this.enterLoop(index + 1);
    this.beat = meta.id;
    this.phase = meta.role === 'exit' ? 'exiting' : 'playing';
    this.begin(offset);
    if (meta.role === 'hold') {
      const loopMs = this.hold.loopMs ?? this.hold.durationMs;
      this.cycle = Math.floor(offset / loopMs);
      this.emit();
      this.scheduleLoop(loopMs - (offset % loopMs));
      this.scheduleMin(this.holdMin - offset, next);
      return;
    }
    this.emit();
    this.schedule(meta.durationMs - offset, next);
  }

  private scheduleLoop(firstMs = this.hold.loopMs ?? this.hold.durationMs): void {
    this.schedule(firstMs, () => {
      this.cycle++;
      this.emit();
      this.scheduleLoop();
    });
  }

  private enterExit(offset = 0): void {
    this.clear();
    this.phase = 'exiting';
    this.beat = this.exitBeat.id;
    this.begin(offset);
    this.emit();
    this.schedule(this.exitBeat.durationMs - offset, () => (this.opts.mode === 'loop' ? this.enterLoop(this.loopList.length) : this.finish()));
  }

  /** A beat is entered `offset` ms into its straight play. */
  private begin(offset: number): void {
    this.entryOffset = offset;
    this.startedAt = this.now() - offset;
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
