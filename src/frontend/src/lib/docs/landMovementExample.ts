// The land movement docs page's example map (LandMovementExample.vue): a small hand-placed island with every kind of
// ground an army meets, drawn by the game's own renderer through a `StaticWorldModel`, and a dummy army's route over it.
//
// The island keeps to the world's rules so it reads like a piece of a real world:
// - the land along the coast is sand, as the generator makes it;
// - the water runs like a generated network (`riverTilesFromPaths`, the generator's own shape and width pass): every
//   watercourse starts as a stream at a spring under the mountains, two streams meet and widen into the wide river, a third
//   stream joins it at the river-stream Y, and the river reaches the sea at a river-width mouth facing open water;
// - the realm is the game's own claim: the settlement is registered on the model and fed a snapshot (longhouse, two towers,
//   the bridge and the wall), and the model claims the land itself (`WorldModel.applyServerSnapshot`), so the gold border
//   runs round the whole realm and every building stands inside it;
// - the bridge stands on a straight wide-river hex, the wall runs from the north coast to the south coast with a sea end at
//   each, and its gate sits on a straight piece.
//
// The route is not drawn by hand: it is worked out by the real pathfinder (`findPath`, hexPath.ts) over the island's ground,
// streams, wall and bridge, with the same restrictions a world builds (`palisadeRestrictions`, `bridgeRestrictions`).
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { bridgeRestrictions } from '../map/bridgeMovement';
import { findPath, pathCost, timeOnHex, type PathContext } from '../map/hexPath';
import { palisadeRestrictions, type PalisadeWalls } from '../map/palisadeMovement';
import { isWideRiverTile, riverTilesFromPaths } from '../map/riverGenerator';
import { StaticWorldModel } from '../map/StaticWorldModel';
import type { BogTile, RiverTile, Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, type WorldSeed } from '../map/worldGenerator';
import { GROUND_COSTS } from './landMovementDocs';

/** The example's seed, for each hex's art rotation and variant (the same hash a world uses) and the river width pass. */
const EXAMPLE_WORLD: WorldSeed = { seed: 11, generation: DEFAULT_GENERATION };

/** The settlement and the account that owns it: the viewer's own realm gets the gold border, and its own wall and bridge open for its army. */
export const LAND_EXAMPLE_SETTLEMENT = 'docs-land';
export const LAND_EXAMPLE_PLAYER = 'docs';

/** The settlement the army marches out of, and the hex beyond the wall it marches to. */
export const LAND_EXAMPLE_START: AxialCoord = { q: -3, r: 1 };
export const LAND_EXAMPLE_END: AxialCoord = { q: 7, r: -1 };

/** Longhouse 7 (claim 3) unlocks the palisade; level-5 towers (claim 5 each) carry the realm east to the wall. */
const LONGHOUSE_LEVEL = 7;
const TOWERS: { coord: AxialCoord; level: number }[] = [
  { coord: { q: 0, r: 0 }, level: 5 },
  { coord: { q: 4, r: -1 }, level: 5 },
];

/** The bridge, on a straight hex of the wide river, and the level it stands at. */
export const LAND_EXAMPLE_BRIDGE: AxialCoord = { q: 3, r: 0 };
const BRIDGE_LEVEL = 3;

/** The wall: from a sea end off the north coast down to a sea end off the south coast, with the gate halfway. */
const WALL_Q = 6;
const WALL_FROM_R = -5;
const WALL_TO_R = 2;
export const LAND_EXAMPLE_GATE: AxialCoord = { q: WALL_Q, r: -1 };
const WALL_LEVEL = 3;

/**
 * Ground rows by r; each row lists its hexes from q = `from` on, one character each. G grass, F forest, B bog moss, M mountain.
 * A G on the coast becomes sand. Hexes not listed are sea.
 */
const GROUND_ROWS: { r: number; from: number; cells: string }[] = [
  { r: -4, from: 0, cells: 'MMMMMMG' },
  { r: -3, from: -2, cells: 'GMMMMGMGGG' },
  { r: -2, from: -3, cells: 'GGGMFGGGGGGG' },
  { r: -1, from: -4, cells: 'GGGGGMGGGFGGG' },
  { r: 0, from: -5, cells: 'GGBBGGMGGGFGGG' },
  { r: 1, from: -5, cells: 'GGGBGGMFGGGGG' },
  { r: 2, from: -5, cells: 'GFFGGGGFGG' },
  { r: 3, from: -5, cells: 'GGGGGGGG' },
  { r: 4, from: -5, cells: 'GGGG' },
];

const TERRAIN_OF: Record<string, Terrain> = { G: 'grass', F: 'forest', B: 'bog', M: 'mountain' };

const hexes = (...list: [number, number][]): AxialCoord[] => list.map(([q, r]) => ({ q, r }));

/**
 * The watercourses, each from its spring (a hex under the mountains) to its mouth or to the hex where it joins another one.
 * The two northern streams meet at a narrow Y and widen into the river there; the western stream joins the river at the
 * wide Y (a river-stream junction); the river runs out into the sea straight ahead of its mouth.
 */
const RIVER_PATHS: AxialCoord[][] = [
  hexes([3, -3], [3, -2], [3, -1], [3, 0], [3, 1], [3, 2], [4, 2]),
  hexes([5, -3], [4, -2], [3, -1]),
  hexes([-1, -2], [-1, -1], [-1, 0], [-1, 1], [-1, 2], [-1, 3], [0, 3], [1, 3], [2, 3], [3, 2]),
];

export const LAND_EXAMPLE_RIVERS: RiverTile[] = riverTilesFromPaths(RIVER_PATHS, EXAMPLE_WORLD.seed);

function groundTerrain(): Map<string, Terrain> {
  const ground = new Map<string, Terrain>();
  for (const row of GROUND_ROWS) {
    [...row.cells].forEach((ch, i) => ground.set(coordKey({ q: row.from + i, r: row.r }), TERRAIN_OF[ch]!));
  }
  return ground;
}

const PLAIN_BOG = (c: AxialCoord): BogTile => ({ q: c.q, r: c.r, kind: 'bog', inDirections: [], outDirection: null, waterEdges: [] });

/** What a hex of the example is, for its hover name (a docs.landMovement.example.names.* key, or a terrain). */
export type LandExampleKind =
  | 'settlement'
  | 'tower'
  | 'bridge'
  | 'wideRiver'
  | 'stream'
  | 'wall'
  | 'gate'
  | 'sea'
  | 'coast'
  | Terrain;

/** The island's ground without any building or owner: grass, forest, bog moss, mountain and sand along the coast, two rings of sea round it. */
export function buildLandExampleGround(): Tile[] {
  const tiles = new Map<string, Tile>();
  const place = (c: AxialCoord, terrain: Terrain, extra: Partial<Tile> = {}): void => {
    tiles.set(coordKey(c), {
      q: c.q,
      r: c.r,
      terrain,
      orientation: defaultOrientation(c.q, c.r, EXAMPLE_WORLD),
      variant: variantForTerrain(c.q, c.r, EXAMPLE_WORLD, terrain),
      ...extra,
    });
  };
  const ground = groundTerrain();
  for (const [key, terrain] of ground) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const c = { q, r };
    const coastal = neighbors(c).some((n) => !ground.has(coordKey(n)));
    if (terrain === 'bog') place(c, 'bog', { bog: PLAIN_BOG(c) });
    else place(c, terrain === 'grass' && coastal ? 'sand' : terrain);
  }
  const ring = (from: Tile[], extra: Partial<Tile>): Tile[] => {
    const added: Tile[] = [];
    for (const t of from) {
      for (const n of neighbors(t)) {
        if (tiles.has(coordKey(n))) continue;
        place(n, 'sea', extra);
        added.push(tiles.get(coordKey(n))!);
      }
    }
    return added;
  };
  const coast = ring([...tiles.values()], { isCoastalWater: true });
  ring(coast, {});
  return [...tiles.values()];
}

/** The buildings of the realm, as the snapshot a world's server sends. */
function realmBuildings(): { q: number; r: number; type: string; level: number }[] {
  const wall = [];
  for (let r = WALL_FROM_R; r <= WALL_TO_R; r++) {
    wall.push({ q: WALL_Q, r, type: r === LAND_EXAMPLE_GATE.r ? 'palisadegate' : 'palisade', level: WALL_LEVEL });
  }
  return [
    { ...LAND_EXAMPLE_START, type: 'longhouse', level: LONGHOUSE_LEVEL },
    ...TOWERS.map((t) => ({ ...t.coord, type: 'tower', level: t.level })),
    { ...LAND_EXAMPLE_BRIDGE, type: 'bridge', level: BRIDGE_LEVEL },
    ...wall,
  ];
}

/**
 * Shows the example on `world`: the ground and the rivers, then the settlement with its buildings, claimed by the model itself.
 * The caller redraws the renderer afterwards if it already drew (`forceRebuild`).
 */
export function applyLandExample(world: StaticWorldModel): void {
  world.setTiles(buildLandExampleGround());
  world.setRivers(LAND_EXAMPLE_RIVERS);
  const zero = { wood: 0, stone: 0, food: 0, iron: 0 };
  world.registerSettlement({
    id: LAND_EXAMPLE_SETTLEMENT,
    ownerId: LAND_EXAMPLE_PLAYER,
    ownerName: LAND_EXAMPLE_PLAYER,
    name: LAND_EXAMPLE_SETTLEMENT,
    q: LAND_EXAMPLE_START.q,
    r: LAND_EXAMPLE_START.r,
    // Below the snapshot's level, so the snapshot counts as a level-up and claims the territory.
    level: 1,
    resources: zero,
    rates: zero,
    foundedAt: 0,
  });
  world.applyServerSnapshot(LAND_EXAMPLE_SETTLEMENT, {
    level: LONGHOUSE_LEVEL,
    resources: zero,
    rates: zero,
    capacity: zero,
    buildings: realmBuildings(),
  });
}

/** A model showing the example. */
export function landExampleWorld(): StaticWorldModel {
  const world = new StaticWorldModel();
  applyLandExample(world);
  return world;
}

/** Every tile of the example as the model holds it once the realm is claimed: buildings and owners included. */
export function buildLandExampleTiles(world: StaticWorldModel = landExampleWorld()): Tile[] {
  return buildLandExampleGround().map((t) => world.getTile(t.q, t.r));
}

/** The path context over the example: the game's cost rules, the river, and the wall and bridge restrictions of the army's owner. */
export function landExampleContext(tiles: readonly Tile[] = buildLandExampleTiles()): PathContext {
  const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
  const riverAt = new Map(LAND_EXAMPLE_RIVERS.map((r) => [coordKey(r), r]));
  const terrainAt = (c: AxialCoord): Terrain => byKey.get(coordKey(c))?.terrain ?? 'sea';
  const isWideRiver = (c: AxialCoord): boolean => {
    const river = riverAt.get(coordKey(c));
    return !!river && isWideRiverTile(river, (n) => riverAt.get(coordKey(n)));
  };
  const rules = {
    land: { ...Object.fromEntries(GROUND_COSTS.map((g) => [g.terrain, g.cost])), mountain: 2 },
    riverCrossingCost: 8,
  };
  const walls: PalisadeWalls = new Map(
    tiles
      .filter((t) => t.buildingType === 'palisade' || t.buildingType === 'palisadegate')
      .map((t) => [coordKey(t), { gate: t.buildingType === 'palisadegate', owner: t.ownerId ?? '' }]),
  );
  const bridges = new Map(
    tiles
      .filter((t) => t.buildingType === 'bridge')
      .map((t) => [coordKey(t), { level: t.buildingLevel ?? 1, owner: t.ownerId ?? '' }]),
  );
  return {
    terrainAt,
    isRiver: (c) => riverAt.has(coordKey(c)),
    isWideRiver,
    rules,
    hexesPerHour: 1,
    restrictions: {
      ...palisadeRestrictions(walls, terrainAt, isWideRiver, LAND_EXAMPLE_SETTLEMENT),
      ...bridgeRestrictions(bridges, LAND_EXAMPLE_SETTLEMENT),
    },
  };
}

export interface LandExampleHex {
  coord: AxialCoord;
  /** What the hex is, for its name in the legend. */
  kind: LandExampleKind;
  /** The time spent on it (grass = 1): the first and the last hex of the route half their price, every hex in between its full price. */
  cost: number;
}

export interface LandExampleRoute {
  path: AxialCoord[];
  /** Every hex of the route, the start included. */
  hexes: LandExampleHex[];
  /** Total cost of the route in hex-cost units: minutes for a unit = 60 * total / speed. */
  total: number;
}

/** What a hex of the example is: the building or river on it first, else its ground. */
export function landExampleKindOf(tile: Tile, river: RiverTile | undefined, wide = false): LandExampleKind {
  if (tile.buildingType === 'bridge') return 'bridge';
  if (tile.buildingType === 'palisadegate') return 'gate';
  if (tile.buildingType === 'palisade') return 'wall';
  if (tile.buildingType === 'longhouse') return 'settlement';
  if (tile.buildingType === 'tower') return 'tower';
  if (river) return wide ? 'wideRiver' : 'stream';
  if (tile.terrain === 'sea') return tile.isCoastalWater ? 'coast' : 'sea';
  return tile.terrain;
}

/** The route of the dummy army from its settlement to the far side of the wall, worked out by the real pathfinder. */
export function landExampleRoute(tiles: readonly Tile[] = buildLandExampleTiles()): LandExampleRoute {
  const ctx = landExampleContext(tiles);
  const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
  const riverAt = new Map(LAND_EXAMPLE_RIVERS.map((r) => [coordKey(r), r]));
  const path = findPath(LAND_EXAMPLE_START, LAND_EXAMPLE_END, ctx);
  if (!path) throw new Error('the land movement example has no route');
  const hexes = path.map((coord, i) => ({
    coord,
    kind: landExampleKindOf(byKey.get(coordKey(coord))!, riverAt.get(coordKey(coord)), ctx.isWideRiver(coord)),
    cost: timeOnHex(path, i, ctx),
  }));
  return { path, hexes, total: pathCost(path, ctx) };
}
