// The Wasted Lands docs page's Utgard example map (UtgardExample.vue): a real wasted island the game's own world generator produced, not a
// hand-drawn one. `utgardIslandExample.json` is the `docs_utgard_example` scenario of `src/shared/endgame-placement-golden.json` (a
// mid-sized wasted island with Utgard, both wall lines, a watchtower between them and a lava stream), copied out so the docs bundle does
// not carry the fixture's other scenarios; utgardExample.test.ts checks the copy still equals the fixture, so a generator change that
// re-freezes the fixture cannot leave this map showing an island the game no longer makes.
//
// The defences are not placed here at all: `placeEndgame` (lib/map/endgamePlacement.ts, the golden-tested port of the backend's
// EndgameGenerator) decides the Utgard wall lines, their gates and the Jötun watchtowers over the scenario's real inputs, and they are
// tagged on the tiles exactly as the world model tags them (`Tile.utgardWall` / `Tile.jotunTower`, see `WorldModel.setUtgardWalls`), so
// the game's own renderer draws them the way it does on a live island. The lava streams and the camps are traced by the game's own
// generators the way `WorldModel.placeGiantsForIsland` does (the test checks their coordinates against the fixture).
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { campGuardRange, isStrongCampFamily, placeCamps } from '../map/campPlacement';
import { InnerRingLevel, OuterRingLevel, RingBands, placeEndgame } from '../map/endgamePlacement';
import { giantCoverage } from '../map/giantTiles';
import { UtgardFamily } from '../map/giantPlacement';
import { generateRivers } from '../map/riverGenerator';
import type { RiverTile, Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, terrainAt, variantForTerrain, wastedDepthAt, wastedVariantAt, type WorldSeed } from '../map/worldGenerator';
import example from './utgardIslandExample.json';

interface Example {
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  rivers: [number, number][];
  giants: { q: number; r: number; family: string }[];
  camps: [number, number][];
}
const island = example as unknown as Example;

/** The fixture's islands come from radius-1000 worlds (the backend tests' `TestWorlds.Options`), which the depth field and the looks are sampled from. */
export const UTGARD_EXAMPLE_WORLD: WorldSeed = { seed: island.worldSeed, generation: { ...DEFAULT_GENERATION, worldRadius: 1000 } };

/** Utgard's anchor: the centre hex of its seven. */
export const UTGARD_CENTRE: AxialCoord = (() => {
  const g = island.giants.find((x) => x.family === UtgardFamily)!;
  return { q: g.q, r: g.r };
})();

/** The two rings the endgame generator builds: the band of distances from the anchor their wall may wander in, and the wall level they stand at. */
export const UTGARD_RINGS = [
  { id: 'inner', band: RingBands.inner, level: InnerRingLevel },
  { id: 'outer', band: RingBands.outer, level: OuterRingLevel },
] as const;

/** Rings of sea round the land: the first is coastal water, the others open sea. */
const SEA_RINGS = 3;

const landHexes: AxialCoord[] = island.tiles.map(([q, r]) => ({ q, r }));
const terrainByKey = new Map(island.tiles.map(([q, r, t]) => [coordKey({ q, r }), t]));
/** The island's terrain by hex, straight from the generator's wasted layer; everything else is sea. */
function terrainOf(c: AxialCoord): Terrain {
  return terrainByKey.get(coordKey(c)) ?? 'sea';
}
const riverKeys = new Set(island.rivers.map(([q, r]) => coordKey({ q, r })));

/** The island's lava streams, traced by the game's own generator (`generateRivers`, wasted) exactly as `WorldModel.placeGiantsForIsland` calls it. */
export function buildUtgardExampleStreams(): RiverTile[] {
  return generateRivers(
    landHexes,
    terrainOf,
    (c) => wastedDepthAt(c.q, c.r, UTGARD_EXAMPLE_WORLD),
    (c) => terrainAt(c.q, c.r, UTGARD_EXAMPLE_WORLD) !== 'sea',
    island.worldSeed,
    island.islandIndex,
    true,
    false,
  );
}

export type UtgardExampleKind = 'utgard' | 'volcano' | 'camp' | 'wall' | 'gate' | 'tower' | 'mountain' | 'lava' | 'wasteland' | 'coast';

/** What a hovered hex is; `stream` is the lava stream on it, if any (a stream's art replaces the ground under it). */
export function utgardExampleKindOf(tile: Tile, stream?: RiverTile): UtgardExampleKind {
  if (tile.giant) return tile.giant.family === UtgardFamily ? 'utgard' : 'volcano';
  if (tile.camp) return 'camp';
  if (stream) return 'lava';
  if (tile.utgardWall) return tile.utgardWall.isGate ? 'gate' : 'wall';
  if (tile.jotunTower) return 'tower';
  if (tile.terrain === 'mountain') return 'mountain';
  return tile.terrain === 'sea' ? 'coast' : 'wasteland';
}

/** The island as the map tiles the game's own renderer draws, defences from `placeEndgame`. */
export function buildUtgardExampleTiles(): Tile[] {
  const tiles = new Map<string, Tile>();
  const place = (c: AxialCoord, terrain: Terrain, extra: Partial<Tile> = {}): void => {
    tiles.set(coordKey(c), {
      q: c.q,
      r: c.r,
      terrain,
      wasted: true,
      orientation: defaultOrientation(c.q, c.r, UTGARD_EXAMPLE_WORLD),
      // A wasted land hex rolls its look with the game's own weights (`WorldModel.getTile`), not the living grass roll.
      variant:
        terrain === 'sea'
          ? variantForTerrain(c.q, c.r, UTGARD_EXAMPLE_WORLD, terrain)
          : wastedVariantAt(c.q, c.r, UTGARD_EXAMPLE_WORLD, terrain),
      ...extra,
    });
  };
  for (const c of landHexes) place(c, terrainOf(c));
  const orientationOf = (c: AxialCoord) => tiles.get(coordKey(c))!.orientation ?? 'SE';
  // Every giant, tagged the way `WorldModel.setGiants` does: a forest hex under it is flattened to grass.
  for (const g of island.giants) {
    const anchor = { q: g.q, r: g.r };
    const orientation = orientationOf(anchor);
    for (const { coord, part } of giantCoverage(anchor)) {
      const tile = tiles.get(coordKey(coord))!;
      if (tile.terrain === 'forest') {
        tile.terrain = 'grass';
        delete tile.forestKind;
      }
      tile.giant = { family: g.family as NonNullable<Tile['giant']>['family'], anchor, part, orientation };
    }
  }
  const streams = buildUtgardExampleStreams();
  const giants = island.giants.map((g) => ({ anchor: { q: g.q, r: g.r }, family: g.family }));
  const camps = placeCamps(landHexes, terrainOf, streams, giants.map((g) => g.anchor), island.worldSeed, island.islandIndex, true);
  for (const camp of camps) {
    const tile = tiles.get(coordKey(camp.coord))!;
    tile.camp = {
      family: camp.family,
      level: camp.level,
      orientation: camp.orientation ?? orientationOf(camp.coord),
      strong: isStrongCampFamily(camp.family),
      guardRange: campGuardRange(camp.family, camp.level),
    };
  }
  const sites = placeEndgame(
    landHexes,
    terrainOf,
    (c) => riverKeys.has(coordKey(c)),
    giants,
    new Set(island.camps.map(([q, r]) => coordKey({ q, r }))),
    island.worldSeed,
    island.islandIndex,
  );
  for (const w of sites.walls) {
    const tile = tiles.get(coordKey(w.coord)) ?? (place(w.coord, 'sea', { isCoastalWater: true }), tiles.get(coordKey(w.coord))!);
    tile.utgardWall = { ring: w.ring, piece: w.piece, dir: w.dir, isGate: w.isGate, level: w.level };
  }
  for (const c of sites.towers) tiles.get(coordKey(c))!.jotunTower = { orientation: orientationOf(c), level: 2 };
  // The sea round the land: the coast ring as coastal water, then open sea, so there is water in frame.
  for (let ring = 0; ring < SEA_RINGS; ring++) {
    for (const t of [...tiles.values()]) {
      for (const n of neighbors(t)) if (!tiles.has(coordKey(n))) place(n, 'sea', ring === 0 ? { isCoastalWater: true } : {});
    }
  }
  return [...tiles.values()];
}

/** How many land hexes the island has (what the tower count is worked out from). */
export function utgardLandHexes(tiles: readonly Tile[] = buildUtgardExampleTiles()): number {
  return tiles.filter((t) => t.terrain !== 'sea').length;
}
