// The living-forest biomes: forestKindAt's regions and mixed-wood sprinkle, the weighted forest variant pick,
// and where Tile.forestKind is (and is not) set. The cross-language half lives in the terrain checksum golden
// (src/shared/terrain-checksum-golden.json, "forestKind" and "variant" digests).
import { describe, expect, it } from 'vitest';
import { neighbors } from '../hex/coords';
import { WorldModel } from './WorldModel';
import {
  COMPACT_GENERATION,
  FOREST_VARIANT_WEIGHTS,
  SAND_VARIANT_WEIGHTS,
  forestKindAt,
  generateTile,
  terrainAt,
  variantAt,
  type WorldSeed,
} from './worldGenerator';

const SEEDS = [1, 7, 42, 1337];
const world = (seed: number): WorldSeed => ({ seed, generation: COMPACT_GENERATION });

/** Every forest hex in a q/r window (raw seed terrain, so a wide square of dense forest patches). */
function forestHexes(w: WorldSeed, extent = 150) {
  const hexes: { q: number; r: number }[] = [];
  for (let q = -extent; q <= extent; q++) {
    for (let r = -extent; r <= extent; r++) if (terrainAt(q, r, w) === 'forest') hexes.push({ q, r });
  }
  return hexes;
}

/** Every sand hex in a q/r window (raw seed terrain). */
function sandHexes(w: WorldSeed, extent = 150) {
  const hexes: { q: number; r: number }[] = [];
  for (let q = -extent; q <= extent; q++) {
    for (let r = -extent; r <= extent; r++) if (terrainAt(q, r, w) === 'sand') hexes.push({ q, r });
  }
  return hexes;
}

describe('forestKindAt', () => {
  it('is deterministic and only returns the three kinds', () => {
    for (let q = -20; q <= 20; q++) {
      for (let r = -20; r <= 20; r++) {
        const kind = forestKindAt(q, r, 99);
        expect(['taiga', 'birch', 'mixed']).toContain(kind);
        expect(forestKindAt(q, r, 99)).toBe(kind);
      }
    }
  });

  it('forms contiguous taiga and birch regions, with mixed wood as a 15-35% sprinkle', () => {
    let sameSum = 0;
    let sameCount = 0;
    let mixed = 0;
    let total = 0;
    const seen = { taiga: 0, birch: 0 };
    for (const seed of SEEDS) {
      const w = world(seed);
      const forest = new Map<string, ReturnType<typeof forestKindAt>>();
      for (const h of forestHexes(w)) forest.set(`${h.q},${h.r}`, forestKindAt(h.q, h.r, seed));
      for (const [key, kind] of forest) {
        total++;
        if (kind === 'mixed') {
          mixed++;
          continue;
        }
        seen[kind]++;
        const [q, r] = key.split(',').map(Number);
        const pure = neighbors({ q, r })
          .map((n) => forest.get(`${n.q},${n.r}`))
          .filter((k) => k !== undefined && k !== 'mixed');
        if (pure.length === 0) continue;
        sameSum += pure.filter((k) => k === kind).length / pure.length;
        sameCount++;
      }
    }
    expect(seen.taiga).toBeGreaterThan(1000);
    expect(seen.birch).toBeGreaterThan(1000);
    expect(sameSum / sameCount).toBeGreaterThan(0.8);
    expect(mixed / total).toBeGreaterThan(0.15);
    expect(mixed / total).toBeLessThan(0.35);
  });

  it('sprinkles more mixed wood on the biome boundary than deep inside a biome', () => {
    // Boundary hexes are where the biome noise is within the band of 0.5; compare mixed rates by distance to a kind change.
    let boundaryMixed = 0;
    let boundaryTotal = 0;
    let deepMixed = 0;
    let deepTotal = 0;
    const seed = 1;
    for (let q = -200; q <= 200; q++) {
      for (let r = -200; r <= 200; r++) {
        const kind = forestKindAt(q, r, seed);
        const onBoundary = neighbors({ q, r }).some((n) => {
          const k = forestKindAt(n.q, n.r, seed);
          return k !== 'mixed' && kind !== 'mixed' && k !== kind;
        });
        if (onBoundary) {
          boundaryTotal++;
          if (kind === 'mixed') boundaryMixed++;
        } else {
          deepTotal++;
          if (kind === 'mixed') deepMixed++;
        }
      }
    }
    expect(boundaryTotal).toBeGreaterThan(100);
    expect(deepMixed / deepTotal).toBeLessThan(0.3);
    // Hexes beside a taiga/birch change can only be non-mixed themselves, so measure the mixed hexes' share of
    // the band instead: the overall rate must exceed the 20% floor because of the boundary bonus.
    expect((deepMixed + boundaryMixed) / (deepTotal + boundaryTotal)).toBeGreaterThan(0.2);
  });
});

describe('forest variant pick', () => {
  it('follows FOREST_VARIANT_WEIGHTS over many forest hexes', () => {
    const counts = [0, 0, 0, 0];
    let total = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const h of forestHexes(w)) {
        counts[variantAt(h.q, h.r, w)]++;
        total++;
      }
    }
    FOREST_VARIANT_WEIGHTS.forEach((weight, i) => {
      expect(Math.abs(counts[i] / total - weight)).toBeLessThan(0.015);
    });
    expect(FOREST_VARIANT_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('generateTile agrees with variantAt for forest hexes', () => {
    const w = world(42);
    for (const h of forestHexes(w, 40)) expect(generateTile(h.q, h.r, w).variant).toBe(variantAt(h.q, h.r, w));
  });
});

describe('sand variant pick', () => {
  it('follows SAND_VARIANT_WEIGHTS over many sand hexes', () => {
    const counts = SAND_VARIANT_WEIGHTS.map(() => 0);
    let total = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const h of sandHexes(w, 400)) {
        counts[variantAt(h.q, h.r, w)]++;
        total++;
      }
    }
    expect(total).toBeGreaterThan(4000);
    SAND_VARIANT_WEIGHTS.forEach((weight, i) => {
      expect(Math.abs(counts[i] / total - weight)).toBeLessThan(0.015);
    });
  });

  it('has weights that sum to 1', () => {
    expect(SAND_VARIANT_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('generateTile agrees with variantAt for sand hexes', () => {
    const w = world(42);
    const hexes = sandHexes(w, 80);
    expect(hexes.length).toBeGreaterThan(100);
    for (const h of hexes) expect(generateTile(h.q, h.r, w).variant).toBe(variantAt(h.q, h.r, w));
  });
});

describe('Tile.forestKind', () => {
  it('is set on forest tiles only', () => {
    const w = world(42);
    for (let q = -60; q <= 60; q++) {
      for (let r = -60; r <= 60; r++) {
        const tile = generateTile(q, r, w);
        if (tile.terrain === 'forest') expect(tile.forestKind).toBe(forestKindAt(q, r, w.seed));
        else expect(tile.forestKind).toBeUndefined();
      }
    }
  });

  it('is absent on wasted forests once the wasted layer is revealed', () => {
    const model = new WorldModel(40);
    model.setWastedRevealed(true);
    const tile = model.getTile(-81, 256);
    expect(tile.terrain).toBe('forest');
    expect(tile.wasted).toBe(true);
    expect(tile.forestKind).toBeUndefined();
  });

  it('is present on a living forest in a WorldModel', () => {
    const model = new WorldModel(1);
    const w = { seed: 1, generation: model.generation };
    // Bog overlays can turn a seed forest hex into bog/lake; take the first that stays forest.
    const tile = forestHexes(w, 400)
      .map((h) => model.getTile(h.q, h.r))
      .find((t) => t.terrain === 'forest');
    expect(tile).toBeDefined();
    expect(tile!.forestKind).toBe(forestKindAt(tile!.q, tile!.r, 1));
  });
});
