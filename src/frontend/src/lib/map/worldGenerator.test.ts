// Regression coverage for demo mode showing no island names at all on the
// world map: `stores/world.ts`'s island-name init (`WorldModel.setIslands`)
// only ever ran on the live-world path (fed by `GET /worlds/{id}/islands`),
// so `HexMapRenderer`'s island-label loop had nothing to draw in demo. This
// exercises `enumerateIslands`, demo mode's own island list, directly.
import { describe, expect, it } from 'vitest';
import { hexDistance } from '../hex/coords';
import { DEFAULT_GENERATION, enumerateIslands, generateTile, soilAt, wastedVariantAt, type WorldSeed } from './worldGenerator';
import { WorldModel } from './WorldModel';

const SEED: WorldSeed = { seed: 20260824, generation: DEFAULT_GENERATION };

describe('soilAt', () => {
  it('is seed-stable for the same island centre', () => {
    for (const centre of [
      { q: 0, r: 0 },
      { q: 15, r: -8 },
      { q: -20, r: 4 },
    ]) {
      const a = soilAt(centre.q, centre.r, SEED);
      const b = soilAt(centre.q, centre.r, SEED);
      expect(a).toBe(b);
    }
  });

  it('produces both crops over a sample of island centres, not always the same one', () => {
    const crops = new Set<string>();
    for (let q = 0; q < 60; q++) {
      crops.add(soilAt(q, 0, SEED));
    }
    expect(crops).toEqual(new Set(['wheat', 'pumpkin']));
  });
});

describe('enumerateIslands', () => {
  it('finds at least one island within a modest radius of the origin', () => {
    const islands = enumerateIslands(SEED, 30);
    expect(islands.length).toBeGreaterThan(0);
  });

  it('only returns islands within the requested radius', () => {
    const radius = 30;
    for (const island of enumerateIslands(SEED, radius)) {
      expect(hexDistance({ q: 0, r: 0 }, island)).toBeLessThanOrEqual(radius);
    }
  });

  it('gives every island a distinct id and a non-empty name', () => {
    const islands = enumerateIslands(SEED, 40);
    const ids = new Set(islands.map((i) => i.id));
    expect(ids.size).toBe(islands.length);
    for (const island of islands) expect(island.name.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and radius', () => {
    expect(enumerateIslands(SEED, 30)).toEqual(enumerateIslands(SEED, 30));
  });

  it('places each island centre on actual land, so WorldModel.islandFootprint has something to measure', () => {
    const model = new WorldModel(SEED.seed, SEED.generation);
    const islands = enumerateIslands(SEED, 30);
    expect(islands.length).toBeGreaterThan(0);
    for (const island of islands) {
      expect(model.isLand(island.q, island.r)).toBe(true);
    }
  });
});

describe('wastedVariantAt', () => {
  const world: WorldSeed = { seed: 20260824, generation: DEFAULT_GENERATION };
  const histogram = (terrain: 'grass' | 'forest' | 'sand') => {
    const counts: number[] = [];
    for (let q = -60; q < 60; q++) {
      for (let r = -60; r < 60; r++) {
        const v = wastedVariantAt(q, r, world, terrain);
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    return counts;
  };

  it('reaches every wasteland variant, lava ones included, with the rune crack the rarest', () => {
    const counts = histogram('grass');
    expect(counts).toHaveLength(6);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(counts[3] / total).toBeLessThan(0.1);
    expect((counts[4] + counts[5]) / total).toBeGreaterThan(0.15);
    for (const c of counts) expect(c).toBeGreaterThan(0);
  });

  it('does not pin a variant to one orientation', () => {
    // Regression: salted next to orientation's hash, every variant only ever
    // showed in a single rotation.
    const rotations = new Map<number, Set<string>>();
    for (let q = -30; q < 30; q++) {
      for (let r = -30; r < 30; r++) {
        const v = wastedVariantAt(q, r, world, 'grass');
        const o = generateTile(q, r, world).orientation ?? 'SE';
        if (!rotations.has(v)) rotations.set(v, new Set());
        rotations.get(v)!.add(o);
      }
    }
    for (const seen of rotations.values()) expect(seen.size).toBe(6);
  });

  it('uses both frames of dead forest and black sand', () => {
    expect(histogram('forest')).toHaveLength(2);
    expect(histogram('sand')).toHaveLength(2);
  });
});
