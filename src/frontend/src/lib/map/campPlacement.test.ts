// Rules of the TS camp port that do not need the shared golden: the family table, guard range,
// camp count and the placement invariants on synthetic islands. Cross-language parity is
// `campPlacement.golden.test.ts`.
import { describe, expect, it } from 'vitest';
import { hexDistance, type AxialCoord } from '../hex/coords';
import {
  CAMP_FAMILIES,
  MaxCampLevel,
  MinCampIslandTiles,
  MinCampSpacing,
  campCountFor,
  maxSealCampsFor,
  guardRange,
  isStrongCampFamily,
  placeCamps,
} from './campPlacement';
import type { RiverTile, Terrain } from './types';

function block(size: number, terrainOf: (q: number, r: number) => Terrain) {
  const tiles: AxialCoord[] = [];
  const terrain = new Map<string, Terrain>();
  for (let q = 0; q < size; q++) {
    for (let r = 0; r < size; r++) {
      tiles.push({ q, r });
      terrain.set(`${q},${r}`, terrainOf(q, r));
    }
  }
  return { tiles, terrainOf: (c: AxialCoord): Terrain => terrain.get(`${c.q},${c.r}`) ?? 'sea' };
}

describe('camp family table', () => {
  it('has the owner-decided strengths', () => {
    const strong = CAMP_FAMILIES.filter((f) => f.strength === 'strong').map((f) => f.family).sort();
    const weak = CAMP_FAMILIES.filter((f) => f.strength === 'weak').map((f) => f.family).sort();
    expect(strong).toEqual(['bearrapids', 'boarwallow', 'fenrirbrood', 'wolfden']);
    expect(weak).toEqual(['beaverlodge', 'cranedance', 'eagleeyrie', 'moosemire', 'sealhaulout']);
    expect(isStrongCampFamily('wolfden')).toBe(true);
    expect(isStrongCampFamily('sealhaulout')).toBe(false);
    expect(isStrongCampFamily('nonsense')).toBe(false);
  });
});

describe('guardRange / campCountFor', () => {
  it.each([
    [1, 1, 3],
    [2, 2, 4],
    [3, 2, 5],
    [4, 3, 6],
    [5, 3, 7],
  ])('level %i: weak %i, strong %i', (level, weak, strong) => {
    expect(guardRange(level, 'weak')).toBe(weak);
    expect(guardRange(level, 'strong')).toBe(strong);
  });

  it.each([
    [0, 0],
    [6, 0],
    [59, 0],
    [60, 1],
    [349, 1],
    [1049, 1],
    [1050, 2],
    [7000, 10],
    [16800, 24],
    [40000, 24],
  ])('%i land tiles -> %i camps', (tiles, expected) => {
    expect(campCountFor(tiles)).toBe(expected);
  });

  it.each([
    [60, 1],
    [5999, 1],
    [6000, 2],
    [14000, 4],
  ])('%i land tiles -> at most %i seal colonies', (tiles, expected) => {
    expect(maxSealCampsFor(tiles)).toBe(expected);
  });
});

describe('placeCamps', () => {
  it('gives every ground the island has a camp before any ground a second, spaced and level-bounded', () => {
    const { tiles, terrainOf } = block(60, (_q, r) => (['grass', 'forest', 'sand', 'mountain'] as const)[Math.floor(r / 15)]!);
    const placed = placeCamps(tiles, terrainOf, [], [], 5, 2);

    expect(placed).toHaveLength(campCountFor(tiles.length));
    expect(new Set(placed.slice(0, 4).map((p) => p.family)).size).toBe(4);
    for (const p of placed) {
      expect(p.level).toBeGreaterThanOrEqual(1);
      expect(p.level).toBeLessThanOrEqual(MaxCampLevel);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(hexDistance(placed[i]!.coord, placed[j]!.coord)).toBeGreaterThanOrEqual(MinCampSpacing);
      }
    }
  });

  it('keeps off giant footprints and every river tile that is not a straight one', () => {
    const { tiles, terrainOf } = block(40, () => 'grass');
    const rivers: RiverTile[] = [
      { q: 5, r: 5, shape: 'bend', inDirections: ['E'], outDirection: 'NE' },
      { q: 6, r: 5, shape: 'mouth', inDirections: ['E'], outDirection: null },
      { q: 7, r: 5, shape: 'spring', inDirections: [], outDirection: 'E' },
    ];
    const placed = placeCamps(tiles, terrainOf, rivers, [{ q: 20, r: 20 }], 77, 3);
    const blocked = new Set(['20,20', '21,20', '21,19', '20,19', '19,20', '19,21', '20,21', '5,5', '6,5', '7,5']);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) expect(blocked.has(`${p.coord.q},${p.coord.r}`)).toBe(false);
  });

  it('a straight river tile can hold bearrapids, oriented like the plain straight river art', () => {
    // 60 tiles (the smallest island that gets a camp), only the first three of them offer a camp.
    const tiles: AxialCoord[] = Array.from({ length: MinCampIslandTiles }, (_, q) => ({ q, r: 0 }));
    const terrainOf = (c: AxialCoord): Terrain => (c.q < 3 ? 'sand' : 'sea');
    const straight: RiverTile = { q: 1, r: 0, shape: 'straight', inDirections: ['W'], outDirection: 'E' };
    let sawBearrapids = false;
    for (let seed = 0; seed < 40; seed++) {
      const [camp] = placeCamps(tiles, terrainOf, [straight], [], seed, 0);
      if (camp!.coord.q === 1) {
        sawBearrapids = true;
        expect(camp!.family).toBe('bearrapids');
        // straightOrientationOf('W') = TILE_ORIENTATIONS[(2 - 3 + 6) % 6] = 'SE'
        expect(camp!.orientation).toBe('SE');
      } else {
        expect(camp!.family).toBe('sealhaulout');
        expect(camp!.orientation).toBeNull();
      }
    }
    expect(sawBearrapids).toBe(true);
  });

  it('an islet below the minimum size gets no camp, at the minimum it gets one', () => {
    const small = block(7, () => 'sand'); // 49 tiles
    expect(small.tiles.length).toBeLessThan(MinCampIslandTiles);
    expect(placeCamps(small.tiles, small.terrainOf, [], [], 3, 0)).toEqual([]);
    const enough = block(8, () => 'sand'); // 64 tiles
    expect(placeCamps(enough.tiles, enough.terrainOf, [], [], 3, 0)).toHaveLength(1);
  });

  it('a wasted island only offers wasteland (wasted grass) to fenrirbrood', () => {
    const { tiles, terrainOf } = block(30, (q) => (q < 15 ? 'forest' : 'grass'));
    const placed = placeCamps(tiles, terrainOf, [], [], 9, 1, true);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) {
      expect(p.family).toBe('fenrirbrood');
      expect(terrainOf(p.coord)).toBe('grass');
    }
    const onlyForest = block(10, () => 'forest');
    expect(placeCamps(onlyForest.tiles, onlyForest.terrainOf, [], [], 9, 1, true)).toEqual([]);
  });
});
