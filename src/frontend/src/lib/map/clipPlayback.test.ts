import { describe, expect, it } from 'vitest';
import { advanceClipFrame, clipFrameIndex, clipTimingOf, type ClipTiming } from './clipPlayback';

const loop: ClipTiming = { frameCount: 4, fps: 4, playback: 'loop', pause: 0 };
const loopWithPause: ClipTiming = {
  frameCount: 4,
  fps: 4,
  playback: 'loop',
  pause: 0.5,
}; // 2 extra steps
const pingpong: ClipTiming = {
  frameCount: 4,
  fps: 4,
  playback: 'pingpong',
  pause: 0,
}; // cycle = 6 steps: 0,1,2,3,2,1

describe('clipFrameIndex', () => {
  it('advances one frame per fps-period for a loop clip', () => {
    expect(clipFrameIndex(loop, 0)).toBe(0);
    expect(clipFrameIndex(loop, 250)).toBe(1);
    expect(clipFrameIndex(loop, 500)).toBe(2);
    expect(clipFrameIndex(loop, 750)).toBe(3);
  });

  it('wraps a loop clip back to frame 0 after a full cycle', () => {
    expect(clipFrameIndex(loop, 1000)).toBe(0);
    expect(clipFrameIndex(loop, 1250)).toBe(1);
  });

  it("holds the last frame during a loop clip's pause tail", () => {
    // 4 frames + 2 pause steps = 6-step cycle; steps 4 and 5 hold frame 3.
    expect(clipFrameIndex(loopWithPause, 4 * 250)).toBe(3);
    expect(clipFrameIndex(loopWithPause, 5 * 250)).toBe(3);
    // Then it wraps back to frame 0 for the next cycle.
    expect(clipFrameIndex(loopWithPause, 6 * 250)).toBe(0);
  });

  it('bounces a pingpong clip 0..n-1..1 and back to 0', () => {
    const steps = [0, 1, 2, 3, 4, 5, 6].map((s) => clipFrameIndex(pingpong, s * 250));
    expect(steps).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });

  it('treats a single-frame clip as always frame 0', () => {
    const single: ClipTiming = {
      frameCount: 1,
      fps: 4,
      playback: 'loop',
      pause: 0,
    };
    expect(clipFrameIndex(single, 0)).toBe(0);
    expect(clipFrameIndex(single, 5000)).toBe(0);
  });

  it('never throws and returns 0 for an empty clip', () => {
    const empty: ClipTiming = {
      frameCount: 0,
      fps: 4,
      playback: 'loop',
      pause: 0,
    };
    expect(clipFrameIndex(empty, 1234)).toBe(0);
  });
});

describe('clipTimingOf', () => {
  it('adapts a resolved clip (frameRects array) into a ClipTiming', () => {
    const resolved = {
      frameRects: [1, 2, 3],
      fps: 8,
      playback: 'pingpong' as const,
      pause: 0.25,
    };
    expect(clipTimingOf(resolved)).toEqual({
      frameCount: 3,
      fps: 8,
      playback: 'pingpong',
      pause: 0.25,
    });
  });
});

// The map's own per-hex clip player (HexMapRenderer.advanceTopAnimations)
// ticks through advanceClipFrame. Before it did, it stepped frames at the
// clip's fps and wrapped straight back to frame 0, never reading `pause` -
// so a clip like the Tor shrine's lightning (8 frames at 12 fps, then an 8 s
// hold) struck every 0.67 s on the map instead of every ~8.7 s.
describe('advanceClipFrame', () => {
  const lightning: ClipTiming = { frameCount: 8, fps: 12, playback: 'loop', pause: 8 };
  const tickMs = 1000 / 60;

  /** Runs a 60 fps ticker for `ms` and returns the frame shown at the end, plus every frame change seen. */
  function play(clip: ClipTiming, ms: number, state = { playedMs: 0, frame: 0 }) {
    const changes: number[] = [];
    for (let t = 0; t < ms; t += tickMs) {
      const frame = advanceClipFrame(clip, state, tickMs);
      if (frame !== undefined) changes.push(frame);
    }
    return { state, changes };
  }

  it('plays the strike once, then holds its last frame for the pause', () => {
    const { state, changes } = play(lightning, 8000);
    expect(changes).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.frame).toBe(7);
  });

  it('starts the next strike only after the pause has run out', () => {
    // one cycle = 8 frames + 8 s * 12 fps = 104 steps = 8.667 s
    const { state, changes } = play(lightning, 8700);
    expect(changes).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(state.frame).toBe(0);
  });

  it('wraps straight round without a pause, as every clip did on the map before', () => {
    const { changes } = play({ ...lightning, pause: 0 }, 1000);
    expect(changes.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  it('only reports a frame when it changes, so the caller swaps a texture no more than once per frame', () => {
    const state = { playedMs: 0, frame: 0 };
    expect(advanceClipFrame(lightning, state, 10)).toBeUndefined();
    expect(advanceClipFrame(lightning, state, 80)).toBe(1);
    expect(advanceClipFrame(lightning, state, 1)).toBeUndefined();
  });
});
