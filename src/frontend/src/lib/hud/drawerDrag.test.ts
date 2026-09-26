import { describe, expect, it } from 'vitest';
import { clampOffset, shouldOpenOnRelease } from './drawerDrag';

describe('clampOffset', () => {
  it('clamps to [0, height]', () => {
    expect(clampOffset(-40, 200)).toBe(0);
    expect(clampOffset(0, 200)).toBe(0);
    expect(clampOffset(120, 200)).toBe(120);
    expect(clampOffset(500, 200)).toBe(200);
  });

  it('returns 0 for a non-positive height', () => {
    expect(clampOffset(50, 0)).toBe(0);
    expect(clampOffset(50, -10)).toBe(0);
  });
});

describe('shouldOpenOnRelease', () => {
  const height = 200;
  const ratio = 0.3;
  const flick = 0.5;

  it('opens once the drag passes the distance threshold', () => {
    expect(shouldOpenOnRelease(59, height, 0, ratio, flick)).toBe(false);
    expect(shouldOpenOnRelease(60, height, 0, ratio, flick)).toBe(true);
    expect(shouldOpenOnRelease(200, height, 0, ratio, flick)).toBe(true);
  });

  it('stays closed short of the threshold with no flick', () => {
    expect(shouldOpenOnRelease(10, height, 0, ratio, flick)).toBe(false);
  });

  it('a fast opening flick opens even far short of the distance threshold', () => {
    expect(shouldOpenOnRelease(5, height, 0.8, ratio, flick)).toBe(true);
  });

  it('a fast closing flick closes even past the distance threshold', () => {
    expect(shouldOpenOnRelease(190, height, -0.8, ratio, flick)).toBe(false);
  });

  it('is always closed for a zero-height drawer', () => {
    expect(shouldOpenOnRelease(0, 0, 2, ratio, flick)).toBe(false);
  });
});
