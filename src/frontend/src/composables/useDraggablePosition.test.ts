import { describe, expect, it } from 'vitest';
import { clampToViewport } from './useDraggablePosition';
import { meanInterval } from './useFrameRate';

describe('clampToViewport', () => {
  const vp = { w: 1000, h: 800 };

  it('leaves an on-screen position alone', () => {
    expect(clampToViewport({ left: 300, top: 200 }, vp)).toEqual({ left: 300, top: 200 });
  });

  it('keeps the grip reachable past the right and bottom edges', () => {
    expect(clampToViewport({ left: 5000, top: 5000 }, vp)).toEqual({ left: 960, top: 760 });
  });

  it('never lets the top go above the viewport', () => {
    expect(clampToViewport({ left: 300, top: -50 }, vp).top).toBe(0);
  });
});

describe('meanInterval', () => {
  it('is 0 for no frames', () => {
    expect(meanInterval([])).toBe(0);
  });

  it('averages the intervals', () => {
    expect(meanInterval([10, 20, 60])).toBe(30);
  });
});
