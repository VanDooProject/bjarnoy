import { describe, expect, it } from 'vitest';
import { BEACH_CAMP_COST, campLock, CAMP_BUILDERS_PER_CAMP, foundingLock, isCampSite, isShorelineHex, SETTLERS_PER_FOUNDING } from './founding';
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

describe('campLock', () => {
  const stock = (wood: number, stone: number) => ({ wood, stone, food: 0, iron: 0 });

  it('is free with two camp builders at home and the camp\'s wood and brick available', () => {
    expect(campLock(CAMP_BUILDERS_PER_CAMP, stock(200, 100))).toBeNull();
    expect(campLock(5, stock(900, 900))).toBeNull();
  });

  it('locks on camp builders first, even when resources are missing too', () => {
    expect(campLock(1, stock(0, 0))).toEqual({ reason: 'builders', have: 1, need: 2 });
  });

  it('locks on resources when wood or brick falls short', () => {
    expect(campLock(2, stock(199, 100))).toEqual({ reason: 'resources', cost: BEACH_CAMP_COST });
    expect(campLock(2, stock(200, 99))).toEqual({ reason: 'resources', cost: BEACH_CAMP_COST });
  });
});

describe('isCampSite', () => {
  const noGiant = () => null;
  // (0,0) is the subject, the sea lies east of it.
  const terrainOf = (q: number, r: number): Terrain => (q === 1 && r === 0 ? 'sea' : 'grass');
  const sand = { q: 0, r: 0, terrain: 'sand' as Terrain };

  it('takes a free sand hex on the shore', () => {
    expect(isCampSite(sand, terrainOf, noGiant)).toBe(true);
  });

  it('refuses non-sand ground and sand away from the sea', () => {
    expect(isCampSite({ ...sand, terrain: 'grass' }, terrainOf, noGiant)).toBe(false);
    expect(isCampSite(sand, () => 'grass', noGiant)).toBe(false);
  });

  it('refuses a hex with a building, a standing wildlife camp or a giant, but takes one whose camp is gone', () => {
    expect(isCampSite({ ...sand, buildingType: 'tower' }, terrainOf, noGiant)).toBe(false);
    expect(isCampSite({ ...sand, camp: { removed: false } }, terrainOf, noGiant)).toBe(false);
    expect(isCampSite({ ...sand, camp: { removed: true } }, terrainOf, noGiant)).toBe(true);
    expect(isCampSite(sand, terrainOf, () => ({ q: 0, r: 0 }))).toBe(false);
  });
});
