// Pure data for the Bog Lands docs page's example map (BogIsland.vue): a real island the game's own bog generator
// produced, not a hand-drawn one. `bogIslandExample.json` is the `green_island_guarantee_spawn` scenario of
// `src/shared/bog-generation-golden.json` (a small island whose bog came from the guaranteed-spawn rule: a creek
// spring, a lake and its shores, a mouth into the sea), copied out so the docs bundle does not carry the fixture's
// 12,000-tile scenarios; bogIsland.test.ts checks the copy still equals the fixture, so a generator change that
// re-freezes the fixture cannot leave this map showing a bog the game no longer makes.
//
// The island is handed to the real `HexMapRenderer` as a plain `Tile[]` (via `StaticWorldModel`, plus its river
// tiles), the way the Wasted Lands island is, so the bog, creek and shore art here is exactly what a world draws.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, type WorldSeed } from '../map/worldGenerator';
import type { BogTile, RiverTile, Terrain, Tile } from '../map/types';
import example from './bogIslandExample.json';

interface Example {
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  rivers: RiverTile[];
  bogs: BogTile[];
}
const island = example as unknown as Example;

const world: WorldSeed = {
  seed: island.worldSeed,
  generation: DEFAULT_GENERATION,
};

/** The island's river tiles (a creek's mouth runs into the sea as one). */
export const BOG_ISLAND_RIVERS: RiverTile[] = island.rivers;

export function buildBogIslandTiles(): Tile[] {
  const bogAt = new Map(island.bogs.map((b) => [coordKey(b), b]));
  const tiles = new Map<string, Tile>();
  const place = (c: AxialCoord, tile: Partial<Tile> & { terrain: Terrain }): void => {
    tiles.set(coordKey(c), {
      q: c.q,
      r: c.r,
      orientation: defaultOrientation(c.q, c.r, world),
      variant: variantForTerrain(c.q, c.r, world, tile.terrain),
      ...tile,
    });
  };

  for (const [q, r, seedTerrain] of island.tiles) {
    const bog = bogAt.get(coordKey({ q, r }));
    if (bog)
      place(
        { q, r },
        {
          terrain: bog.kind === 'lake' ? 'lake' : 'bog',
          bog,
          isCoastalWater: false,
        },
      );
    else place({ q, r }, { terrain: seedTerrain });
  }

  // A ring of coastal water round the land, and a ring of open sea beyond it.
  const land = [...tiles.values()];
  const ring = (from: Tile[], tile: Partial<Tile> & { terrain: Terrain }): Tile[] => {
    const added: Tile[] = [];
    for (const t of from) {
      for (const n of neighbors(t)) {
        if (tiles.has(coordKey(n))) continue;
        place(n, tile);
        added.push(tiles.get(coordKey(n))!);
      }
    }
    return added;
  };
  const coast = ring(land, { terrain: 'sea', isCoastalWater: true });
  ring(coast, { terrain: 'sea' });

  return [...tiles.values()];
}

/** What a hovered hex of the example island is, for its caption: a docs.* i18n key. */
export function bogIslandTileNameKey(tile: Tile, river: RiverTile | undefined): string | null {
  if (river) return 'docs.bogLands.example.river';
  if (tile.bog) {
    if (tile.bog.kind === 'bog') return 'docs.bogLands.ground.heading';
    const shape = tile.bog.kind === 'creekspring' ? 'spring' : tile.bog.kind;
    return `docs.bogLands.water.shapes.${shape}.name`;
  }
  if (tile.terrain === 'sea')
    return tile.isCoastalWater ? 'docs.tiles.entries.coastalWater.title' : 'docs.tiles.entries.sea.title';
  return `docs.tiles.entries.${tile.terrain}.title`;
}
