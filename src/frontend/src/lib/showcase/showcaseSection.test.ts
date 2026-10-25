import { describe, expect, it } from 'vitest';
import { coordKey, neighbors } from '../hex/coords';
import { buildShowcaseSection, lookOf } from './showcaseSection';

const SEEDS = [1, 20260824, 987654321, 42, 7];

describe('buildShowcaseSection', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(buildShowcaseSection(5)).toEqual(buildShowcaseSection(5));
    expect(buildShowcaseSection(5)).not.toEqual(buildShowcaseSection(6));
  });

  it.each(SEEDS)('seed %i: no land hex looks like a neighbour', (seed) => {
    const tiles = buildShowcaseSection(seed);
    const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
    for (const t of tiles) {
      if (t.terrain === 'sea' || t.giant) continue;
      for (const n of neighbors(t)) {
        const other = byKey.get(coordKey(n));
        if (!other || other.terrain === 'sea' || other.giant) continue;
        expect(lookOf(other), `${coordKey(t)} vs ${coordKey(n)}`).not.toBe(lookOf(t));
      }
    }
  });

  it.each(SEEDS)('seed %i: bog hexes are decorated moss, never the plain look', (seed) => {
    const bogs = buildShowcaseSection(seed).filter((t) => t.terrain === 'bog');
    expect(bogs.length).toBeGreaterThan(0);
    for (const t of bogs) {
      expect((t.variant ?? 0) % 9).not.toBe(0);
      expect(t.bog?.kind).toBe('bog');
    }
    expect(buildShowcaseSection(seed).some((t) => t.terrain === 'mountain' || t.terrain === 'lake')).toBe(false);
  });

  it.each(SEEDS)('seed %i: holds a giant mountain, camps and a village', (seed) => {
    const tiles = buildShowcaseSection(seed);
    const giant = tiles.filter((t) => t.giant?.family === 'giantmountain');
    expect(giant).toHaveLength(7);
    expect(new Set(giant.map((t) => t.giant!.part)).size).toBe(7);
    expect(tiles.filter((t) => t.camp).length).toBeGreaterThanOrEqual(2);
    const types = new Set(tiles.map((t) => t.buildingType).filter(Boolean));
    expect(types.size).toBeGreaterThanOrEqual(10);
    expect(types.has('longhouse')).toBe(true);
    expect(tiles.find((t) => t.buildingType === 'longhouse')).toMatchObject({ q: 0, r: 0, buildingLevel: 3 });
    // Camps and buildings never share a hex with the giant.
    expect(tiles.filter((t) => t.giant && (t.camp || t.buildingType))).toEqual([]);
  });

  it('puts the coast buildings on coastal water', () => {
    const tiles = buildShowcaseSection(3);
    const dock = tiles.find((t) => t.buildingType === 'dockyard');
    expect(dock).toMatchObject({ terrain: 'sea', isCoastalWater: true });
    expect(tiles.find((t) => t.buildingType === 'fishinghut')?.terrain).toBe('sea');
  });
});
