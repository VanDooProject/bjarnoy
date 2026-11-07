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
    paused = false;
    timerInfo = null;
    minTimerInfo = null;
    pausedTimer = null;
    pausedMinTimer = null;
    loaded = false;
    started = false;
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
        const selected = opts.loopBeats ? opts.beats.filter((b) => opts.loopBeats.includes(b.id)) : opts.beats;
        this.loopList = selected.length > 0 ? selected : opts.beats;
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
        return { phase, beat: this.beat, cycle: this.cycle, round: this.round, skipVisible, paused: this.paused };
    }
    start() {
        this.started = true;
        if (this.opts.reducedMotion && !this.opts.playNow) {
            if (this.opts.mode === 'landing' && this.loaded)
                this.finish();
            else
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
        this.paused = true;
        this.emit();
    }
    resume() {
        if (!this.paused)
            return;
        this.paused = false;
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
        if (this.phase === 'waitingForPlay' && this.started)
            this.finish();
        else if (this.phase === 'playing' && !this.paused && this.beat === this.hold.id && this.holdMinReached)
            this.enterExit();
        else
            this.emit();
    }
    /** Back to the first beat (landing/replay: the first intro beat; loop: the first selected beat), unpaused. */
    restart() {
        if (this.closed || (this.phase !== 'playing' && this.phase !== 'exiting'))
            return;
        this.clear();
        this.cycle = 0;
        this.holdMinReached = false;
        this.phase = 'playing';
        // a new pass, so the first beat's clip and scene start over even when it is the beat that was showing
        this.round++;
        if (this.opts.mode === 'loop')
            this.enterLoop(0);
        else
            this.enterIntro(0);
    }
    /** Stops for good, at once: no timer fires and no state is emitted afterwards. */
    close() {
        this.closed = true;
        this.clear();
    }
    dispose() {
        this.clear();
    }
    enterIntro(from) {
        // Every intro beat plays, even when the tiles are already loaded.
        const i = from;
        // The hold always plays, at least as long as its voice clip, even when the tiles are already loaded.
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
    enterHold() {
        this.beat = this.hold.id;
        this.cycle = 0;
        this.holdMinReached = false;
        this.emit();
        this.scheduleLoop();
        this.scheduleMin(this.opts.holdMinMs ?? this.hold.durationMs, () => {
            this.holdMinReached = true;
            if (this.opts.mode === 'replay' || this.loaded)
                this.enterExit();
        });
    }
    // loop mode: every selected beat plays for its duration (the hold for its reading minimum), then the next one;
    // after the last one it starts again at the first.
    enterLoop(i) {
        this.clear();
        if (i >= this.loopList.length)
            this.round++;
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
    scheduleLoop() {
        this.schedule(this.hold.loopMs ?? this.hold.durationMs, () => {
            this.cycle++;
            this.emit();
            this.scheduleLoop();
        });
    }
    enterExit() {
        this.clear();
        this.phase = 'exiting';
        this.beat = this.exitBeat.id;
        this.emit();
        this.schedule(this.exitBeat.durationMs, () => (this.opts.mode === 'loop' ? this.enterLoop(this.loopList.length) : this.finish()));
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
