import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroSequencer, type IntroState } from './sequencer';
import type { BeatId, BeatMeta } from './beats/types';

const beats: BeatMeta[] = [
  { id: 'fire', role: 'intro', durationMs: 1000 },
  { id: 'prophecy', role: 'intro', durationMs: 1000 },
  { id: 'ravens', role: 'intro', durationMs: 1000, optional: true },
  { id: 'sending', role: 'intro', durationMs: 1000 },
  { id: 'hold', role: 'hold', durationMs: 600, loopMs: 600 },
  { id: 'landfall', role: 'exit', durationMs: 500 },
];

function make(mode: 'landing' | 'replay' | 'loop', reducedMotion = false, holdMinMs?: number, loopBeats?: BeatId[]) {
  const changes: IntroState[] = [];
  const seq = new IntroSequencer({ beats, mode, reducedMotion, holdMinMs, loopBeats, onChange: (s) => changes.push(s) });
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

describe('IntroSequencer loop', () => {
  const idsOf = (list: BeatMeta[]) => list.map((b) => b.id);
  const first = beats[0];
  const last = beats[beats.length - 1];

  /** Beats shown over a run of `ms`, in order, without consecutive repeats. */
  function shown(seq: IntroSequencer, changes: IntroState[], ms: number): BeatId[] {
    seq.start();
    vi.advanceTimersByTime(ms);
    const out: BeatId[] = [];
    for (const c of changes) if (out[out.length - 1] !== c.beat) out.push(c.beat);
    return out;
  }

  it('plays every beat, the hold for its minimum, and starts over after landfall without ever ending', () => {
    const { seq, changes } = make('loop', false, 600);
    const total = 4 * 1000 + 600 + last.durationMs;
    expect(shown(seq, changes, total * 2 - 1)).toEqual([...idsOf(beats), ...idsOf(beats)]);
    expect(changes.every((c) => c.phase === 'playing' || c.phase === 'exiting')).toBe(true);
    expect(changes.filter((c) => c.phase === 'exiting').every((c) => c.beat === last.id)).toBe(true);
    expect(seq.state.phase).not.toBe('done');
  });

  it('keeps optional beats and ignores loading', () => {
    const { seq } = make('loop');
    seq.start();
    seq.notifyLoaded();
    vi.advanceTimersByTime(2000);
    expect(seq.state.beat).toBe('ravens');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('sending');
  });

  it('keeps cycling the hold while it shows', () => {
    const { seq } = make('loop', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4000 + 1300);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 2 });
    vi.advanceTimersByTime(200);
    expect(seq.state.beat).toBe('landfall');
  });

  it('loops only the selected beats in story order and restarts at the first selected', () => {
    const { seq, changes } = make('loop', false, undefined, [last.id, first.id]);
    const run = first.durationMs + last.durationMs;
    expect(shown(seq, changes, run * 2 - 1)).toEqual([first.id, last.id, first.id, last.id]);
    expect(changes.find((c) => c.beat === first.id)!.phase).toBe('playing');
    expect(changes.find((c) => c.beat === last.id)!.phase).toBe('exiting');
  });

  it('skip jumps to the exit, even if not selected, then restarts at the first selected beat', () => {
    const { seq } = make('loop', false, undefined, ['prophecy', 'sending']);
    seq.start();
    expect(seq.state).toMatchObject({ beat: 'prophecy', skipVisible: true });
    seq.skip();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', skipVisible: false });
    vi.advanceTimersByTime(last.durationMs);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'prophecy' });
  });

  it('the exit alone repeats', () => {
    const { seq } = make('loop', false, undefined, [last.id]);
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
    vi.advanceTimersByTime(last.durationMs * 3);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('reduced motion waits for play, which starts the loop', () => {
    const { seq } = make('loop', true);
    seq.start();
    vi.advanceTimersByTime(5000);
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    seq.play();
    vi.advanceTimersByTime(first.durationMs);
    expect(seq.state.beat).toBe('prophecy');
  });
});

describe('IntroSequencer pause', () => {
  it('keeps the remaining time of a beat: nothing moves while paused, the beat ends after the remainder', () => {
    const { seq } = make('landing');
    seq.start();
    vi.advanceTimersByTime(400);
    seq.pause();
    expect(seq.state).toMatchObject({ paused: true, beat: 'fire' });
    vi.advanceTimersByTime(60_000);
    expect(seq.state).toMatchObject({ paused: true, beat: 'fire' });
    seq.resume();
    expect(seq.state.paused).toBe(false);
    vi.advanceTimersByTime(599);
    expect(seq.state.beat).toBe('fire');
    vi.advanceTimersByTime(1);
    expect(seq.state.beat).toBe('prophecy');
  });

  it('only pauses while playing or exiting', () => {
    const { seq } = make('landing', true);
    seq.start();
    seq.pause();
    expect(seq.state.paused).toBe(false);
    seq.play();
    seq.pause();
    expect(seq.state.paused).toBe(true);
    seq.pause();
    seq.resume();
    seq.resume();
    expect(seq.state.paused).toBe(false);
  });

  it('keeps the exit beat running time too, and is cleared when the sequence is done', () => {
    const { seq } = make('landing');
    seq.start();
    seq.notifyLoaded();
    seq.skip();
    vi.advanceTimersByTime(200);
    seq.pause();
    vi.advanceTimersByTime(10_000);
    expect(seq.state).toMatchObject({ phase: 'exiting', paused: true });
    seq.resume();
    vi.advanceTimersByTime(300);
    expect(seq.state).toMatchObject({ phase: 'done', paused: false });
  });

  it('keeps the remainder of the hold minimum and of its loop cycle', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4000 + 1000);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 1 });
    seq.notifyLoaded();
    seq.pause();
    vi.advanceTimersByTime(10_000);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 1, phase: 'playing' });
    seq.resume();
    vi.advanceTimersByTime(199);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 1 });
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ beat: 'hold', cycle: 2 });
    vi.advanceTimersByTime(300);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('tiles that finish loading while paused wait: the exit starts on resume', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4000 + 1500);
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing' });
    seq.pause();
    seq.notifyLoaded();
    expect(seq.state).toMatchObject({ beat: 'hold', phase: 'playing', paused: true });
    vi.advanceTimersByTime(5000);
    expect(seq.state.beat).toBe('hold');
    seq.resume();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', paused: false });
  });

  it('a hold minimum that runs out after resume exits when already loaded', () => {
    const { seq } = make('landing', false, 1500);
    seq.start();
    vi.advanceTimersByTime(4000 + 500);
    seq.pause();
    seq.notifyLoaded();
    seq.resume();
    vi.advanceTimersByTime(999);
    expect(seq.state.phase).toBe('playing');
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('skip while paused plays the exit unpaused', () => {
    const { seq } = make('landing');
    seq.start();
    seq.notifyLoaded();
    seq.pause();
    seq.skip();
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', paused: false });
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('done');
  });

  it('works in loop mode too, across the restart', () => {
    const { seq } = make('loop', false, 600);
    seq.start();
    vi.advanceTimersByTime(4600 + 100);
    expect(seq.state.beat).toBe('landfall');
    seq.pause();
    vi.advanceTimersByTime(60_000);
    expect(seq.state).toMatchObject({ beat: 'landfall', paused: true });
    seq.resume();
    vi.advanceTimersByTime(399);
    expect(seq.state.beat).toBe('landfall');
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ beat: 'fire', phase: 'playing', paused: false });
  });
});
