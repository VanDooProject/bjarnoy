import { describe, expect, it, vi } from 'vitest';
import {
  median,
  medianAbsoluteDeviation,
  runPerfSweep,
  sampleFrames,
  summarise,
  type FrameSample,
  type SweepSubject,
} from './perfSweep';

/**
 * A subject backed by a real boolean, so the test asserts on what the flag was
 * actually doing at each point rather than on a call log.
 */
function subject(key: string, state: { [k: string]: boolean }, nested = false): SweepSubject {
  return {
    key,
    label: key,
    nested,
    enabled: () => state[key],
    disable: () => {
      state[key] = false;
    },
    restore: () => {
      state[key] = true;
    },
  };
}

const frame = (medianMs: number, madMs = 0): FrameSample => ({ medianMs, madMs, frames: 10 });

describe('median / MAD', () => {
  it('takes the middle of an even-length sample rather than one side of it', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBe(0);
  });

  it('is not moved by a single long frame, which is the reason it is used', () => {
    // One 900ms hitch (a mask re-bake) among sixteen ordinary frames.
    const quiet = Array.from({ length: 15 }, () => 16);
    expect(median([...quiet, 900])).toBe(16);
    expect(medianAbsoluteDeviation([...quiet, 900])).toBe(0);
    // The mean it replaces would have reported 71ms/frame for that same second.
    const mean = [...quiet, 900].reduce((a, b) => a + b) / 16;
    expect(mean).toBeGreaterThan(70);
  });

  it('reports the dispersion of a genuinely noisy sample', () => {
    expect(summarise([10, 20, 30, 40])).toEqual({ medianMs: 25, madMs: 10, frames: 4 });
  });
});

describe('runPerfSweep', () => {
  it('measures each subject with only that subject off, and restores it after', async () => {
    const state = { a: true, b: true };
    // What was switched off at the moment each sample was taken — the property
    // the whole measurement rests on, since a subject left off would be folded
    // into every row after it.
    const offDuring: string[][] = [];
    const sample = vi.fn(async () => {
      offDuring.push(Object.keys(state).filter((k) => !state[k as 'a']));
      return frame(100);
    });

    await runPerfSweep([subject('a', state), subject('b', state)], sample);

    expect(offDuring).toEqual([[], ['a'], ['b'], []]);
    expect(state).toEqual({ a: true, b: true });
  });

  it('restores the flag even when sampling throws, so a failed sweep leaves the map intact', async () => {
    const state = { a: true };
    const sample = vi.fn(async () => {
      if (sample.mock.calls.length === 2) throw new Error('sampler exploded');
      return frame(100);
    });

    await expect(runPerfSweep([subject('a', state)], sample)).rejects.toThrow('sampler exploded');
    expect(state.a).toBe(true);
  });

  it('takes deltas against the mean of the two baselines and reports the drift between them', async () => {
    const state = { a: true };
    // Machine gets busier under us: 100ms at the start, 120ms by the end.
    const samples = [frame(100), frame(80), frame(120)];
    const sample = vi.fn(async () => samples.shift()!);

    const result = await runPerfSweep([subject('a', state)], sample);

    expect(result.baselineMs).toBe(110);
    expect(result.driftMs).toBe(20);
    expect(result.rows[0].offMs).toBe(80);
    expect(result.rows[0].deltaMs).toBe(30);
  });

  it('calls a delta unresolved when the frame clock wobbled by more than it', async () => {
    const state = { a: true, b: true };
    // Baselines wobble by 12ms; `a` is worth 30ms and `b` only 4ms.
    const samples = [frame(100, 12), frame(70, 5), frame(96, 5), frame(100, 12)];
    const sample = vi.fn(async () => samples.shift()!);

    const result = await runPerfSweep([subject('a', state), subject('b', state)], sample);

    expect(result.rows[0].deltaMs).toBe(30);
    expect(result.rows[0].unresolved).toBe(false);
    expect(result.rows[1].deltaMs).toBe(4);
    expect(result.rows[1].unresolved).toBe(true);
  });

  it('calls a negative delta unresolved rather than reporting a frame that got faster', async () => {
    const state = { a: true };
    // The real renderer produced exactly this on the first run: turning the
    // surface pattern off "cost" 15.8ms, which cannot be what happened.
    const samples = [frame(100, 1), frame(116, 1), frame(100, 1)];
    const sample = vi.fn(async () => samples.shift()!);

    const result = await runPerfSweep([subject('a', state)], sample);

    expect(result.rows[0].deltaMs).toBe(-16);
    expect(result.rows[0].unresolved).toBe(true);
  });

  it('folds baseline drift into the noise floor, so a drifting run cannot report small costs', async () => {
    const state = { a: true };
    // Every sample is individually quiet, but the baseline moved 40ms between
    // the ends of the run — an effect "worth" 20ms here is indistinguishable
    // from where in the run it happened to be measured.
    const samples = [frame(100, 1), frame(80, 1), frame(140, 1)];
    const sample = vi.fn(async () => samples.shift()!);

    const result = await runPerfSweep([subject('a', state)], sample);

    expect(result.driftMs).toBe(40);
    expect(result.rows[0].deltaMs).toBe(40);
    expect(result.rows[0].unresolved).toBe(true);
  });

  it('skips a subject the user already has off instead of reporting it as free', async () => {
    const state = { a: false, b: true };
    const sample = vi.fn(async () => frame(100));

    const result = await runPerfSweep([subject('a', state), subject('b', state)], sample);

    // Three samples, not four: two baselines and `b`.
    expect(sample).toHaveBeenCalledTimes(3);
    expect(result.rows[0]).toMatchObject({ key: 'a', skipped: true, deltaMs: 0 });
    expect(result.rows[1].skipped).toBe(false);
    // And it stays off — the sweep does not quietly switch it back on.
    expect(state.a).toBe(false);
  });

  it('reports progress over the subjects it will actually measure', async () => {
    const state = { a: false, b: true };
    const seen: Array<[number, number]> = [];
    await runPerfSweep([subject('a', state), subject('b', state)], async () => frame(100), (done, total) =>
      seen.push([done, total]),
    );

    expect(seen.every(([, total]) => total === 3)).toBe(true);
    expect(seen.at(-1)).toEqual([3, 3]);
  });
});

describe('sampleFrames', () => {
  /** A rAF that fires immediately, advancing a fake clock by a fixed interval. */
  function fakeClock(intervalMs: number) {
    let t = 0;
    const now = () => t;
    const raf = ((cb: FrameRequestCallback) => {
      t += intervalMs;
      // Queue rather than recurse, or a long run blows the stack.
      queueMicrotask(() => cb(t));
      return 0;
    }) as typeof requestAnimationFrame;
    return { now, raf };
  }

  it('drops the warmup frames, which pay for the flag change rather than for the effect', async () => {
    const { now, raf } = fakeClock(10);
    const sample = await sampleFrames({ frames: 4, maxMs: 10_000, warmup: 2 }, raf, now);
    expect(sample.frames).toBe(4);
    expect(sample.medianMs).toBe(10);
  });

  it('stops at the time bound when frames are slow, rather than waiting for the count', async () => {
    // 250ms/frame is what the software rasteriser does (§4.2d); 24 frames of it
    // would be six seconds per row.
    const { now, raf } = fakeClock(250);
    const sample = await sampleFrames({ frames: 24, maxMs: 3_000, warmup: 2 }, raf, now);
    expect(sample.frames).toBeLessThan(24);
    expect(sample.frames).toBeGreaterThan(4);
    expect(sample.medianMs).toBe(250);
  });
});
