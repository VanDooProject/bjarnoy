// Which palisade piece (and which of its six camera files) a wall hex renders with, and the
// placement rules that keep every wall hex drawable. Pure and dependency-light so the real
// renderer can reuse it later; today only the worldgen pathing preview does.
//
// The art contract is 3D_assets' docs/wall-tiles.md: six pieces, every one drawn once in a
// canonical orientation and rendered through the same six cameras the river tiles use
// (`_N` ... `_NW` in the atlas, `TILE_ORIENTATIONS` here):
//
//   palisade_straight180   land           W - E
//   palisade_bend60        land           W - SW   (adjacent edges, the tight turn)
//   palisade_bend120       land           W - SE   (one edge skipped, the wide turn)
//   palisade_gate180       land           W - E    (a straight with a gate in the middle)
//   palisade_end           land           W only
//   palisade_end_coast     coastal water  W only   (W is the land side)
//
// Rotation convention (mirrors `riverArtFor`, pixel-verified there for the river families that
// share these crossings): file index D touches polygon edges D+1 (canonical W), D (SW), D-1 (SE)
// and D+4 (E); a direction index d borders polygon edge (3 - d) mod 6. So the canonical edges
// sit at directions dW, dW+1 (SW), dW+2 (SE) and dW+3 (E) with dW = (2 - D) mod 6, i.e. the file
// for a piece whose W edge faces direction dW is D = (2 - dW) mod 6 - the same formula as
// `straightOrientationOf`, `bendOrientationOf` and `bend60OrientationOf`.
//
// Rules the owner decided (see scripts/worldgen-preview/README.md, "pathing"):
//   - walls do not branch: no hex has three or more wall neighbours;
//   - a gate exists only on a straight;
//   - no wall on a river hex (any width) or on a mountain, lake or bog (plain bog moss excepted);
//   - at the coast a wall ends in `palisade_end_coast` on a coastal water hex.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { TILE_ORIENTATIONS, type Terrain, type TileOrientation } from './types';

export type PalisadePiece = 'straight180' | 'bend60' | 'bend120' | 'gate180' | 'end' | 'end_coast';

/** The atlas family name (the `<family>_<DIR>_levelNNN` frame prefix) of each piece. */
export const PALISADE_FAMILY: Record<PalisadePiece, string> = {
  straight180: 'palisade_straight180',
  bend60: 'palisade_bend60',
  bend120: 'palisade_bend120',
  gate180: 'palisade_gate180',
  end: 'palisade_end',
  end_coast: 'palisade_end_coast',
};

/** Why a wall hex or a placement is refused. `isolated` (no wall neighbour) is "not drawable yet", not an error. */
export type PalisadeRefusal = 'branch' | 'gateNotStraight' | 'notAllowedOnTerrain' | 'isolated' | 'occupied';

export interface PalisadeTile {
  piece: PalisadePiece;
  /** The art file's camera (`_<dir>_levelNNN`). */
  dir: TileOrientation;
  /** Direction indices (`neighbors()` order) of the neighbours this piece's wall runs into. */
  edges: number[];
}

export type PalisadeResult = PalisadeTile | { refusal: PalisadeRefusal };

export function isRefusal(result: PalisadeResult): result is { refusal: PalisadeRefusal } {
  return 'refusal' in result;
}

/** Canonical edges as steps from W: W 0, SW 1, SE 2, E 3 (see the header). */
const CANONICAL_STEPS: Record<PalisadePiece, number[]> = {
  straight180: [0, 3],
  bend60: [0, 1],
  bend120: [0, 2],
  gate180: [0, 3],
  end: [0],
  end_coast: [0],
};

/** The camera file for a piece whose canonical W edge faces direction index `dW`. */
export function dirForWestEdge(dW: number): TileOrientation {
  return TILE_ORIENTATIONS[(((2 - dW) % 6) + 6) % 6]!;
}

/** Inverse of `dirForWestEdge`: which direction index a file's canonical W edge faces. */
export function westEdgeOfDir(dir: TileOrientation): number {
  return (((2 - TILE_ORIENTATIONS.indexOf(dir)) % 6) + 6) % 6;
}

/** The direction indices a piece drawn from the `dir` file runs into. */
export function pieceEdges(piece: PalisadePiece, dir: TileOrientation): number[] {
  const dW = westEdgeOfDir(dir);
  return CANONICAL_STEPS[piece].map((s) => (dW + s) % 6);
}

/**
 * The piece for a wall hex, from which of its six neighbours (direction order of `neighbors()`)
 * are wall hexes. `coastalWater` is a sea hex carrying the sea end; `gate` a gate hex.
 */
export function palisadeTileFor(input: {
  wallNeighbours: readonly boolean[];
  coastalWater?: boolean;
  gate?: boolean;
}): PalisadeResult {
  const dirs: number[] = [];
  input.wallNeighbours.forEach((isWall, d) => {
    if (isWall) dirs.push(d);
  });
  const n = dirs.length;

  if (input.coastalWater) {
    // A sea hex only ever carries the sea end, joined to exactly one land wall hex.
    if (input.gate) return { refusal: 'notAllowedOnTerrain' };
    if (n === 0) return { refusal: 'isolated' };
    if (n > 1) return { refusal: 'branch' };
    return { piece: 'end_coast', dir: dirForWestEdge(dirs[0]!), edges: [dirs[0]!] };
  }

  if (n >= 3) return { refusal: 'branch' };
  if (n === 0) return { refusal: input.gate ? 'gateNotStraight' : 'isolated' };
  if (n === 1) {
    if (input.gate) return { refusal: 'gateNotStraight' };
    return { piece: 'end', dir: dirForWestEdge(dirs[0]!), edges: [dirs[0]!] };
  }

  const [i, j] = dirs as [number, number];
  const diff = (j - i + 6) % 6;
  if (diff === 3) {
    return { piece: input.gate ? 'gate180' : 'straight180', dir: dirForWestEdge(i), edges: [i, j] };
  }
  if (input.gate) return { refusal: 'gateNotStraight' };
  // W-SW: W is the lower end of the adjacent pair; W-SE: W is the lower end of the pair two apart.
  if (diff === 1) return { piece: 'bend60', dir: dirForWestEdge(i), edges: [i, j] };
  if (diff === 5) return { piece: 'bend60', dir: dirForWestEdge(j), edges: [j, i] };
  if (diff === 2) return { piece: 'bend120', dir: dirForWestEdge(i), edges: [i, j] };
  return { piece: 'bend120', dir: dirForWestEdge(j), edges: [j, i] };
}

/** What the placement rules need to know about the map. */
export interface PlacementContext {
  terrainAt(c: AxialCoord): Terrain;
  /** Any river hex, stream or river: no wall tile is built on a river base. */
  isRiver(c: AxialCoord): boolean;
  /** Optional: a wide river (also refused, and also a river). */
  isWideRiver?(c: AxialCoord): boolean;
  /** Optional: a bog hex that is plain moss (not a shore, mouth, creek or lake): the one bog a wall may stand on. */
  isPlainBog?(c: AxialCoord): boolean;
}

/** The wall as placed: hex keys of every wall hex (a sea end included) and which of them are gates. */
export interface WallSet {
  walls: ReadonlySet<string>;
  gates?: ReadonlySet<string>;
}

const WALKABLE_WALL_TERRAIN: ReadonlySet<Terrain> = new Set<Terrain>(['grass', 'sand', 'forest']);

function wallNeighbourFlags(c: AxialCoord, walls: ReadonlySet<string>): boolean[] {
  return neighbors(c).map((n) => walls.has(coordKey(n)));
}

/** The piece (or refusal) of one wall hex in a wall. */
export function tileOfWallHex(c: AxialCoord, wall: WallSet, terrainAt: (c: AxialCoord) => Terrain): PalisadeResult {
  return palisadeTileFor({
    wallNeighbours: wallNeighbourFlags(c, wall.walls),
    coastalWater: terrainAt(c) === 'sea',
    gate: wall.gates?.has(coordKey(c)) ?? false,
  });
}

/** Every wall hex's piece, keyed by hex key. */
export function resolveWall(
  wall: WallSet,
  terrainAt: (c: AxialCoord) => Terrain,
  parse: (key: string) => AxialCoord,
): Map<string, PalisadeResult> {
  const out = new Map<string, PalisadeResult>();
  for (const key of wall.walls) out.set(key, tileOfWallHex(parse(key), wall, terrainAt));
  return out;
}

/**
 * Whether a wall (or gate) hex may be added at `coord` to `existing`. Adding a hex changes the
 * pieces of its wall neighbours - an end becomes a straight, a straight that gains a third
 * neighbour would branch, a gate that turns would no longer be a straight - so the new hex and
 * every neighbour are re-resolved against the grown wall and any refusal there refuses the
 * placement. A gate is placed on a hex that already has two opposite wall neighbours (or on an
 * existing straight, which it replaces).
 */
export function canPlacePalisade(
  coord: AxialCoord,
  existing: WallSet,
  ctx: PlacementContext,
  options: { gate?: boolean } = {},
): { ok: true } | { ok: false; reason: PalisadeRefusal } {
  const key = coordKey(coord);
  const gate = options.gate ?? false;
  const refuse = (reason: PalisadeRefusal) => ({ ok: false as const, reason });

  const terrain = ctx.terrainAt(coord);
  if (ctx.isRiver(coord) || ctx.isWideRiver?.(coord)) return refuse('notAllowedOnTerrain');
  const water = terrain === 'sea';
  const plainBog = terrain === 'bog' && (ctx.isPlainBog?.(coord) ?? false);
  if (!water && !plainBog && !WALKABLE_WALL_TERRAIN.has(terrain)) return refuse('notAllowedOnTerrain');
  if (water && gate) return refuse('notAllowedOnTerrain');

  const isUpgrade = gate && existing.walls.has(key) && !(existing.gates?.has(key) ?? false);
  if (existing.walls.has(key) && !isUpgrade) return refuse('occupied');

  const walls = new Set(existing.walls).add(key);
  const gates = new Set(existing.gates ?? []);
  if (gate) gates.add(key);
  const grown: WallSet = { walls, gates };

  // The sea end hangs off exactly one land wall hex.
  if (water) {
    const wallNeighbours = neighbors(coord).filter((n) => existing.walls.has(coordKey(n)));
    if (wallNeighbours.length > 1) return refuse('branch');
    if (wallNeighbours.length === 0 || ctx.terrainAt(wallNeighbours[0]!) === 'sea') return refuse('notAllowedOnTerrain');
  }

  const own = tileOfWallHex(coord, grown, ctx.terrainAt);
  if (isRefusal(own) && own.refusal !== 'isolated') return refuse(own.refusal);

  for (const n of neighbors(coord)) {
    if (!existing.walls.has(coordKey(n))) continue;
    // A sea end cannot take a second wall hex, and a land hex cannot be a sea end's neighbour twice over.
    const result = tileOfWallHex(n, grown, ctx.terrainAt);
    if (!isRefusal(result)) continue;
    // A gate still waiting for its second neighbour is unfinished, not wrong.
    if (result.refusal === 'gateNotStraight' && wallNeighbourFlags(n, walls).filter(Boolean).length < 2) continue;
    if (result.refusal === 'isolated') continue;
    return refuse(result.refusal);
  }
  return { ok: true };
}

/**
 * Whether a land end (`palisade_end`) at `c` is half open (any army may pass it, at a penalty) or
 * sealed. An end that touches a mountain or a wide river is sealed: the wall runs up to a natural
 * barrier and the barrier closes it. Anything else, the sea included, leaves it half open.
 */
export function classifyEnd(
  c: AxialCoord,
  terrainAt: (c: AxialCoord) => Terrain,
  isWideRiver: (c: AxialCoord) => boolean,
): 'halfOpen' | 'sealed' {
  for (const n of neighbors(c)) if (terrainAt(n) === 'mountain' || isWideRiver(n)) return 'sealed';
  return 'halfOpen';
}
