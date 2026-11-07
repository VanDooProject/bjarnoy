import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroSequencer, type IntroState } from './sequencer';
import type { BeatId, BeatMeta } from './beats/types';

const beats: BeatMeta[] = [
  { id: 'fire', role: 'intro', durationMs: 1000 },
  { id: 'prophecy', role: 'intro', durationMs: 1000 },
  { id: 'ravens', role: 'intro', durationMs: 1000 },
  { id: 'sending', role: 'intro', durationMs: 1000 },
  { id: 'hold', role: 'hold', durationMs: 600, loopMs: 600 },
  { id: 'landfall', role: 'exit', durationMs: 500 },
];

// The landing waits for the player to start the saga; most tests are about the run itself and start it at once (`playNow`).
function make(mode: 'landing' | 'replay' | 'loop', reducedMotion = false, holdMinMs?: number, loopBeats?: BeatId[], playNow = mode === 'landing') {
  const changes: IntroState[] = [];
  const seq = new IntroSequencer({ beats, mode, reducedMotion, holdMinMs, loopBeats, playNow, onChange: (s) => changes.push(s) });
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

  // A fast load must not cut the story short: the ravens play like every other beat.
  it('plays the ravens even when the tiles are loaded from the start', () => {
    const { seq } = make('landing');
    seq.start();
    seq.notifyLoaded();
    vi.advanceTimersByTime(2000);
    expect(seq.state.beat).toBe('ravens');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('sending');
  });

  // Fast loads are the common case: the hold's voice clip must still play out before landfall.
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

describe('IntroSequencer landing page', () => {
  it.each([false, true])('waits on the first frame until play, then runs as normal (reduced motion: %s)', (reducedMotion) => {
    const { seq } = make('landing', reducedMotion, undefined, undefined, false);
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    vi.advanceTimersByTime(5000);
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    seq.play();
    expect(seq.state.phase).toBe('playing');
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('prophecy');
  });

  it('plays at once when the player asked for it, also with reduced motion and the tiles already loaded', () => {
    const seq = new IntroSequencer({ beats, mode: 'landing', reducedMotion: true, playNow: true, onChange: () => {} });
    seq.notifyLoaded();
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire' });
  });

  it.each([false, true])('keeps waiting for the player when the tiles load first (reduced motion: %s)', (reducedMotion) => {
    const { seq } = make('landing', reducedMotion, undefined, undefined, false);
    seq.start();
    seq.notifyLoaded();
    expect(seq.state.phase).toBe('waitingForPlay');
    seq.play();
    vi.advanceTimersByTime(4000);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'hold' });
  });

  it('keeps waiting when the tiles are loaded already at start', () => {
    const { seq } = make('landing', true, undefined, undefined, false);
    seq.notifyLoaded();
    seq.start();
    expect(seq.state.phase).toBe('waitingForPlay');
  });
});

describe('IntroSequencer reduced motion', () => {
  it('replay waits on the first frame until play, then runs as normal', () => {
    const { seq } = make('replay', true);
    seq.start();
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', beat: 'fire' });
    seq.play();
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('prophecy');
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

  it('plays every beat and ignores loading', () => {
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

  it('counts a round per pass: a single loop beat bumps it on every pass while the beat stays', () => {
    const { seq } = make('loop', false, undefined, [first.id]);
    seq.start();
    expect(seq.state).toMatchObject({ beat: first.id, round: 0 });
    vi.advanceTimersByTime(first.durationMs);
    expect(seq.state).toMatchObject({ beat: first.id, round: 1 });
    vi.advanceTimersByTime(first.durationMs);
    expect(seq.state).toMatchObject({ beat: first.id, round: 2 });
  });

  it('bumps the round only on the wrap with several beats, also when the exit beat is last', () => {
    const { seq } = make('loop', false, undefined, [first.id, last.id]);
    seq.start();
    expect(seq.state.round).toBe(0);
    vi.advanceTimersByTime(first.durationMs);
    expect(seq.state).toMatchObject({ beat: last.id, round: 0 });
    vi.advanceTimersByTime(last.durationMs);
    expect(seq.state).toMatchObject({ beat: first.id, round: 1 });
  });

  it('bumps the round once when skip leads back to the first beat', () => {
    const { seq } = make('loop', false, undefined, ['prophecy', 'sending']);
    seq.start();
    seq.skip();
    expect(seq.state.round).toBe(0);
    vi.advanceTimersByTime(last.durationMs);
    expect(seq.state).toMatchObject({ beat: 'prophecy', round: 1 });
  });

  it('keeps the round at 0 in landing and replay mode', () => {
    for (const mode of ['landing', 'replay'] as const) {
      const { seq, changes } = make(mode);
      seq.start();
      vi.advanceTimersByTime(4000 + 600 + last.durationMs);
      seq.notifyLoaded();
      vi.advanceTimersByTime(last.durationMs);
      expect(changes.every((c) => c.round === 0)).toBe(true);
    }
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
    const { seq } = make('landing', true, undefined, undefined, false);
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

  it('works in loop mode too, across the wrap', () => {
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

describe('IntroSequencer seek', () => {
  // 4 intro beats of 1000, hold of 600 (its minimum), landfall of 500: chapters start at 0, 1000, 2000, 3000, 4000, 4600; total 5100
  const hold = 4000;
  const landfall = 4600;
  const total = 5100;

  it('enters the beat at the position and schedules only what is left of it', () => {
    const { seq } = make('landing', false, 600);
    seq.start();
    seq.seek(2250);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'ravens', offsetMs: 250, seq: 1, paused: false });
    vi.advanceTimersByTime(749);
    expect(seq.state.beat).toBe('ravens');
    vi.advanceTimersByTime(1);
    expect(seq.state.beat).toBe('sending');
  });

  it('seek(0) goes back to the first beat from the middle of the story, and the old timers are gone', () => {
    const { seq } = make('landing');
    seq.start();
    vi.advanceTimersByTime(2500);
    expect(seq.state.beat).toBe('ravens');
    seq.seek(0);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire', cycle: 0, paused: false, offsetMs: 0 });
    vi.advanceTimersByTime(999);
    expect(seq.state.beat).toBe('fire');
    vi.advanceTimersByTime(1);
    expect(seq.state.beat).toBe('prophecy');
  });

  it('counts every seek, also within the same beat', () => {
    const { seq } = make('landing');
    seq.start();
    seq.seek(100);
    seq.seek(200);
    expect(seq.state).toMatchObject({ beat: 'fire', seq: 2, offsetMs: 200 });
  });

  it('replay: leaves the exit beat for an earlier one and does not finish from the old exit timer', () => {
    const { seq } = make('replay');
    seq.start();
    seq.skip();
    expect(seq.state.phase).toBe('exiting');
    vi.advanceTimersByTime(400);
    seq.seek(0);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire' });
    vi.advanceTimersByTime(200);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire' });
  });

  it('seeking into the hold keeps what is left of its minimum', () => {
    const { seq } = make('landing', false, 600);
    seq.start();
    seq.seek(hold + 400);
    expect(seq.state).toMatchObject({ beat: 'hold', offsetMs: 400, waiting: false });
    seq.notifyLoaded();
    vi.advanceTimersByTime(199);
    expect(seq.state.beat).toBe('hold');
    vi.advanceTimersByTime(1);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall' });
  });

  it('forgets the hold progress: the hold has to be reached and read again', () => {
    const { seq } = make('landing', false, 100);
    seq.start();
    vi.advanceTimersByTime(4200);
    expect(seq.state.beat).toBe('hold');
    seq.seek(0);
    seq.notifyLoaded();
    vi.advanceTimersByTime(3000);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'sending' });
  });

  describe('landing, tiles not loaded', () => {
    it('clamps to the hold end and parks there, waiting', () => {
      const { seq } = make('landing', false, 600);
      seq.start();
      seq.seek(total);
      expect(seq.state).toMatchObject({ phase: 'playing', beat: 'hold', waiting: true, offsetMs: 600 });
      expect(seq.positionMs()).toBe(hold + 600);
      vi.advanceTimersByTime(60_000);
      expect(seq.state).toMatchObject({ phase: 'playing', beat: 'hold', waiting: true });
    });

    it('the hold keeps looping while it waits, and loading then starts the exit', () => {
      const { seq } = make('landing', false, 600);
      seq.start();
      seq.seek(landfall);
      expect(seq.state.cycle).toBe(1); // 600 ms in: one loop of 600 ms is behind it
      vi.advanceTimersByTime(1250);
      expect(seq.state).toMatchObject({ beat: 'hold', cycle: 3 });
      seq.notifyLoaded();
      expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', waiting: false });
    });

    it('waits when the playhead reaches the hold end by itself', () => {
      const { seq } = make('landing', false, 600);
      seq.start();
      vi.advanceTimersByTime(hold + 599);
      expect(seq.state.waiting).toBe(false);
      vi.advanceTimersByTime(1);
      expect(seq.state.waiting).toBe(true);
      expect(seq.positionMs()).toBe(hold + 600);
    });
  });

  describe('landing, tiles loaded', () => {
    it('seeking into the landfall is a skip at that offset', () => {
      const { seq } = make('landing', false, 600);
      seq.start();
      seq.notifyLoaded();
      seq.seek(landfall + 200);
      expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', offsetMs: 200 });
      vi.advanceTimersByTime(299);
      expect(seq.state.phase).toBe('exiting');
      vi.advanceTimersByTime(1);
      expect(seq.state.phase).toBe('done');
    });

    it('is locked while the exit runs', () => {
      const { seq } = make('landing', false, 600);
      seq.start();
      seq.notifyLoaded();
      seq.skip();
      const before = seq.state;
      seq.seek(0);
      expect(seq.state).toEqual(before);
    });
  });

  it('is ignored before play and after the end', () => {
    const { seq } = make('replay');
    seq.seek(2000);
    expect(seq.state).toMatchObject({ phase: 'waitingForPlay', seq: 0 });
    seq.start();
    seq.skip();
    vi.advanceTimersByTime(500);
    expect(seq.state.phase).toBe('ended');
    seq.seek(0);
    expect(seq.state.phase).toBe('ended');
  });

  it('clamps to [0, total]', () => {
    const { seq } = make('replay', false, 600);
    seq.start();
    seq.seek(-50);
    expect(seq.state).toMatchObject({ beat: 'fire', offsetMs: 0 });
    seq.seek(total + 1000);
    expect(seq.state).toMatchObject({ beat: 'landfall', offsetMs: 500 });
    vi.advanceTimersByTime(0);
    expect(seq.state.phase).toBe('ended');
  });

  it('a paused run stays paused: the timers are set up for the new position and frozen', () => {
    const { seq } = make('replay', false, 600);
    seq.start();
    seq.pause();
    seq.seek(2500);
    expect(seq.state).toMatchObject({ beat: 'ravens', paused: true, offsetMs: 500 });
    expect(seq.positionMs()).toBe(2500);
    vi.advanceTimersByTime(10_000);
    expect(seq.state.beat).toBe('ravens');
    expect(seq.positionMs()).toBe(2500);
    seq.resume();
    vi.advanceTimersByTime(499);
    expect(seq.state.beat).toBe('ravens');
    vi.advanceTimersByTime(1);
    expect(seq.state.beat).toBe('sending');
  });

  it('loop: goes back to the first selected beat and works over the loop list only', () => {
    const { seq } = make('loop', false, undefined, ['prophecy', 'ravens']);
    seq.start();
    vi.advanceTimersByTime(1000);
    expect(seq.state.beat).toBe('ravens');
    seq.seek(0);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'prophecy' });
    expect(seq.timeline.totalMs).toBe(2000);
    seq.seek(1500);
    expect(seq.state).toMatchObject({ beat: 'ravens', offsetMs: 500 });
    vi.advanceTimersByTime(500);
    expect(seq.state).toMatchObject({ beat: 'prophecy', round: 1 });
  });

  it('loop: seeking into the exit beat sets the exiting phase, and the loop wraps after it', () => {
    const { seq } = make('loop', false, 600, ['fire', 'landfall']);
    seq.start();
    seq.seek(1100);
    expect(seq.state).toMatchObject({ phase: 'exiting', beat: 'landfall', offsetMs: 100 });
    vi.advanceTimersByTime(400);
    expect(seq.state).toMatchObject({ phase: 'playing', beat: 'fire', round: 1 });
  });

  describe('positionMs', () => {
    it('is 0 before play, counts the clock into the beats, freezes while paused and ends at the total', () => {
      const { seq } = make('replay', false, 600);
      expect(seq.positionMs()).toBe(0);
      seq.start();
      vi.advanceTimersByTime(1250);
      expect(seq.positionMs()).toBe(1250);
      seq.pause();
      vi.advanceTimersByTime(5000);
      expect(seq.positionMs()).toBe(1250);
      seq.resume();
      vi.advanceTimersByTime(250);
      expect(seq.positionMs()).toBe(1500);
      seq.skip();
      vi.advanceTimersByTime(500);
      expect(seq.state.phase).toBe('ended');
      expect(seq.positionMs()).toBe(total);
    });
  });
});

describe('IntroSequencer close', () => {
  it('stops every timer and emits nothing afterwards', () => {
    const { seq, changes } = make('landing');
    seq.start();
    vi.advanceTimersByTime(500);
    const n = changes.length;
    seq.close();
    seq.notifyLoaded();
    vi.advanceTimersByTime(20000);
    expect(changes).toHaveLength(n);
    expect(vi.getTimerCount()).toBe(0);
  });
});
