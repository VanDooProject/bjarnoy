// The land movement docs page's example map (LandMovementExample.vue): a small hand-placed island with every kind of
// ground an army meets, drawn by the game's own renderer through a `StaticWorldModel`, and a dummy army's route over it.
// The route is not drawn by hand: it is worked out by the real pathfinder (`findPath`, hexPath.ts) over the island's
// ground, streams, wall and bridge, with the same restrictions a world builds (`palisadeRestrictions`,
// `bridgeRestrictions`), so it follows the movement rules by itself.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { bridgeRestrictions } from '../map/bridgeMovement';
import { findPath, pathCost, type PathContext } from '../map/hexPath';
import { palisadeRestrictions, type PalisadeWalls } from '../map/palisadeMovement';
import { isWideRiverTile } from '../map/riverGenerator';
import type { RiverTile, Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, type WorldSeed } from '../map/worldGenerator';
import { GROUND_COSTS } from './landMovementDocs';

/** The example's seed, only for each hex's art rotation and variant (the same hash a world uses). */
const EXAMPLE_WORLD: WorldSeed = { seed: 11, generation: DEFAULT_GENERATION };

/** The settlement the army marches out of, and the hex it marches to. */
export const LAND_EXAMPLE_START: AxialCoord = { q: -2, r: 1 };
export const LAND_EXAMPLE_END: AxialCoord = { q: 6, r: -1 };

/** The owner key shared by the wall, the gate, the bridge and the army: the army's own gate and bridge open for it. */
const OWNER = 'docs';
/** The level the bridge and the wall stand at. */
const BRIDGE_LEVEL = 3;
const WALL_LEVEL = 3;

/** Ground rows by r; each row lists its hexes from q = `from` on, one character each. G grass, F forest, B bog, M mountain. */
const GROUND_ROWS: { r: number; from: number; cells: string }[] = [
  { r: -2, from: 1, cells: 'MMMGGG' },
  { r: -1, from: 0, cells: 'GMMGGGG' },
  { r: 0, from: -1, cells: 'BBGMGGGG' },
  { r: 1, from: -2, cells: 'GBBGFGGG' },
  { r: 2, from: -2, cells: 'GGGGGGG' },
];

const TERRAIN_OF: Record<string, Terrain> = { G: 'grass', F: 'forest', B: 'bog', M: 'mountain' };

/** The wide river: it runs from a spring on the ridge down the island to the sea. */
const RIVER_Q = 3;
/** The bridge crosses it here. */
export const LAND_EXAMPLE_BRIDGE: AxialCoord = { q: RIVER_Q, r: 1 };
/** The stream, which a land army wades through. */
const STREAM_Q = 1;
/** The wall, running down the east side with a gate. */
const WALL_Q = 5;
export const LAND_EXAMPLE_GATE: AxialCoord = { q: WALL_Q, r: 0 };

function riverColumn(q: number, from: number, to: number, width: 'river' | 'stream'): RiverTile[] {
  const out: RiverTile[] = [];
  for (let r = from; r <= to; r++) {
    if (r === from) out.push({ q, r, shape: 'spring', inDirections: [], outDirection: 'SE', width });
    else if (r === to) out.push({ q, r, shape: 'mouth', inDirections: ['NW'], outDirection: null, width });
    else out.push({ q, r, shape: 'straight', inDirections: ['NW'], outDirection: 'SE', width });
  }
  return out;
}

export const LAND_EXAMPLE_RIVERS: RiverTile[] = [
  ...riverColumn(RIVER_Q, -2, 2, 'river'),
  ...riverColumn(STREAM_Q, -1, 2, 'stream'),
];

function groundTerrain(): Map<string, Terrain> {
  const ground = new Map<string, Terrain>();
  for (const row of GROUND_ROWS) {
    [...row.cells].forEach((ch, i) => ground.set(coordKey({ q: row.from + i, r: row.r }), TERRAIN_OF[ch]!));
  }
  return ground;
}

const wallHexes: { coord: AxialCoord; gate: boolean }[] = [-2, -1, 0, 1].map((r) => ({
  coord: { q: WALL_Q, r },
  gate: r === LAND_EXAMPLE_GATE.r,
}));

/** What a hex of the example is, for its hover name (a docs.landMovement.example.names.* key, or a terrain). */
export type LandExampleKind =
  | 'settlement'
  | 'bridge'
  | 'wideRiver'
  | 'stream'
  | 'wall'
  | 'gate'
  | 'sea'
  | 'coast'
  | Terrain;

/** The example as the map tiles the renderer draws, sea rings included. */
export function buildLandExampleTiles(): Tile[] {
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
  for (const [key, terrain] of groundTerrain()) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    place({ q, r }, terrain);
  }
  place(LAND_EXAMPLE_START, 'grass', { buildingType: 'longhouse', buildingLevel: 1, ownerId: OWNER });
  place(LAND_EXAMPLE_BRIDGE, 'grass', { buildingType: 'bridge', buildingLevel: BRIDGE_LEVEL, ownerId: OWNER });
  for (const w of wallHexes) {
    place(w.coord, 'grass', {
      buildingType: w.gate ? 'palisadegate' : 'palisade',
      buildingLevel: WALL_LEVEL,
      ownerId: OWNER,
    });
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
      .map((t) => [coordKey(t), { gate: t.buildingType === 'palisadegate', owner: OWNER }]),
  );
  const bridges = new Map(
    tiles.filter((t) => t.buildingType === 'bridge').map((t) => [coordKey(t), { level: t.buildingLevel ?? 1, owner: OWNER }]),
  );
  return {
    terrainAt,
    isRiver: (c) => riverAt.has(coordKey(c)),
    isWideRiver,
    rules,
    hexesPerHour: 1,
    restrictions: {
      ...palisadeRestrictions(walls, terrainAt, isWideRiver, OWNER),
      ...bridgeRestrictions(bridges, terrainAt, rules, OWNER),
    },
  };
}

export interface LandExampleStep {
  coord: AxialCoord;
  /** What the hex is, for its name in the legend. */
  kind: LandExampleKind;
  /** What entering it costs (grass = 1). */
  cost: number;
}

export interface LandExampleRoute {
  path: AxialCoord[];
  steps: LandExampleStep[];
  /** Total cost of the route in hex-cost units: minutes for a unit = 60 * total / speed. */
  total: number;
}

/** What a hex of the example is: the building or river on it first, else its ground. */
export function landExampleKindOf(tile: Tile, river: RiverTile | undefined, wide = false): LandExampleKind {
  if (tile.buildingType === 'bridge') return 'bridge';
  if (tile.buildingType === 'palisadegate') return 'gate';
  if (tile.buildingType === 'palisade') return 'wall';
  if (tile.buildingType === 'longhouse') return 'settlement';
  if (river) return wide ? 'wideRiver' : 'stream';
  if (tile.terrain === 'sea') return tile.isCoastalWater ? 'coast' : 'sea';
  return tile.terrain;
}

/** The route of the dummy army from its settlement to the far side of the wall, worked out by the real pathfinder. */
export function landExampleRoute(): LandExampleRoute {
  const tiles = buildLandExampleTiles();
  const ctx = landExampleContext(tiles);
  const byKey = new Map(tiles.map((t) => [coordKey(t), t]));
  const riverAt = new Map(LAND_EXAMPLE_RIVERS.map((r) => [coordKey(r), r]));
  const path = findPath(LAND_EXAMPLE_START, LAND_EXAMPLE_END, ctx);
  if (!path) throw new Error('the land movement example has no route');
  const steps = path.slice(1).map((coord, i) => ({
    coord,
    kind: landExampleKindOf(byKey.get(coordKey(coord))!, riverAt.get(coordKey(coord)), ctx.isWideRiver(coord)),
    cost: pathCost([path[i]!, coord], ctx),
  }));
  return { path, steps, total: pathCost(path, ctx) };
}
