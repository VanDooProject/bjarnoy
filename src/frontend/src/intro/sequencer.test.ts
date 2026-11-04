import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroSequencer, type IntroState } from './sequencer';
import type { BeatMeta } from './beats/types';

const beats: BeatMeta[] = [
  { id: 'fire', role: 'intro', durationMs: 1000 },
  { id: 'prophecy', role: 'intro', durationMs: 1000 },
  { id: 'ravens', role: 'intro', durationMs: 1000, optional: true },
  { id: 'sending', role: 'intro', durationMs: 1000 },
  { id: 'hold', role: 'hold', durationMs: 600, loopMs: 600 },
  { id: 'landfall', role: 'exit', durationMs: 500 },
];

function make(mode: 'landing' | 'replay', reducedMotion = false, holdMinMs?: number) {
  const changes: IntroState[] = [];
  const seq = new IntroSequencer({ beats, mode, reducedMotion, holdMinMs, onChange: (s) => changes.push(s) });
  return { seq, changes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('IntroSequencer landing', () => {
  it('plays every intro beat once, then loops the hold with a cycle counter until loaded', () => {
    const { seq } = make('landing');
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire' });
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('prophecy');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('ravens');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('sending');
    vi.advanceTimersByTime(1000);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 0 });
    vi.advanceTimersByTime(600);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 1, phase: 'playing' });
    vi.advanceTimersByTime(1200);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 3 });
  });

  it('drops the optional beat when already loaded', () => {
    const { seq } = make('landing');
    seq.start();
    seq.notifyLoaded();
    vi.advanceTimersByTime(2000);
    expect(seq.state.beat).toBe('sending');
  });

  it('keeps the optional beat when loading finishes after it started', () => {
    const { seq } = make('landing');
    seq.start();
    vi.advanceTimersByTime(2000);
    expect(seq.state.beat).toBe('ravens');
    seq.notifyLoaded();
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('sending');
  });

  // Fast loads are the common case: the hold's narration must still get its reading time before landfall.
  it('plays the hold for its minimum even when loaded before it, then exits', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(3500);
    seq.notifyLoaded();
    vi.advanceTimersByTime(500);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'hold' });
    vi.advanceTimersByTime(1499);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'hold' });
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  // The hold has no loop seam: once its narration has had time to be read, loading ends it at once.
  it('exits as soon as loaded when the hold has run its minimum, then is done', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4000);
    vi.advanceTimersByTime(1600);
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing', cycle: 2 });
    seq.notifyLoaded();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('done');
  });

  it('keeps the hold until its minimum when loaded earlier, then exits', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4300);
    seq.notifyLoaded();
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing', skipVisible: true });
    vi.advanceTimersByTime(1199);
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing' });
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('skip ends the hold before its minimum, and the minimum does not fire a second exit', () => {
    const { seq, changes } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4300);
    seq.notifyLoaded();
    seq.skip();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('done');
    const n = changes.length;
    vi.advanceTimersByTime(5000);
    expect(changes.length).toBe(n);
  });

  it('shows skip only after loading and skip jumps to the exit', () => {
    const { seq } = make('landing');
    seq.start();
    expect(seq.state.skipVisible).toBe(false);
    seq.skip();
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire' });
    seq.notifyLoaded();
    expect(seq.state.skipVisible).toBe(true);
    seq.skip();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', skipVisible: false });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('done');
  });

  it('calls onChange with fresh objects and stops on dispose', () => {
    const { seq, changes } = make('landing');
    seq.start();
    vi.advanceTimersByTime(1000);
    expect(new Set(changes).size).toBe(changes.length);
    seq.dispose();
    const n = changes.length;
    vi.advanceTimersByTime(10000);
    expect(changes.length).toBe(n);
  });
});

describe('IntroSequencer reduced motion', () => {
  it('waits on the first frame until play, then runs as normal', () => {
    const { seq } = make('landing', true);
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    vi.advanceTimersByTime(5000);
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    seq.play();
    expect(seq.state.phase).toBe('playing');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('prophecy');
  });

  it('goes straight to done when loaded before play', () => {
    const { seq } = make('landing', true);
    seq.start();
    seq.notifyLoaded();
    expect(seq.state.phase).toBe('done');
  });

  it('goes straight to done when already loaded at start', () => {
    const { seq } = make('landing', true);
    seq.notifyLoaded();
    seq.start();
    expect(seq.state.phase).toBe('done');
  });
});

describe('IntroSequencer replay', () => {
  it('plays all beats, the hold for its minimum, then ends', () => {
    const { seq } = make('replay');
    seq.start();
    seq.notifyLoaded();
    const seen: string[] = [seq.state.beat];
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(i < 4 ? 1000 : 600);
      seen.push(seq.state.beat);
    }
    expect(seen).toEqual(['fire', 'prophecy', 'ravens', 'sending', 'hold']);
    vi.advanceTimersByTime(600);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('ended');
  });

  it('shows skip from the start, also while waiting for play', () => {
    const { seq } = make('replay', true);
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', skipVisible: true });
    seq.skip();
    expect(seq.state.phase).toBe('exiting');
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('ended');
  });

  it('skips from the very start', () => {
    const { seq } = make('replay');
    seq.start();
    expect(seq.state.skipVisible).toBe(true);
    seq.skip();
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('ended');
  });
});
