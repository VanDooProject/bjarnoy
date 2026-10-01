import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/bog-generation-golden.json';
import example from './bogIslandExample.json';
import { BOG_ISLAND_RIVERS, bogIslandTileNameKey, buildBogIslandTiles } from './bogIsland';
import { coordKey } from '../hex/coords';

const golden = (goldenFixtureJson as unknown as { scenarios: { name: string }[] }).scenarios.find(
  (s) => s.name === 'green_island_guarantee_spawn',
);

describe('bog lands example island', () => {
  it('is still the generator-frozen scenario it was copied from', () => {
    expect(golden).toBeDefined();
    const { worldSeed, islandIndex, tiles, rivers, bogs } = golden as unknown as typeof example;
    expect(example).toEqual({ worldSeed, islandIndex, tiles, rivers, bogs });
  });

  it('draws every bog hex as bog or lake, every river hex on land, and ringed by water', () => {
    const tiles = buildBogIslandTiles();
    const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
    expect(byKey.size).toBe(tiles.length);
    for (const bog of example.bogs) {
      const tile = byKey.get(coordKey(bog))!;
      expect(tile.terrain).toBe(bog.kind === 'lake' ? 'lake' : 'bog');
      expect(tile.bog).toEqual(bog);
    }
    for (const river of BOG_ISLAND_RIVERS) expect(byKey.get(coordKey(river))?.terrain).not.toBe('sea');
    expect(tiles.some((t) => t.terrain === 'sea' && t.isCoastalWater)).toBe(true);
    expect(tiles.some((t) => t.terrain === 'sea' && !t.isCoastalWater)).toBe(true);
  });

  it('names every bog kind, river and land tile for the hover caption', () => {
    for (const tile of buildBogIslandTiles()) {
      const river = BOG_ISLAND_RIVERS.find((r) => r.q === tile.q && r.r === tile.r);
      expect(bogIslandTileNameKey(tile, river)).toMatch(/^docs\./);
    }
  });
});
