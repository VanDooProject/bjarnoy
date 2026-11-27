import { describe, expect, it } from 'vitest';
import { FrameActivity, type FrameEnv } from './frameActivity';

const live: FrameEnv = { hidden: false, focused: true };

function run(activity: FrameActivity, intervals: number[], env: FrameEnv = live) {
  return intervals.map((ms) => activity.classify(ms, env));
}

/** Enough steady 60 fps frames to be past any settling. */
function warm(activity: FrameActivity) {
  run(activity, new Array<number>(90).fill(16));
}

describe('FrameActivity', () => {
  it('counts steady 60fps frames as active', () => {
    const activity = new FrameActivity();
    const out = run(activity, new Array<number>(100).fill(16));
    expect(out.every((c) => c.mode === 'active' && c.reason === null)).toBe(true);
  });

  it('a hidden document is background', () => {
    const activity = new FrameActivity();
    warm(activity);
    const c = activity.classify(16, { hidden: true, focused: true });
    expect(c).toMatchObject({ mode: 'background', reason: 'hidden', resumed: true });
  });

  it('an unfocused window is background', () => {
    const activity = new FrameActivity();
    warm(activity);
    const c = activity.classify(16, { hidden: false, focused: false });
    expect(c).toMatchObject({ mode: 'background', reason: 'unfocused', resumed: true });
  });

  it('flags only the edges, not every background frame', () => {
    const activity = new FrameActivity();
    warm(activity);
    const out = run(activity, [16, 16, 16], { hidden: true, focused: true });
    expect(out.map((c) => c.resumed)).toEqual([true, false, false]);
  });

  it('a gap over 250ms is background and starts settling', () => {
    const activity = new FrameActivity();
    warm(activity);
    expect(activity.classify(300, live)).toMatchObject({ mode: 'background', reason: 'settling', resumed: true });
    expect(activity.classify(16, live)).toMatchObject({ mode: 'background', reason: 'settling' });
  });

  it('is active again 1s of frame time after returning', () => {
    const activity = new FrameActivity();
    warm(activity);
    activity.classify(16, { hidden: true, focused: true });
    // 63 frames of 16ms cover the 1000ms (the last one crosses it), then active.
    const settling = run(activity, new Array<number>(63).fill(16));
    expect(settling.every((c) => c.reason === 'settling')).toBe(true);
    const next = activity.classify(16, live);
    expect(next).toMatchObject({ mode: 'active', reason: null, resumed: true });
  });

  it('detects a metronomic 33.3ms cap as throttled', () => {
    const activity = new FrameActivity();
    const out = run(activity, new Array<number>(40).fill(1000 / 30));
    expect(out[out.length - 1]).toMatchObject({ mode: 'background', reason: 'throttled' });
    expect(out[10].reason).toBeNull();
  });

  it('does not treat a jittery ~34ms device as throttled', () => {
    const activity = new FrameActivity();
    const out = run(activity, Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 28 : 40)));
    expect(out.every((c) => c.mode === 'active')).toBe(true);
  });

  it('does not treat a metronomic 16.7ms display as throttled', () => {
    const activity = new FrameActivity();
    const out = run(activity, new Array<number>(100).fill(1000 / 60));
    expect(out.every((c) => c.mode === 'active')).toBe(true);
  });

  it('settles for 1s after a throttled stretch ends', () => {
    const activity = new FrameActivity();
    run(activity, new Array<number>(40).fill(1000 / 30));
    // The cap lifts: jittery frames enter the window and end the metronome.
    const out = run(activity, [16, 20, 12, 18, 14]);
    expect(out.every((c) => c.mode === 'background')).toBe(true);
    expect(out[out.length - 1].reason).toBe('settling');
  });
});
