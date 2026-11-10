import { describe, expect, it } from 'vitest';
import { arrowKeyPanDirection, KEY_TAP_MIN_MS, type ArrowKey, type HeldArrowKey } from './HexMapRenderer';

const held = (pressedAt: number, released = false): HeldArrowKey => ({ pressedAt, released, applied: false });

describe('arrowKeyPanDirection', () => {
  it('still pans for a tap released before the first tick, until the tap minimum is over', () => {
    const keys = new Map<ArrowKey, HeldArrowKey>([['ArrowRight', held(0, true)]]);
    expect(arrowKeyPanDirection(keys, 16)).toEqual({ x: 1, y: 0 });
    expect(arrowKeyPanDirection(keys, KEY_TAP_MIN_MS - 1)).toEqual({ x: 1, y: 0 });
    expect(arrowKeyPanDirection(keys, KEY_TAP_MIN_MS)).toBeNull();
    expect(keys.size).toBe(0);
  });

  it('pans a released tap at least once even when the first tick comes after the tap minimum', () => {
    const keys = new Map<ArrowKey, HeldArrowKey>([['ArrowUp', held(0, true)]]);
    expect(arrowKeyPanDirection(keys, KEY_TAP_MIN_MS * 3)).toEqual({ x: 0, y: -1 });
    expect(arrowKeyPanDirection(keys, KEY_TAP_MIN_MS * 3 + 16)).toBeNull();
  });

  it('keeps a held key as long as it is down', () => {
    const keys = new Map<ArrowKey, HeldArrowKey>([['ArrowDown', held(0)]]);
    expect(arrowKeyPanDirection(keys, 10_000)).toEqual({ x: 0, y: 1 });
    expect(keys.size).toBe(1);
  });

  it('normalises diagonals and cancels opposite keys', () => {
    const diagonal = new Map<ArrowKey, HeldArrowKey>([
      ['ArrowLeft', held(0)],
      ['ArrowUp', held(0)],
    ]);
    const dir = arrowKeyPanDirection(diagonal, 16)!;
    expect(dir.x).toBeCloseTo(-Math.SQRT1_2);
    expect(dir.y).toBeCloseTo(-Math.SQRT1_2);
    const opposite = new Map<ArrowKey, HeldArrowKey>([
      ['ArrowLeft', held(0)],
      ['ArrowRight', held(0)],
    ]);
    expect(arrowKeyPanDirection(opposite, 16)).toBeNull();
  });
});
