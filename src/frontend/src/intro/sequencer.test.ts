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

function make(mode: 'landing' | 'replay', reducedMotion = false) {
  const changes: IntroState[] = [];
  const seq = new IntroSequencer({ beats, mode, reducedMotion, onChange: (s) => changes.push(s) });
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

  it('skips the hold and exits right after the last intro beat when loaded early', () => {
    const { seq } = make('landing');
    seq.start();
    vi.advanceTimersByTime(3500);
    seq.notifyLoaded();
    vi.advanceTimersByTime(500);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('exits at the next loop boundary once loaded during the hold, then is done', () => {
    const { seq } = make('landing');
    seq.start();
    vi.advanceTimersByTime(4000);
    vi.advanceTimersByTime(700);
    seq.notifyLoaded();
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing' });
    vi.advanceTimersByTime(500);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('done');
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
  it('plays all beats, one hold cycle, then ends', () => {
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
