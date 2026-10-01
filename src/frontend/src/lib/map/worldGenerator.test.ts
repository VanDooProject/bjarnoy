// Regression coverage for demo mode showing no island names at all on the
// world map: `stores/world.ts`'s island-name init (`WorldModel.setIslands`)
// only ever ran on the live-world path (fed by `GET /worlds/{id}/islands`),
// so `HexMapRenderer`'s island-label loop had nothing to draw in demo. This
// exercises `enumerateIslands`, demo mode's own island list, directly.
import { describe, expect, it } from 'vitest';
import { hexDistance } from '../hex/coords';
import {
  DEFAULT_GENERATION,
  variantForTerrain,
  enumerateIslands,
  enumerateIslandShapes,
  generateTile,
  islandsTooClose,
  soilAt,
  wastedVariantAt,
  type WorldSeed,
} from './worldGenerator';
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
  // A production-size world: islands ~150 hexes across, ~100+ apart.
  const WORLD_RADIUS = DEFAULT_GENERATION.worldRadius;

  it('finds islands across the world', () => {
    const islands = enumerateIslands(SEED, WORLD_RADIUS);
    expect(islands.length).toBeGreaterThan(5);
  });

  it('only returns islands whose cell centre is within the requested radius', () => {
    const near = enumerateIslands(SEED, 400);
    const all = enumerateIslands(SEED, WORLD_RADIUS);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(all.length);
    // Every island that is left is one the full list has too.
    const allIds = new Set(all.map((i) => i.id));
    for (const island of near) expect(allIds.has(island.id)).toBe(true);
  });

  it('never puts an island beyond the world radius: the world edge drops an island rather than cutting it', () => {
    for (const island of enumerateIslands(SEED, WORLD_RADIUS * 2)) {
      expect(hexDistance({ q: 0, r: 0 }, island)).toBeLessThanOrEqual(WORLD_RADIUS);
    }
  });

  it('gives every island a distinct id and a non-empty name', () => {
    const islands = enumerateIslands(SEED, WORLD_RADIUS);
    const ids = new Set(islands.map((i) => i.id));
    expect(ids.size).toBe(islands.length);
    for (const island of islands) expect(island.name.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and radius', () => {
    expect(enumerateIslands(SEED, WORLD_RADIUS)).toEqual(enumerateIslands(SEED, WORLD_RADIUS));
  });

  it('places each island label on actual land (a crescent\'s middle is water), so WorldModel.islandFootprint has something to measure', () => {
    const model = new WorldModel(SEED.seed, SEED.generation);
    const islands = enumerateIslands(SEED, WORLD_RADIUS);
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

describe('wasted islands and the min gap', () => {
  it('keeps every kept wasted island the min gap away from green islands and from each other', () => {
    for (const seed of [1, 2]) {
      const world: WorldSeed = { seed, generation: DEFAULT_GENERATION };
      const gap = DEFAULT_GENERATION.islandMinGap;
      const green = enumerateIslandShapes(world, false);
      const wasted = enumerateIslandShapes(world, true);
      expect(wasted.length).toBeGreaterThanOrEqual(5);
      for (const w of wasted) {
        expect(green.some((g) => islandsTooClose(w, g, gap))).toBe(false);
        expect(wasted.some((o) => o !== w && islandsTooClose(w, o, gap))).toBe(false);
      }
    }
  });

  it('drops nothing on a legacy world (min gap 0): wasted islands there still crowd green ones', () => {
    const generation = { ...DEFAULT_GENERATION, islandCellSize: 260, islandMaxReach: 0, islandMinGap: 0, islandLargeShare: 0.12 };
    const world: WorldSeed = { seed: 1, generation };
    const green = enumerateIslandShapes(world, false);
    expect(enumerateIslandShapes(world, true).some((w) => green.some((g) => islandsTooClose(w, g, 24)))).toBe(true);
  });
});

// Manual run only (`RUN_MANUAL_TESTS=1 npx vitest run worldGenerator`): the art pack's variants may change, so this is not a CI gate.
describe.runIf(process.env.RUN_MANUAL_TESTS)('variantForTerrain', () => {
  it('never rolls the undecorated plain bog frame, but uses every dressed one', () => {
    const seen = new Set<number>();
    for (let q = -40; q < 40; q++) for (let r = -40; r < 40; r++) seen.add(variantForTerrain(q, r, SEED, 'bog'));
    expect(seen.has(0)).toBe(false);
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('still rolls the lake\'s plain frame (dressed by lake_life) and grass\'s plain frame', () => {
    const lake = new Set<number>();
    const grass = new Set<number>();
    for (let q = -40; q < 40; q++)
      for (let r = -40; r < 40; r++) {
        lake.add(variantForTerrain(q, r, SEED, 'lake'));
        grass.add(variantForTerrain(q, r, SEED, 'grass'));
      }
    expect(lake.has(0)).toBe(true);
    expect(grass.has(0)).toBe(true);
  });
});
