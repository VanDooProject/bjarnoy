// Regression coverage for demo mode showing no island names at all on the
// world map: `stores/world.ts`'s island-name init (`WorldModel.setIslands`)
// only ever ran on the live-world path (fed by `GET /worlds/{id}/islands`),
// so `HexMapRenderer`'s island-label loop had nothing to draw in demo. This
// exercises `enumerateIslands`, demo mode's own island list, directly.
import { describe, expect, it } from 'vitest';
import { hexDistance } from '../hex/coords';
import { DEFAULT_GENERATION, enumerateIslands, type WorldSeed } from './worldGenerator';
import { WorldModel } from './WorldModel';

const SEED: WorldSeed = { seed: 20260824, generation: DEFAULT_GENERATION };

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
