import { describe, expect, it } from 'vitest';
import { BEATS } from './beats/registry';
import { beatsFor, holdMinMs } from './introVoice';
import {
  allLoaded,
  buildTimeline,
  chapterAt,
  chapterIndexAt,
  fmtTime,
  gatedLoadFraction,
  seekLimitMs,
  selectBeats,
  type LoadRow,
} from './timeline';

const beats = beatsFor('en', BEATS);
const landing = buildTimeline(selectBeats(beats, 'landing'), holdMinMs('en'));

describe('buildTimeline', () => {
  it('has one chapter per played beat, back to back: clip + tail for intro beats, the hold minimum, the exit', () => {
    expect(landing.chapters.map((c) => c.id)).toEqual(['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall']);
    let t = 0;
    for (const c of landing.chapters) {
      expect(c.startMs).toBe(t);
      t += c.durMs;
    }
    expect(landing.totalMs).toBe(t);
    const hold = landing.chapters.find((c) => c.id === 'hold')!;
    expect(hold.durMs).toBe(holdMinMs('en'));
    expect(landing.chapters.find((c) => c.id === 'landfall')!.durMs).toBe(BEATS.find((b) => b.role === 'exit')!.durationMs);
  });

  it('loop: only the selected beats, in story order', () => {
    const picked = selectBeats(beats, 'loop', ['landfall', 'prophecy']);
    const tl = buildTimeline(picked, holdMinMs('en'));
    expect(tl.chapters.map((c) => c.id)).toEqual(['prophecy', 'landfall']);
    expect(tl.chapters[1].startMs).toBe(tl.chapters[0].durMs);
  });

  it('loop: no (or an empty) selection plays every beat', () => {
    expect(selectBeats(beats, 'loop').map((b) => b.id)).toHaveLength(6);
    expect(selectBeats(beats, 'loop', []).map((b) => b.id)).toHaveLength(6);
  });
});

describe('chapterAt', () => {
  it('finds the chapter a position falls in; a boundary belongs to the later one, the end to the last', () => {
    const [fire, prophecy] = landing.chapters;
    expect(chapterAt(landing, 0).id).toBe('fire');
    expect(chapterAt(landing, fire.durMs - 1).id).toBe('fire');
    expect(chapterAt(landing, fire.durMs).id).toBe('prophecy');
    expect(chapterAt(landing, prophecy.startMs + 1).id).toBe('prophecy');
    expect(chapterIndexAt(landing, landing.totalMs)).toBe(landing.chapters.length - 1);
    expect(chapterIndexAt(landing, landing.totalMs + 5000)).toBe(landing.chapters.length - 1);
  });
});

describe('fmtTime', () => {
  it('shows whole seconds as m:ss', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(12_999)).toBe('0:12');
    expect(fmtTime(65_000)).toBe('1:05');
    expect(fmtTime(-5)).toBe('0:00');
  });
});

describe('seekLimitMs', () => {
  it('is the total, or the hold end while gated', () => {
    const hold = landing.chapters.find((c) => c.id === 'hold')!;
    expect(seekLimitMs(landing, false)).toBe(landing.totalMs);
    expect(seekLimitMs(landing, true)).toBe(hold.startMs + hold.durMs);
  });
});

describe('load groups', () => {
  const row = (id: LoadRow['id'], loaded: number, total: number, gating = id !== 'animations'): LoadRow => ({ id, loaded, total, gating });

  it('the gated fraction is the mean of voices, terrain and buildings; a group not reported counts 0', () => {
    expect(gatedLoadFraction([])).toBe(0);
    expect(gatedLoadFraction([row('voices', 6, 6)])).toBeCloseTo(1 / 3);
    expect(gatedLoadFraction([row('voices', 6, 6), row('terrain', 3, 9), row('buildings', 0, 11)])).toBeCloseTo((1 + 1 / 3) / 3);
    // the animations never gate
    expect(gatedLoadFraction([row('animations', 5, 5)])).toBe(0);
  });

  it('is all loaded when every gating group has reported and finished, and so has the animations once it reports', () => {
    const done = [row('voices', 6, 6), row('terrain', 9, 9), row('buildings', 11, 11)];
    expect(allLoaded(done)).toBe(true);
    expect(allLoaded(done.slice(0, 2))).toBe(false);
    expect(allLoaded([...done, row('animations', 3, 25)])).toBe(false);
    expect(allLoaded([...done, row('animations', 25, 25)])).toBe(true);
  });
});
