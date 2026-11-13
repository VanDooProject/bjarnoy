import { describe, expect, it } from 'vitest';
import { allocateFromSpots, isGarrisonSpotTile, spotKindsForUnit, spotsNearestFirst, toDispatchFrom } from './garrisonSpots';

describe('isGarrisonSpotTile', () => {
  const centre = { q: 3, r: 3 };
  it('is the centre hex, a tower and a harbour, nothing else', () => {
    expect(isGarrisonSpotTile({ q: 3, r: 3 }, centre)).toBe(true);
    expect(isGarrisonSpotTile({ q: 4, r: 3, buildingType: 'tower' }, centre)).toBe(true);
    expect(isGarrisonSpotTile({ q: 5, r: 3, buildingType: 'harbour' }, centre)).toBe(true);
    expect(isGarrisonSpotTile({ q: 5, r: 4, buildingType: 'hut' }, centre)).toBe(false);
    expect(isGarrisonSpotTile({ q: 6, r: 4 }, centre)).toBe(false);
  });
});

const spot = (kind: 'longhouse' | 'tower' | 'dock', q: number, r: number, stacks: { unit: string; count: number }[]) => ({ kind, q, r, stacks });

describe('allocateFromSpots', () => {
  const longhouse = spot('longhouse', 0, 0, [{ unit: 'spearman', count: 10 }]);
  const tower = spot('tower', 4, 0, [{ unit: 'spearman', count: 3 }, { unit: 'archer', count: 5 }]);

  it('takes from the spot nearest the target first', () => {
    const groups = allocateFromSpots([longhouse, tower], { spearman: 2 }, { q: 6, r: 0 });
    expect(groups).toEqual([{ spot: { q: 4, r: 0 }, kind: 'tower', units: [{ unit: 'spearman', count: 2 }] }]);
  });

  it('fills from the next-nearest spot when the nearest has too few', () => {
    const groups = allocateFromSpots([longhouse, tower], { spearman: 5 }, { q: 6, r: 0 });
    expect(groups.map((g) => [g.kind, g.units])).toEqual([
      ['tower', [{ unit: 'spearman', count: 3 }]],
      ['longhouse', [{ unit: 'spearman', count: 2 }]],
    ]);
  });

  it('allocates every unit type on its own', () => {
    const groups = allocateFromSpots([longhouse, tower], { spearman: 1, archer: 2 }, { q: -3, r: 0 });
    expect(groups).toEqual([
      { spot: { q: 0, r: 0 }, kind: 'longhouse', units: [{ unit: 'spearman', count: 1 }] },
      { spot: { q: 4, r: 0 }, kind: 'tower', units: [{ unit: 'archer', count: 2 }] },
    ]);
  });

  it('breaks distance ties by q, then r', () => {
    const a = spot('tower', 2, 1, [{ unit: 'spearman', count: 5 }]);
    const b = spot('tower', 2, -1, [{ unit: 'spearman', count: 5 }]);
    const c = spot('tower', -2, 1, [{ unit: 'spearman', count: 5 }]);
    expect(spotsNearestFirst([a, b, c], { q: 0, r: 0 }).map((s) => [s.q, s.r])).toEqual([[-2, 1], [2, -1], [2, 1]]);
    expect(allocateFromSpots([a, b, c], { spearman: 1 }, { q: 0, r: 0 })[0].spot).toEqual({ q: -2, r: 1 });
  });

  it('skips zero counts and caps at what stands there', () => {
    const groups = allocateFromSpots([longhouse], { spearman: 99, archer: 0, ghost: 3 }, { q: 0, r: 0 });
    expect(groups).toEqual([{ spot: { q: 0, r: 0 }, kind: 'longhouse', units: [{ unit: 'spearman', count: 10 }] }]);
  });

  it('maps to the request shape and names the kinds a unit comes from', () => {
    const groups = allocateFromSpots([longhouse, tower], { spearman: 5 }, { q: 6, r: 0 });
    expect(toDispatchFrom(groups)).toEqual([
      { spot: { q: 4, r: 0 }, units: [{ unit: 'spearman', count: 3 }] },
      { spot: { q: 0, r: 0 }, units: [{ unit: 'spearman', count: 2 }] },
    ]);
    expect(spotKindsForUnit(groups, 'spearman')).toEqual(['tower', 'longhouse']);
    expect(spotKindsForUnit(groups, 'archer')).toEqual([]);
  });
});
