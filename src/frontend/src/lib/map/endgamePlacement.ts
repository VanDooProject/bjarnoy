// Endgame map placement — a bit-exact TypeScript port of the backend's
// `Bjarnoy.Domain.World.EndgameGenerator.PlaceCore` (see that file and `docs/design/endgame.md`): up to two rings of
// Utgard walls around a wasted island's Utgard, and a few Jötun watchtowers spread over the rest of the island.
// Pure and side-effect-free; `endgamePlacement.golden.test.ts` asserts it against the same
// `src/shared/endgame-placement-golden.json` fixture the backend's `EndgamePlacementGoldenTests` asserts its own `PlaceCore` against.
//
// Wall pieces are never chosen here: the walls are collected as a wall set and every hex resolves through `palisadeTiles.ts`
// (`tileOfWallHex`, the twin of `PalisadeRules`), the same code path player palisades use.
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import { canPlacePalisade, isRefusal, tileOfWallHex, type PalisadePiece, type WallSet } from './palisadeTiles';
import { UtgardFamily } from './giantPlacement';
import type { Terrain, TileOrientation } from './types';

/** Hex distance of the inner ring from Utgard's anchor (two hexes clear of the 7-hex fortress). */
export const InnerRingRadius = 3;
/** Hex distance of the outer ring from Utgard's anchor. */
export const OuterRingRadius = 6;
/** A ring is built only when at least this share of its hexes can take a wall. */
export const MinRingLandShare = 0.6;
/** Gates per ring, on straight pieces as far apart as the ring allows. */
export const GatesPerRing = 2;
/** Inner ring walls stand at this level (also the ring's maximum). */
export const InnerRingLevel = 2;
/** Outer ring walls stand at this level (also the ring's maximum). */
export const OuterRingLevel = 1;
/** Land tiles per watchtower (`floor(land / TilesPerTower + 0.5)`). */
export const TilesPerTower = 120;
export const MinTowers = 3;
export const MaxTowers = 6;
/** Minimum hex distance between two towers, and between a tower and any Utgard footprint hex. */
export const MinTowerSpacing = 5;
/** The owner key of every Utgard wall in the movement rules; belongs to no account and no guild, so a jötnar gate is never friendly. */
export const JOTNAR_OWNER_KEY = '6a6f746e-6172-4a6f-8f74-6e6172776c6c';

export type UtgardRing = 'inner' | 'outer';

export interface UtgardWallPlacement {
  coord: AxialCoord;
  ring: UtgardRing;
  piece: PalisadePiece;
  dir: TileOrientation;
  isGate: boolean;
  level: number;
}

export interface EndgameSites {
  walls: UtgardWallPlacement[];
  /** Tower hexes in placement order (orientation is the tile's own, attached by the caller). */
  towers: AxialCoord[];
}

export function ringRadius(ring: UtgardRing): number {
  return ring === 'inner' ? InnerRingRadius : OuterRingRadius;
}

export function ringLevel(ring: UtgardRing): number {
  return ring === 'inner' ? InnerRingLevel : OuterRingLevel;
}

/** How many watchtowers an island of this many land tiles gets (`floor(x + 0.5)`, never banker's rounding). */
export function towerCountFor(landTiles: number): number {
  return Math.min(MaxTowers, Math.max(MinTowers, Math.floor(landTiles / TilesPerTower + 0.5)));
}

// The six axial direction vectors, in `neighbors()` order (mirrors `HexCoord.Directions`).
const DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** The hexes at exactly `radius` from `centre`, in a fixed cyclic order (each hex adjacent to the next). */
export function ring(centre: AxialCoord, radius: number): AxialCoord[] {
  const hexes: AxialCoord[] = [];
  let q = centre.q + DIRECTIONS[4]!.q * radius;
  let r = centre.r + DIRECTIONS[4]!.r * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      hexes.push({ q, r });
      q += DIRECTIONS[side]!.q;
      r += DIRECTIONS[side]!.r;
    }
  }
  return hexes;
}

function footprint(anchor: AxialCoord): AxialCoord[] {
  return [anchor, ...neighbors(anchor)];
}

function isLowerQr(a: AxialCoord, b: AxialCoord): boolean {
  return a.q !== b.q ? a.q < b.q : a.r < b.r;
}

function wallNeighbourCount(c: AxialCoord, walls: ReadonlySet<string>): number {
  return neighbors(c).filter((n) => walls.has(coordKey(n))).length;
}

/**
 * The placement core — bit-exact mirror of `EndgameGenerator.PlaceCore`. `terrainOf` returns `sea` for any hex that is not the
 * island's land. `giants` are the island's giants (family and anchor); an island without an Utgard gets nothing.
 */
export function placeEndgame(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  giants: { anchor: AxialCoord; family: string }[],
  campHexes: ReadonlySet<string>,
  worldSeed: number,
  islandIndex: number,
): EndgameSites {
  const utgard = giants.find((g) => g.family === UtgardFamily);
  if (!utgard) return { walls: [], towers: [] };
  const anchor = utgard.anchor;

  // Large prime spacing, like the other generators, so this draws from its own noise field.
  const seed = worldSeed + islandIndex * 400_009;

  const giantHexes = new Set<string>();
  for (const giant of giants) for (const hex of footprint(giant.anchor)) giantHexes.add(coordKey(hex));

  const walls = placeWalls(anchor, terrainOf, isRiver, giantHexes, campHexes, seed);
  const wallHexes = new Set(walls.map((w) => coordKey(w.coord)));
  const towers = placeTowers(islandTiles, anchor, terrainOf, isRiver, giantHexes, campHexes, wallHexes, seed);
  return { walls, towers };
}

function placeWalls(
  anchor: AxialCoord,
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  giantHexes: ReadonlySet<string>,
  campHexes: ReadonlySet<string>,
  seed: number,
): UtgardWallPlacement[] {
  const ctx = { terrainAt: terrainOf, isRiver };
  const result: UtgardWallPlacement[] = [];
  const emptyWalls: WallSet = { walls: new Set(), gates: new Set() };

  for (const kind of ['inner', 'outer'] as const) {
    const hexes = ring(anchor, ringRadius(kind));
    const eligible = hexes.map((hex) => {
      const key = coordKey(hex);
      return (
        terrainOf(hex) !== 'sea' &&
        !isRiver(hex) &&
        !giantHexes.has(key) &&
        !campHexes.has(key) &&
        canPlacePalisade(hex, emptyWalls, ctx).ok
      );
    });
    const eligibleCount = eligible.filter(Boolean).length;
    if (eligibleCount < MinRingLandShare * hexes.length) continue;

    result.push(...resolveRing(hexes, eligible, terrainOf, seed, kind));
  }
  return result;
}

/** One qualified ring: runs, shore ends, refused runs dropped, gates, pieces. */
function resolveRing(
  hexes: AxialCoord[],
  eligible: boolean[],
  terrainOf: (c: AxialCoord) => Terrain,
  seed: number,
  kind: UtgardRing,
): UtgardWallPlacement[] {
  const n = hexes.length;
  const key = (i: number) => coordKey(hexes[i]!);

  // Runs of consecutive eligible ring indices, cyclic. A fully eligible ring is one closed run with no ends.
  const runs: number[][] = [];
  const closed = eligible.every(Boolean);
  if (closed) {
    runs.push(Array.from({ length: n }, (_, i) => i));
  } else {
    let start = 0;
    while (eligible[start]) start++;
    let current: number[] | null = null;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (eligible[i]) {
        current ??= [];
        current.push(i);
      } else if (current) {
        runs.push(current);
        current = null;
      }
    }
    if (current) runs.push(current);
  }

  // Land walls of every run first; shore ends are only added where exactly one wall hex touches the sea hex.
  const landWalls = new Set<string>(runs.flatMap((run) => run.map(key)));
  const shoreOfRun: number[][] = runs.map(() => []);
  const shoreCandidates: { run: number; index: number }[] = [];
  if (!closed) {
    runs.forEach((run, r) => {
      for (const neighbourIndex of [(run[0]! + n - 1) % n, (run[run.length - 1]! + 1) % n]) {
        if (eligible[neighbourIndex] || terrainOf(hexes[neighbourIndex]!) !== 'sea') continue;
        if (wallNeighbourCount(hexes[neighbourIndex]!, landWalls) === 1) shoreCandidates.push({ run: r, index: neighbourIndex });
      }
    });
  }

  // A sea end hangs off exactly one wall hex: two candidates next to each other (or one between two runs) would branch, so neither is
  // placed and those run ends stay plain ends.
  const candidateHexes = new Set<string>(landWalls);
  for (const c of shoreCandidates) candidateHexes.add(key(c.index));
  for (const { run, index } of shoreCandidates) {
    if (wallNeighbourCount(hexes[index]!, candidateHexes) === 1) shoreOfRun[run]!.push(index);
  }

  // Drop every run the palisade rules would refuse (an isolated single hex, a branch), then re-check: dropping a run changes its
  // shore ends' neighbours.
  const alive = new Set(runs.keys());
  let changed: boolean;
  do {
    changed = false;
    const set = new Set<string>();
    for (const r of alive) for (const i of [...runs[r]!, ...shoreOfRun[r]!]) set.add(key(i));
    const wallSet: WallSet = { walls: set, gates: new Set() };
    for (const r of [...alive]) {
      const refused = [...runs[r]!, ...shoreOfRun[r]!].some((i) => isRefusal(tileOfWallHex(hexes[i]!, wallSet, terrainOf)));
      if (refused) {
        alive.delete(r);
        changed = true;
      }
    }
  } while (changed);

  const indices = [...new Set([...alive].flatMap((r) => [...runs[r]!, ...shoreOfRun[r]!]))].sort((a, b) => a - b);
  const hexSet = new Set(indices.map(key));

  // Gates: two straights as far apart along the ring as possible.
  const plain: WallSet = { walls: hexSet, gates: new Set() };
  const straights = indices.filter((i) => {
    if (terrainOf(hexes[i]!) === 'sea') return false;
    const result = tileOfWallHex(hexes[i]!, plain, terrainOf);
    return !isRefusal(result) && result.piece === 'straight180';
  });
  const gates = chooseGates(straights, hexes, n, seed);
  const gateSet = new Set(gates.map(key));
  const gated: WallSet = { walls: hexSet, gates: gateSet };

  const level = ringLevel(kind);
  return indices.map((i) => {
    const tile = tileOfWallHex(hexes[i]!, gated, terrainOf);
    if (isRefusal(tile)) throw new Error(`Utgard wall hex ${key(i)} lost its piece`);
    return { coord: hexes[i]!, ring: kind, piece: tile.piece, dir: tile.dir, isGate: gateSet.has(key(i)), level };
  });
}

/**
 * Up to two gates: the pair of straights with the greatest cyclic ring-index distance; ties broken by the higher summed seed hash,
 * then the lower (Q, R) of the first and second hex. One straight gets one gate.
 */
function chooseGates(straights: number[], hexes: AxialCoord[], n: number, seed: number): number[] {
  if (straights.length <= 1) return [...straights];

  const hashOf = (i: number) => hash2(hexes[i]!.q, hexes[i]!.r, seed + 503);
  const cyclic = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, n - d);
  };
  const lowerKey = (a: number, b: number, other: [number, number]) => {
    const mine = [hexes[a]!.q, hexes[a]!.r, hexes[b]!.q, hexes[b]!.r];
    const theirs = [hexes[other[0]]!.q, hexes[other[0]]!.r, hexes[other[1]]!.q, hexes[other[1]]!.r];
    for (let k = 0; k < 4; k++) if (mine[k] !== theirs[k]) return mine[k]! < theirs[k]!;
    return false;
  };

  let best: [number, number] | null = null;
  let bestDistance = -1;
  let bestHash = -1;
  for (let x = 0; x < straights.length; x++) {
    for (let y = x + 1; y < straights.length; y++) {
      let a = straights[x]!;
      let b = straights[y]!;
      if (isLowerQr(hexes[b]!, hexes[a]!)) [a, b] = [b, a];
      const distance = cyclic(a, b);
      const hash = hashOf(a) + hashOf(b);
      if (
        best === null ||
        distance > bestDistance ||
        (distance === bestDistance && hash > bestHash) ||
        (distance === bestDistance && hash === bestHash && lowerKey(a, b, best))
      ) {
        best = [a, b];
        bestDistance = distance;
        bestHash = hash;
      }
    }
  }
  return [best![0], best![1]];
}

function placeTowers(
  islandTiles: AxialCoord[],
  anchor: AxialCoord,
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  giantHexes: ReadonlySet<string>,
  campHexes: ReadonlySet<string>,
  wallHexes: ReadonlySet<string>,
  seed: number,
): AxialCoord[] {
  const count = towerCountFor(islandTiles.length);
  const minDistanceFromAnchor = OuterRingRadius + 1;
  const fp = footprint(anchor);

  const candidates: { coord: AxialCoord; hash: number }[] = [];
  for (const hex of [...islandTiles].sort((a, b) => a.q - b.q || a.r - b.r)) {
    const terrain = terrainOf(hex);
    if (terrain !== 'grass' && terrain !== 'forest') continue;
    const key = coordKey(hex);
    if (isRiver(hex) || giantHexes.has(key) || campHexes.has(key) || wallHexes.has(key)) continue;
    if (hexDistance(hex, anchor) <= minDistanceFromAnchor) continue;
    // Utgard's footprint is the anchor and its neighbours; a tower keeps MinTowerSpacing from every one of them.
    if (fp.some((f) => hexDistance(f, hex) < MinTowerSpacing)) continue;
    candidates.push({ coord: hex, hash: hash2(hex.q, hex.r, seed + 401) });
  }

  const towers: AxialCoord[] = [];
  while (towers.length < count) {
    let best: { coord: AxialCoord; hash: number } | null = null;
    let bestSpread = -1;
    for (const candidate of candidates) {
      if (towers.some((t) => hexDistance(t, candidate.coord) < MinTowerSpacing)) continue;

      // The first tower is the highest hash; every later one the farthest from Utgard and the towers so far.
      let spread = 0;
      if (towers.length > 0) {
        spread = hexDistance(candidate.coord, anchor);
        for (const t of towers) spread = Math.min(spread, hexDistance(candidate.coord, t));
      }
      if (
        best === null ||
        spread > bestSpread ||
        (spread === bestSpread && candidate.hash > best.hash) ||
        (spread === bestSpread && candidate.hash === best.hash && isLowerQr(candidate.coord, best.coord))
      ) {
        best = candidate;
        bestSpread = spread;
      }
    }
    if (!best) break;
    towers.push(best.coord);
  }
  return towers;
}
