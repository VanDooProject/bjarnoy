import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  DOUBLE_TAP_ZOOM_FACTOR,
  DOUBLE_TAP_ZOOM_MS,
  doubleTapZoomLog,
  isDoubleTap,
} from './doubleTap';

describe('isDoubleTap', () => {
  const first = { at: { x: 100, y: 100 }, timeMs: 1000 };

  it('accepts a second tap close by and quick enough', () => {
    expect(isDoubleTap(first, { at: { x: 110, y: 95 }, timeMs: 1000 + DOUBLE_TAP_MS - 1 })).toBe(true);
  });

  it('rejects a second tap that comes too late', () => {
    expect(isDoubleTap(first, { at: { x: 100, y: 100 }, timeMs: 1000 + DOUBLE_TAP_MS + 1 })).toBe(false);
  });

  it('rejects a second tap too far away — two separate taps on different hexes', () => {
    expect(isDoubleTap(first, { at: { x: 100 + DOUBLE_TAP_SLOP_PX + 1, y: 100 }, timeMs: 1100 })).toBe(false);
  });

  it('rejects a second tap stamped before the first', () => {
    expect(isDoubleTap(first, { at: { x: 100, y: 100 }, timeMs: 900 })).toBe(false);
  });
});

describe('doubleTapZoomLog', () => {
  it('starts at no zoom and ends at exactly the full factor', () => {
    expect(doubleTapZoomLog(0)).toBe(0);
    expect(Math.exp(doubleTapZoomLog(DOUBLE_TAP_ZOOM_MS))).toBeCloseTo(DOUBLE_TAP_ZOOM_FACTOR, 10);
    expect(Math.exp(doubleTapZoomLog(DOUBLE_TAP_ZOOM_MS * 3))).toBeCloseTo(DOUBLE_TAP_ZOOM_FACTOR, 10);
  });

  it('increases monotonically, so per-frame zoomBy steps never zoom back out', () => {
    let prev = 0;
    for (let ms = 10; ms <= DOUBLE_TAP_ZOOM_MS; ms += 10) {
      const v = doubleTapZoomLog(ms);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
