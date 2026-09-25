import { describe, expect, it } from 'vitest';
import { clipFrameIndex, clipTimingOf, type ClipTiming } from './clipPlayback';

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
