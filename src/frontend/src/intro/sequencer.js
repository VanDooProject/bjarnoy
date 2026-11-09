import { buildTimeline, chapterIndexAt, seekLimitMs, selectBeats } from './timeline';
const defaultClock = {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h),
    now: () => Date.now(),
};
/** Pure, framework-free step machine behind the landing intro (see docs/design/landing-intro.md). */
export class IntroSequencer {
    intros;
    hold;
    exitBeat;
    clock;
    loopList;
    /** The chapters of this run: what the timeline shows and what `seek` addresses. */
    timeline;
    holdMin;
    /** Clock time at which the current beat would have started in a straight play (so `now - startedAt` is the time into the beat). */
    startedAt = 0;
    pausedAtMs = 0;
    entryOffset = 0;
    seq = 0;
    paused = false;
    timerInfo = null;
    minTimerInfo = null;
    pausedTimer = null;
    pausedMinTimer = null;
    loaded = false;
    closed = false;
    timer = null;
    minTimer = null;
    holdMinReached = false;
    phase = 'waitingForPlay';
    beat;
    round = 0;
    cycle = 0;
    opts;
    constructor(opts) {
        this.opts = opts;
        this.intros = opts.beats.filter((b) => b.role === 'intro');
        const hold = opts.beats.find((b) => b.role === 'hold');
        const exit = opts.beats.find((b) => b.role === 'exit');
        if (!hold || !exit || this.intros.length === 0)
            throw new Error('IntroSequencer needs intro, hold and exit beats');
        this.hold = hold;
        this.exitBeat = exit;
        this.clock = opts.clock ?? defaultClock;
        this.loopList = selectBeats(opts.beats, 'loop', opts.loopBeats);
        this.holdMin = opts.holdMinMs ?? hold.durationMs;
        this.timeline = buildTimeline(selectBeats(opts.beats, opts.mode, opts.loopBeats), this.holdMin);
        this.beat = opts.mode === 'loop' ? this.loopList[0].id : this.intros[0].id;
    }
    now() {
        return (this.clock.now ?? Date.now)();
    }
    get state() {
        const { phase } = this;
        const skipVisible = this.opts.mode === 'replay'
            ? phase === 'waitingForPlay' || phase === 'playing'
            : this.opts.mode === 'loop'
                ? phase === 'playing'
                : this.loaded && phase === 'playing';
        const waiting = this.opts.mode === 'landing' && phase === 'playing' && this.beat === this.hold.id && this.holdMinReached && !this.loaded;
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
            closed: this.closed,
        };
    }
    /** Where the run is on the timeline, in ms: frozen while paused, parked at the hold's end while it waits for the tiles. */
    positionMs() {
        if (this.phase === 'waitingForPlay')
            return 0;
        if (this.phase === 'done' || this.phase === 'ended')
            return this.timeline.totalMs;
        const chapter = this.timeline.chapters.find((c) => c.id === this.beat);
        if (!chapter)
            return this.timeline.totalMs; // a skip to an exit the loop does not list
        const at = this.paused ? this.pausedAtMs : this.now();
        return chapter.startMs + Math.min(chapter.durMs, Math.max(0, at - this.startedAt));
    }
    start() {
        // The landing page waits for the player in every case; replay and loop wait only with reduced motion.
        if (!this.opts.playNow && (this.opts.mode === 'landing' || this.opts.reducedMotion)) {
            this.emit();
            return;
        }
        this.play();
    }
    play() {
        if (this.phase !== 'waitingForPlay')
            return;
        this.phase = 'playing';
        if (this.opts.mode === 'loop')
            this.enterLoop(0);
        else
            this.enterIntro(0);
    }
    skip() {
        if (!this.state.skipVisible)
            return;
        this.enterExit();
    }
    /** Freezes the running timers with their remaining time; `resume()` continues them. */
    pause() {
        if (this.paused || (this.phase !== 'playing' && this.phase !== 'exiting'))
            return;
        const take = (info, handle) => {
            if (handle === null || info === null)
                return null;
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
    resume() {
        if (!this.paused)
            return;
        this.paused = false;
        this.startedAt += this.now() - this.pausedAtMs;
        const { pausedTimer, pausedMinTimer } = this;
        this.pausedTimer = null;
        this.pausedMinTimer = null;
        if (this.opts.mode === 'landing' && this.phase === 'playing' && this.beat === this.hold.id && this.holdMinReached && this.loaded) {
            this.enterExit();
            return;
        }
        if (pausedTimer)
            this.schedule(pausedTimer.ms, pausedTimer.fn);
        if (pausedMinTimer)
            this.scheduleMin(pausedMinTimer.ms, pausedMinTimer.fn);
        this.emit();
    }
    notifyLoaded() {
        if (this.loaded)
            return;
        this.loaded = true;
        if (this.opts.mode !== 'landing')
            return;
        if (this.phase === 'playing' && !this.paused && this.beat === this.hold.id && this.holdMinReached)
            this.enterExit();
        else
            this.emit();
    }
    /**
     * Jumps to a position on the timeline. Ignored before play, after the end and while the landing exits. In the
     * landing it stops at the hold's end until the tiles are loaded. A paused run stays paused.
     */
    seek(ms) {
        if (this.closed || (this.phase !== 'playing' && this.phase !== 'exiting'))
            return;
        if (this.opts.mode === 'landing' && this.phase === 'exiting')
            return;
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
        if (this.opts.mode === 'loop')
            this.enterLoop(index, offset);
        else if (chapter.role === 'intro')
            this.enterIntro(index, offset);
        else if (chapter.role === 'hold')
            this.enterHold(offset);
        else
            this.enterExit(offset);
        if (wasPaused)
            this.pause();
    }
    /** Stops for good, at once: no timer fires; the one state emitted afterwards is the final one with `closed: true`. */
    close() {
        if (this.closed)
            return;
        this.clear();
        this.closed = true;
        this.opts.onChange({ ...this.state });
    }
    dispose() {
        this.clear();
    }
    enterIntro(from, offset = 0) {
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
    enterHold(offset = 0) {
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
                if (this.opts.mode === 'replay' || this.loaded)
                    this.enterExit();
                else
                    this.emit(); // landing: the playhead waits at the hold's end
            });
        }
        else if (this.opts.mode === 'replay' || this.loaded)
            this.enterExit();
    }
    // loop mode: every selected beat plays for its duration (the hold for its reading minimum), then the next one;
    // after the last one it starts again at the first.
    enterLoop(i, offset = 0) {
        this.clear();
        if (i >= this.loopList.length)
            this.round++;
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
    scheduleLoop(firstMs = this.hold.loopMs ?? this.hold.durationMs) {
        this.schedule(firstMs, () => {
            this.cycle++;
            this.emit();
            this.scheduleLoop();
        });
    }
    enterExit(offset = 0) {
        this.clear();
        this.phase = 'exiting';
        this.beat = this.exitBeat.id;
        this.begin(offset);
        this.emit();
        this.schedule(this.exitBeat.durationMs - offset, () => (this.opts.mode === 'loop' ? this.enterLoop(this.loopList.length) : this.finish()));
    }
    /** A beat is entered `offset` ms into its straight play. */
    begin(offset) {
        this.entryOffset = offset;
        this.startedAt = this.now() - offset;
    }
    finish() {
        this.clear();
        this.phase = this.opts.mode === 'landing' ? 'done' : 'ended';
        this.emit();
    }
    schedule(ms, fn) {
        if (this.closed)
            return;
        if (this.timer !== null)
            this.clock.clearTimeout(this.timer);
        this.timerInfo = { fn, dueAt: this.now() + ms };
        this.timer = this.clock.setTimeout(() => {
            this.timer = null;
            fn();
        }, ms);
    }
    scheduleMin(ms, fn) {
        if (this.closed)
            return;
        if (this.minTimer !== null)
            this.clock.clearTimeout(this.minTimer);
        this.minTimerInfo = { fn, dueAt: this.now() + ms };
        this.minTimer = this.clock.setTimeout(() => {
            this.minTimer = null;
            fn();
        }, ms);
    }
    clear() {
        if (this.timer !== null)
            this.clock.clearTimeout(this.timer);
        this.timer = null;
        if (this.minTimer !== null)
            this.clock.clearTimeout(this.minTimer);
        this.minTimer = null;
        this.timerInfo = null;
        this.minTimerInfo = null;
        this.pausedTimer = null;
        this.pausedMinTimer = null;
        this.paused = false;
    }
    emit() {
        if (this.closed)
            return;
        this.opts.onChange({ ...this.state });
    }
}
