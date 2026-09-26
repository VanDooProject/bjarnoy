// River generation's cross-language anti-drift guard (frontend half) —
// `src/shared/river-generation-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.RiverGenerationGoldenTests` (backend) — each side
// computes against the same island (tiles/terrain, world seed, island index,
// wasted/allowConfluence flags) using its OWN production river-tracing
// implementation (`generateRivers` here, `RiverGenerator.Generate` there),
// then asserts the fixture's frozen, ORDER-SENSITIVE river tile list. Mirrors
// `giantPlacement.golden.test.ts`'s own pattern for loading a
// `src/shared/*.json` fixture.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/river-generation-golden.json';
import { coordKey, type AxialCoord } from '../hex/coords';
import { DEFAULT_GENERATION, islandDepthAt, terrainAt, wastedDepthAt, type WorldSeed } from './worldGenerator';
import { generateRivers } from './riverGenerator';
import type { RiverTileShape, Terrain, TileOrientation } from './types';

interface RiverScenario {
  name: string;
  worldSeed: number;
  islandIndex: number;
  wasted: boolean;
  allowConfluence: boolean;
  tiles: [number, number, Terrain][];
  rivers: {
    q: number;
    r: number;
    shape: RiverTileShape;
    inDirections: TileOrientation[];
    outDirection: TileOrientation | null;
    wasted: boolean;
  }[];
}

interface GoldenFixture {
  scenarios: RiverScenario[];
}

const fixture = goldenFixtureJson as unknown as GoldenFixture;

describe('river-generation golden fixture (river generation parity)', () => {
  it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario: RiverScenario) => {
    const tiles: AxialCoord[] = scenario.tiles.map(([q, r]) => ({ q, r }));
    const terrainByHex = new Map<string, Terrain>(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
    const terrainOf = (c: AxialCoord): Terrain => terrainByHex.get(coordKey(c)) ?? 'sea';

    // The fixture's tiles/terrain were captured from a real
    // `WorldGenerator.Generate()` run at this exact seed (see the fixture's
    // own `_comment`), so the depth field and global land/sea sampled here —
    // via the same `worldGenerator.ts` this island's terrain itself came
    // from — agree byte-for-byte with what the backend's `TerrainSampler`
    // computed for it.
    const world: WorldSeed = { seed: scenario.worldSeed, generation: DEFAULT_GENERATION };
    const depthAt = (c: AxialCoord) => (scenario.wasted ? wastedDepthAt(c.q, c.r, world) : islandDepthAt(c.q, c.r, world));
    const globalIsLand = (c: AxialCoord) => terrainAt(c.q, c.r, world) !== 'sea';

    const actual = generateRivers(
      tiles,
      terrainOf,
      depthAt,
      globalIsLand,
      scenario.worldSeed,
      scenario.islandIndex,
      scenario.wasted,
      scenario.allowConfluence,
    );

    expect(actual).toEqual(scenario.rivers);
  });
});
