import { describe, expect, it } from 'vitest';
import { foundingLock, isShorelineHex, SETTLERS_PER_FOUNDING } from './founding';
import type { Terrain } from './map/types';

const renown = (canFoundAnother: boolean) => ({ total: 120.7, requiredForNextSettlement: 300.2, canFoundAnother });

describe('foundingLock', () => {
  it('is free when five settlers are home and renown allows another settlement', () => {
    expect(foundingLock(SETTLERS_PER_FOUNDING, renown(true))).toBeNull();
    expect(foundingLock(12, renown(true))).toBeNull();
  });

  it('locks on settlers first, even when renown is also missing or unknown', () => {
    expect(foundingLock(4, renown(true))).toEqual({ reason: 'settlers', have: 4, need: 5 });
    expect(foundingLock(0, renown(false))).toEqual({ reason: 'settlers', have: 0, need: 5 });
    expect(foundingLock(2, null)).toEqual({ reason: 'settlers', have: 2, need: 5 });
  });

  it('locks on renown with the totals when the server says no more settlements', () => {
    expect(foundingLock(5, renown(false))).toEqual({ reason: 'renown', total: 120.7, required: 300.2 });
  });

  it('reports unknown renown while it has not loaded', () => {
    expect(foundingLock(5, null)).toEqual({ reason: 'renownUnknown' });
  });
});

describe('isShorelineHex', () => {
  // Hex (0,0) is the subject; its neighbours are the six offsets, everything else is `fill`.
  const world = (own: Terrain, around: Partial<Record<string, Terrain>>, fill: Terrain = 'grass') =>
    (q: number, r: number): Terrain => (q === 0 && r === 0 ? own : (around[`${q},${r}`] ?? fill));

  it('is true for land with a sea neighbour, whatever its own terrain', () => {
    for (const own of ['sand', 'grass', 'forest', 'mountain', 'bog'] as const) {
      expect(isShorelineHex({ q: 0, r: 0 }, world(own, { '1,0': 'sea' }))).toBe(true);
    }
  });

  it('is false for inland land, and for a hex only touching a lake', () => {
    expect(isShorelineHex({ q: 0, r: 0 }, world('sand', {}))).toBe(false);
    expect(isShorelineHex({ q: 0, r: 0 }, world('grass', { '0,1': 'lake' }))).toBe(false);
  });

  it('is false for water itself', () => {
    expect(isShorelineHex({ q: 0, r: 0 }, world('sea', {}, 'sea'))).toBe(false);
    expect(isShorelineHex({ q: 0, r: 0 }, world('lake', { '1,0': 'sea' }))).toBe(false);
  });
});
