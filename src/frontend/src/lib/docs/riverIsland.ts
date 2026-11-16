// Pure data for the Rivers docs page's example map (RiverIsland.vue): a real island the game's own generators made, not a hand-drawn
// one. `riverIslandExample.json` is the `green_island_mixed_with_bearrapids` scenario of `src/shared/camp-placement-golden.json` (an
// island with springs, streams, two widenings, a stream-into-river confluence, a river confluence, two mouths into the sea, the
// bear rapids camp on its river and three more camps), copied out so the docs bundle does not carry the fixture's other scenarios.
// The fixture holds the island's seed terrain and plain bog only, so the rest of its bogland (the lake and its shores, a creek) is
// what the game's own bog generator makes over the same island (`bogs` in the JSON, checked in riverIsland.test.ts); riverIsland.test.ts
// also checks the copy still equals the fixture, so a generator change that re-freezes it cannot leave this map showing an island the
// game no longer makes.
//
// The island is handed to the real `HexMapRenderer` through a `StaticWorldModel`, tile by tile as `WorldModel.getTile` makes them
// (`generateTile`): its giants are `placeGiants`' (the family the fixture's anchors lack), its camps the fixture's, tagged the way
// `WorldModel.setCamps` does. A small realm of the viewer stands beside the river (`RIVER_ISLAND_BUILDINGS`), claimed by the model
// itself, so the gold border and every building follow the game's own rules.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { campGuardRange, isStrongCampFamily } from '../map/campPlacement';
import { giantCoverage } from '../map/giantTiles';
import { placeGiants } from '../map/giantPlacement';
import { StaticWorldModel } from '../map/StaticWorldModel';
import type { BogTile, RiverTile, Terrain, Tile, TileOrientation } from '../map/types';
import { DEFAULT_GENERATION, generateTile, type WorldSeed } from '../map/worldGenerator';
import { buildingName, giantName } from '../../i18n/catalogueNames';
import example from './riverIslandExample.json';

interface Example {
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  rivers: RiverTile[];
  bogs: BogTile[];
  giants: [number, number][];
  camps: { q: number; r: number; family: string; level: number; orientation: TileOrientation | null }[];
}
const island = example as unknown as Example;

/** The fixture's islands come from radius-1000 worlds (the backend tests' `TestWorlds.Options`), which the river art variants are sampled from. */
export const RIVER_ISLAND_WORLD: WorldSeed = { seed: island.worldSeed, generation: { ...DEFAULT_GENERATION, worldRadius: 1000 } };

/** The island's river tiles: every spring, stream, widening, confluence and mouth of it. */
export const RIVER_ISLAND_RIVERS: RiverTile[] = island.rivers;

/** The settlement and the account that owns it: the viewer's own realm gets the gold border. */
export const RIVER_ISLAND_SETTLEMENT = 'docs-river';
export const RIVER_ISLAND_PLAYER = 'docs';

/** Rings of sea round the land: the first is coastal water, the other open sea. */
const SEA_RINGS = 2;

/** The hex the map is framed on (the fit takes the whole island, so this only seeds the preview). */
export const RIVER_ISLAND_CENTRE: AxialCoord = (() => {
  const qs = island.tiles.map((t) => t[0]);
  const rs = island.tiles.map((t) => t[1]);
  return { q: Math.round((Math.min(...qs) + Math.max(...qs)) / 2), r: Math.round((Math.min(...rs) + Math.max(...rs)) / 2) };
})();

/** The island's ground as the game makes it: terrain (bog and lake from the bog generator), coastal water, two rings of sea, giants and camps. */
export function buildRiverIslandGround(): Tile[] {
  const terrainByKey = new Map(island.tiles.map(([q, r, t]) => [coordKey({ q, r }), t]));
  const bogAt = new Map(island.bogs.map((b) => [coordKey(b), b]));
  const terrainOf = (c: AxialCoord): Terrain => terrainByKey.get(coordKey(c)) ?? 'sea';
  const tiles = new Map<string, Tile>();
  const place = (c: AxialCoord): Tile => {
    const tile = generateTile(c.q, c.r, RIVER_ISLAND_WORLD, (q, r) => terrainOf({ q, r }));
    const bog = bogAt.get(coordKey(c));
    if (bog) tile.bog = bog;
    tiles.set(coordKey(c), tile);
    return tile;
  };
  for (const [q, r] of island.tiles) place({ q, r });
  for (let ring = 0; ring < SEA_RINGS; ring++) {
    const added: AxialCoord[] = [];
    for (const t of tiles.values()) for (const n of neighbors(t)) if (!tiles.has(coordKey(n))) added.push(n);
    // Sea to `terrainOf`, so `generateTile` makes the ring beside the land coastal water (with its coast art) and the next one open sea.
    for (const c of added) if (!tiles.has(coordKey(c))) place(c);
  }

  // Giants, as `WorldModel.setGiants` tags them: a forest hex under one is flattened to grass. The fixture lists the anchors; the
  // family is what `placeGiants` (the world generator's own pass) says for them.
  const landHexes: AxialCoord[] = island.tiles.map(([q, r]) => ({ q, r }));
  const riverKeys = new Set(island.rivers.map((r) => coordKey(r)));
  const placements = placeGiants(landHexes, terrainOf, island.worldSeed, island.islandIndex, (c) => riverKeys.has(coordKey(c)));
  for (const g of placements) {
    const orientation = tiles.get(coordKey(g.anchor))!.orientation ?? 'SE';
    for (const { coord, part } of giantCoverage(g.anchor)) {
      const tile = tiles.get(coordKey(coord))!;
      if (tile.terrain === 'forest') {
        tile.terrain = 'grass';
        delete tile.forestKind;
      }
      tile.giant = { family: g.family, anchor: g.anchor, part, orientation };
    }
  }

  // Camps, as `WorldModel.setCamps` tags them.
  for (const camp of island.camps) {
    const tile = tiles.get(coordKey(camp))!;
    tile.camp = {
      family: camp.family,
      level: camp.level,
      orientation: camp.orientation ?? tile.orientation ?? 'SE',
      strong: isStrongCampFamily(camp.family),
      guardRange: campGuardRange(camp.family, camp.level),
    };
  }
  return [...tiles.values()];
}

/**
 * The viewer's realm, as the snapshot a world's server sends. Chosen by a search over this island with the game's own placement
 * functions (`WorldModel.hexTakesBuilding`, `bridgePlacement`), then fixed here; riverIsland.test.ts checks every placement against the
 * rules again, so a rule change that makes one illegal fails there instead of drawing a building the game would refuse.
 *
 * - The Longhouse (level 20, the level the mills unlock at, claim 3) stands on grass 9 hexes from the Bear rapids: a start position keeps
 *   `guardRange + StartPositionMargin` (6 + 2) away from a strong camp.
 * - The Sawmill on a plain Bend river hex and the Crop Mill on a plain Straight one (both on grass under the river, wide river, not a
 *   Loop), the Bridge on a wide Straight hex; each inside the claim.
 * - Two Lumberjacks on forest within the Sawmill's range, two Farms on grass within the Crop Mill's (the mills are level 5, range 2).
 * - What the buildings unlock behind: a level-10 Lumberjack (Sawmill), a level-10 Farm (Crop Mill) and a level-3 Reindeer Herder (Farm), a Town Square (Bridge).
 */
export const RIVER_ISLAND_LONGHOUSE: AxialCoord = { q: -36, r: 252 };
export const RIVER_ISLAND_LONGHOUSE_LEVEL = 20;
export const RIVER_ISLAND_BUILDINGS: { q: number; r: number; type: string; level: number }[] = [
  { ...RIVER_ISLAND_LONGHOUSE, type: 'longhouse', level: RIVER_ISLAND_LONGHOUSE_LEVEL },
  { q: -33, r: 250, type: 'sawmill', level: 5 },
  { q: -33, r: 251, type: 'cropmill', level: 5 },
  { q: -35, r: 250, type: 'bridge', level: 2 },
  { q: -34, r: 249, type: 'lumberjack', level: 10 },
  { q: -33, r: 249, type: 'lumberjack', level: 10 },
  { q: -34, r: 251, type: 'farm', level: 10 },
  { q: -34, r: 252, type: 'farm', level: 10 },
  { q: -35, r: 253, type: 'townsquare', level: 1 },
  { q: -35, r: 252, type: 'reindeerherder', level: 3 },
];

/**
 * A model showing the island: the ground, the rivers, then the viewer's settlement with its buildings, claimed by the model itself
 * (`WorldModel.applyServerSnapshot`), so the gold border runs round the realm and every building stands inside it. `buildings` defaults
 * to the page's own realm.
 */
export function riverIslandWorld(buildings = RIVER_ISLAND_BUILDINGS): StaticWorldModel {
  const world = new StaticWorldModel(buildRiverIslandGround(), RIVER_ISLAND_WORLD.seed, RIVER_ISLAND_WORLD.generation);
  world.setRivers(RIVER_ISLAND_RIVERS);
  const zero = { wood: 0, stone: 0, food: 0, iron: 0 };
  world.registerSettlement({
    id: RIVER_ISLAND_SETTLEMENT,
    ownerId: RIVER_ISLAND_PLAYER,
    ownerName: RIVER_ISLAND_PLAYER,
    name: RIVER_ISLAND_SETTLEMENT,
    q: RIVER_ISLAND_LONGHOUSE.q,
    r: RIVER_ISLAND_LONGHOUSE.r,
    // Below the snapshot's level, so the snapshot counts as a level-up and claims the territory.
    level: 1,
    resources: zero,
    rates: zero,
    foundedAt: 0,
  });
  world.applyServerSnapshot(RIVER_ISLAND_SETTLEMENT, {
    level: RIVER_ISLAND_LONGHOUSE_LEVEL,
    resources: zero,
    rates: zero,
    capacity: zero,
    buildings,
  });
  return world;
}

/** What a hovered hex of the example is, for its caption: a docs.* i18n key or an already-worded name. */
export function riverIslandTileName(tile: Tile, river: RiverTile | undefined): { key: string } | { text: string } | null {
  if (tile.buildingType) return { text: buildingName(tile.buildingType) };
  if (tile.camp) return { key: `docs.wildlifeCamps.list.${tile.camp.family}.name` };
  if (river) {
    if (river.shape === 'spring') return { key: 'docs.rivers.example.pieces.spring' };
    if (river.shape === 'confluence') return { key: 'docs.rivers.example.pieces.confluence' };
    if (river.shape === 'mouth') return { key: 'docs.rivers.example.pieces.mouth' };
    if (river.width === 'widen') return { key: 'docs.rivers.example.pieces.widening' };
    return { key: river.width === 'stream' ? 'docs.rivers.example.pieces.stream' : 'docs.rivers.example.pieces.river' };
  }
  if (tile.bog) {
    if (tile.bog.kind === 'bog') return { key: 'docs.bogLands.ground.heading' };
    const shape = tile.bog.kind === 'creekspring' ? 'spring' : tile.bog.kind;
    return { key: `docs.bogLands.water.shapes.${shape}.name` };
  }
  if (tile.giant) return { text: giantName(tile.giant.family) };
  if (tile.terrain === 'sea') return { key: tile.isCoastalWater ? 'docs.tiles.entries.coastalWater.title' : 'docs.tiles.entries.sea.title' };
  return { key: `docs.tiles.entries.${tile.terrain}.title` };
}
