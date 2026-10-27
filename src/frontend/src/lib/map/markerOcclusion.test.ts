import { describe, expect, it } from 'vitest';
import {
  MARKER_FADE_MS,
  circleIntersectsRect,
  circlesIntersect,
  markerFadeStep,
  ringFootprint,
} from './markerOcclusion';

describe('ringFootprint', () => {
  it('reaches the far edge of the farthest bubble', () => {
    const fp = ringFootprint({ x: 100, y: 100 }, [
      { x: 168, y: 100, r: 26 },
      { x: 100, y: 218, r: 23 },
    ]);
    expect(fp).toEqual({ x: 100, y: 100, r: 141 });
  });

  it('grows with an outer lane and shrinks back without it', () => {
    const lane1 = [{ x: 168, y: 100, r: 26 }];
    const inner = ringFootprint({ x: 100, y: 100 }, lane1);
    const outer = ringFootprint({ x: 100, y: 100 }, [...lane1, { x: 100, y: 218, r: 23 }]);
    expect(outer.r).toBeGreaterThan(inner.r);
    expect(ringFootprint({ x: 100, y: 100 }, lane1).r).toBe(inner.r);
  });

  it('never drops below the hub', () => {
    expect(ringFootprint({ x: 0, y: 0 }, [], 33).r).toBe(33);
  });
});

describe('intersection', () => {
  it('circles intersect when their gap is within the radii sum', () => {
    expect(circlesIntersect({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 5 })).toBe(true);
    expect(circlesIntersect({ x: 0, y: 0, r: 10 }, { x: 15.1, y: 0, r: 5 })).toBe(false);
  });

  it('circle vs rect: inside, edge, corner and clear', () => {
    const rect = { x: 10, y: 10, w: 20, h: 10 };
    expect(circleIntersectsRect({ x: 20, y: 15, r: 1 }, rect)).toBe(true);
    expect(circleIntersectsRect({ x: 5, y: 15, r: 5 }, rect)).toBe(true);
    expect(circleIntersectsRect({ x: 5, y: 5, r: 7.1 }, rect)).toBe(true);
    expect(circleIntersectsRect({ x: 5, y: 5, r: 7 }, rect)).toBe(false);
    expect(circleIntersectsRect({ x: 100, y: 100, r: 10 }, rect)).toBe(false);
  });
});

describe('markerFadeStep', () => {
  it('fades out over MARKER_FADE_MS and back in', () => {
    let v = markerFadeStep(1, true, MARKER_FADE_MS / 2, false);
    expect(v).toBeCloseTo(0.5);
    v = markerFadeStep(v, true, MARKER_FADE_MS, false);
    expect(v).toBe(0);
    v = markerFadeStep(v, false, MARKER_FADE_MS / 4, false);
    expect(v).toBeCloseTo(0.25);
    expect(markerFadeStep(v, false, MARKER_FADE_MS, false)).toBe(1);
  });

  it('is instant under reduced motion', () => {
    expect(markerFadeStep(1, true, 1, true)).toBe(0);
    expect(markerFadeStep(0, false, 1, true)).toBe(1);
  });
});
