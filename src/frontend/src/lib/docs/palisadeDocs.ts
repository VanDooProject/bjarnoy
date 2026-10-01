// What the Walls docs page (WallsView.vue) draws, kept out of the component so it can be tested: the six
// palisade pieces and the atlas names of their art, how many stages the atlas has for each (read off the
// atlas, so the stage the art pipeline adds next shows up by itself), the ground a piece stands on, and
// the small example wall - resolved with the game's own `palisadeTiles.ts`, not with a hand-written table.
import { coordKey, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import {
  PALISADE_FAMILY,
  resolveWall,
  type PalisadePiece,
  type PalisadeResult,
  type WallSet,
} from '../map/palisadeTiles';
import type { Terrain, TileOrientation } from '../map/types';

/** The six pieces in the order the page lists them: the straight first, the sea end last. */
export const PALISADE_PIECES: readonly PalisadePiece[] = [
  'straight180',
  'bend60',
  'bend120',
  'gate180',
  'end',
  'end_coast',
];

/** The grounds a land wall can stand on, with the `terrain` atlas family their `<family>_<DIR>_base` frames use. */
export const WALL_GROUNDS = [
  { id: 'grass', family: 'grasstile' },
  { id: 'forest', family: 'foresttile' },
  { id: 'sand', family: 'sandtile' },
  { id: 'bog', family: 'bog' },
] as const;
export type WallGround = (typeof WALL_GROUNDS)[number]['id'];

const SEA_END_BASE_FAMILY = 'coastalwatertile';

/** `level000` for 0: the atlas's own three-digit stage suffix. */
export function levelSuffix(stage: number): string {
  return `level${String(stage).padStart(3, '0')}`;
}

/**
 * Every stage (`levelNNN`, counted from the construction site at 0) the atlas has for a piece, in order. It
 * stops at the first gap, so a family that is missing a stage in the middle is not shown with a hole in it.
 * `has` answers "is this frame in the atlas" so the count can be tested without the real atlas.
 */
export function stagesOf(piece: PalisadePiece, has: (frameName: string) => boolean, limit = 12): number[] {
  const stages: number[] = [];
  for (let stage = 0; stage < limit && has(`${PALISADE_FAMILY[piece]}_SE_${levelSuffix(stage)}`); stage++) {
    stages.push(stage);
  }
  return stages;
}

/** Frame names of one drawn piece: the ground (`terrain` category) and the wall on it (`buildings-static`). */
export function pieceFrameNames(
  piece: PalisadePiece,
  dir: TileOrientation,
  stage: number,
  ground: WallGround,
): { base: string; top: string; ownBase: string } {
  const top = `${PALISADE_FAMILY[piece]}_${dir}_${levelSuffix(stage)}`;
  const family = piece === 'end_coast' ? SEA_END_BASE_FAMILY : WALL_GROUNDS.find((g) => g.id === ground)!.family;
  // The sea end carries its own base (the water it stands in); `ownBase` is the leveled one the atlas may ship.
  return { top, base: `${family}_${dir}_base`, ownBase: `${top}_base` };
}

// --- The example wall -------------------------------------------------------

/** The example's hexes in order along the wall, with the gate among them. */
export interface ExampleWallHex {
  coord: AxialCoord;
  gate: boolean;
}

/**
 * A wall that runs four hexes in one direction, turns 60 degrees (a 120-degree bend, the wide turn) and runs
 * two more: end, straight, gate, straight, bend, straight, end. Only the hexes are placed; which piece each
 * one is, and which way it is turned, is decided by `resolveExampleWall`.
 */
export function exampleWallHexes(): ExampleWallHex[] {
  const [first, second] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
  ] as const;
  const hexes: ExampleWallHex[] = [];
  let at: AxialCoord = { q: -2, r: 1 };
  hexes.push({ coord: at, gate: false });
  for (let i = 0; i < 4; i++) {
    at = { q: at.q + first.q, r: at.r + first.r };
    hexes.push({ coord: at, gate: false });
  }
  for (let i = 0; i < 2; i++) {
    at = { q: at.q + second.q, r: at.r + second.r };
    hexes.push({ coord: at, gate: false });
  }
  hexes[2]!.gate = true;
  return hexes;
}

export interface ResolvedExampleHex {
  coord: AxialCoord;
  result: PalisadeResult;
}

/** The example wall's pieces, in wall order, resolved by the game's own piece rules (all on grass). */
export function resolveExampleWall(hexes: readonly ExampleWallHex[] = exampleWallHexes()): ResolvedExampleHex[] {
  const wall: WallSet = {
    walls: new Set(hexes.map((h) => coordKey(h.coord))),
    gates: new Set(hexes.filter((h) => h.gate).map((h) => coordKey(h.coord))),
  };
  const resolved = resolveWall(wall, (): Terrain => 'grass', parseKey);
  return hexes.map((h) => ({ coord: h.coord, result: resolved.get(coordKey(h.coord))! }));
}

/** The grass hexes around the wall that the example draws as ground, so the wall does not float. */
export function exampleGroundHexes(hexes: readonly ExampleWallHex[] = exampleWallHexes()): AxialCoord[] {
  const wall = new Set(hexes.map((h) => coordKey(h.coord)));
  const ground = new Map<string, AxialCoord>();
  for (const h of hexes) {
    for (const n of neighbors(h.coord)) {
      const k = coordKey(n);
      if (!wall.has(k)) ground.set(k, n);
    }
  }
  return [...ground.values()];
}
