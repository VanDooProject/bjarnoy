// A bit-exact TypeScript port of the backend's
// `Bjarnoy.Domain.World.RiverGenerator.Generate` (see that file's own doc
// comment for the design): spring placement on mountain clusters, a
// funnel-to-coast walk with a meander term, a minimum-length filter, and a
// merge-two/drop-the-third rule for paths that collide. Pure and
// side-effect-free, mirroring `giantPlacement.ts`'s own "bit-exact port of a
// backend PlaceCore" pattern — `riverGenerator.golden.test.ts` asserts this
// against the same `src/shared/river-generation-golden.json` fixture the
// backend's `RiverGenerationGoldenTests` asserts its own `RiverGenerator.Generate`
// against.
//
// Order matters here, not just membership: `RiverTile.inDirections`/
// `outDirection` depend on the exact path a river traced, and the golden
// fixture compares the frozen tile list directly.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import { TILE_ORIENTATIONS } from './types';
import type { RiverTile, RiverTileShape, Terrain, TileOrientation } from './types';

/**
 * A traced river shorter than this (in tiles, spring to mouth inclusive) is
 * discarded rather than rendered — mirrors `WorldGenerationOptions.MinRiverLength`'s
 * default.
 */
export const MIN_RIVER_LENGTH = 2;

/**
 * How much a river's path wanders sideways instead of taking the steepest
 * descent to the coast at every step — mirrors
 * `WorldGenerationOptions.RiverMeanderWeight`'s default.
 */
export const RIVER_MEANDER_WEIGHT = 0.35;

/**
 * Subtracted from a candidate step's score when it would turn 120° off
 * straight-ahead (a `bend60` tile) — mirrors
 * `WorldGenerationOptions.SharpBendPenalty`'s default.
 */
export const SHARP_BEND_PENALTY = 0.5;

function sortedByQR(tiles: AxialCoord[]): AxialCoord[] {
  return [...tiles].sort((a, b) => a.q - b.q || a.r - b.r);
}

/** The direction index (0-5, matching `TILE_ORIENTATIONS`) from one hex to an adjacent one — mirrors `RiverGenerator.DirectionIndex`. */
function directionIndex(from: AxialCoord, to: AxialCoord): number {
  const ns = neighbors(from);
  for (let i = 0; i < ns.length; i++) {
    if (ns[i].q === to.q && ns[i].r === to.r) return i;
  }
  throw new Error(`(${to.q},${to.r}) is not a neighbour of (${from.q},${from.r})`);
}

/** Connected groups of mountain tiles within one island (mountain-to-mountain adjacency only) — mirrors `RiverGenerator.ClusterMountains`. */
function clusterMountains(islandTiles: AxialCoord[], terrainOf: (c: AxialCoord) => Terrain): AxialCoord[][] {
  const mountains = new Set<string>();
  const byKey = new Map<string, AxialCoord>();
  for (const tile of islandTiles) {
    if (terrainOf(tile) === 'mountain') {
      const key = coordKey(tile);
      mountains.add(key);
      byKey.set(key, tile);
    }
  }

  const visited = new Set<string>();
  const clusters: AxialCoord[][] = [];

  // Sorted scan order keeps cluster (and therefore spring) assignment stable
  // for a given seed — mirrors `ClusterMountains`'s own reasoning.
  for (const start of sortedByQR([...mountains].map((k) => byKey.get(k)!))) {
    const startKey = coordKey(start);
    if (visited.has(startKey)) continue;
    visited.add(startKey);

    const cluster: AxialCoord[] = [];
    const pending: AxialCoord[] = [start];
    while (pending.length > 0) {
      const coord = pending.pop()!;
      cluster.push(coord);
      for (const n of neighbors(coord)) {
        const k = coordKey(n);
        if (mountains.has(k) && !visited.has(k)) {
          visited.add(k);
          pending.push(n);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/** The highest seed-hash-scored tile in a qualifying cluster — mirrors `RiverGenerator.PickSpring`. */
function pickSpring(cluster: AxialCoord[], seed: number): AxialCoord {
  let best = cluster[0];
  let bestScore = -1;

  for (const coord of sortedByQR(cluster)) {
    const score = hash2(coord.q, coord.r, seed + 41);
    if (score > bestScore) {
      bestScore = score;
      best = coord;
    }
  }

  return best;
}

/** A tile "touches the sea" when at least one of its neighbours is not land — mirrors `RiverGenerator.TouchesSea`. */
function touchesSea(tile: AxialCoord, isLand: (c: AxialCoord) => boolean): boolean {
  return neighbors(tile).some((n) => !isLand(n));
}

/**
 * Unvisited land neighbours of `tile`, non-decreasing-depth candidates first
 * (ordered best score to worst), then lower-depth fallback candidates (also
 * best score to worst) — mirrors `RiverGenerator.BuildCandidates`.
 */
function buildCandidates(
  tile: AxialCoord,
  path: AxialCoord[],
  islandLand: Set<string>,
  visited: Set<string>,
  depthAt: (c: AxialCoord) => number | null,
  seed: number,
): AxialCoord[] {
  const ns = neighbors(tile);

  // The two candidate directions a 120°-off-straight-ahead turn would take,
  // once there's a previous tile to measure "straight ahead" from — scored
  // down below rather than excluded, so a bend60 tile stays possible but
  // rarer.
  let sharpTurnA = -1;
  let sharpTurnB = -1;
  if (path.length >= 2) {
    const previous = path[path.length - 2];
    const inIndex = directionIndex(tile, previous);
    const straightAhead = (inIndex + 3) % 6;
    sharpTurnA = (straightAhead + 2) % 6;
    sharpTurnB = (straightAhead + 4) % 6;
  }

  const currentDepth = depthAt(tile) ?? 0;
  const forward: { coord: AxialCoord; score: number }[] = [];
  const fallback: { coord: AxialCoord; score: number }[] = [];

  for (let i = 0; i < ns.length; i++) {
    const neighbour = ns[i];
    const key = coordKey(neighbour);
    if (!islandLand.has(key) || visited.has(key)) continue;

    const depth = depthAt(neighbour);
    if (depth === null) continue;

    const noise = hash2(neighbour.q, neighbour.r, seed + 43);
    let score = depth + RIVER_MEANDER_WEIGHT * noise;
    if (i === sharpTurnA || i === sharpTurnB) score -= SHARP_BEND_PENALTY;

    (depth >= currentDepth ? forward : fallback).push({ coord: neighbour, score });
  }

  forward.sort((a, b) => b.score - a.score);
  fallback.sort((a, b) => b.score - a.score);

  return [...forward.map((c) => c.coord), ...fallback.map((c) => c.coord)];
}

interface TraceFrame {
  candidates: AxialCoord[];
  nextIndex: number;
}

/**
 * Walks from a spring toward the coast — mirrors `RiverGenerator.TracePath`
 * (including its explicit-stack backtracking: a dead end unvisits its own
 * tile so a different branch from its parent can still route through it).
 */
function tracePath(
  spring: AxialCoord,
  islandLand: Set<string>,
  depthAt: (c: AxialCoord) => number | null,
  isLand: (c: AxialCoord) => boolean,
  seed: number,
): { path: AxialCoord[]; reachedSea: boolean } {
  const path: AxialCoord[] = [spring];
  const visited = new Set<string>([coordKey(spring)]);
  const frames: TraceFrame[] = [
    { candidates: buildCandidates(spring, path, islandLand, visited, depthAt, seed), nextIndex: 0 },
  ];

  // Each tile's candidate list is built once, when it's pushed, and every
  // candidate in it is consumed at most once before the frame is popped — so
  // total work is bounded by edges in the island's tile graph, not
  // exponential. This cap is a defensive backstop against any pathological
  // island shape, not the normal exit path.
  let budget = islandLand.size * 8;

  while (frames.length > 0 && budget-- > 0) {
    const current = path[path.length - 1];
    if (touchesSea(current, isLand)) {
      return { path, reachedSea: true };
    }

    const frame = frames[frames.length - 1];
    if (frame.nextIndex >= frame.candidates.length) {
      // Dead end: no candidate from here leads anywhere new. Backtrack —
      // unvisit this tile so a different branch from its parent can still
      // route through it.
      frames.pop();
      visited.delete(coordKey(current));
      path.pop();
      continue;
    }

    const next = frame.candidates[frame.nextIndex++];
    const nextKey = coordKey(next);
    if (visited.has(nextKey)) continue;
    visited.add(nextKey);

    path.push(next);
    frames.push({ candidates: buildCandidates(next, path, islandLand, visited, depthAt, seed), nextIndex: 0 });
  }

  return { path, reachedSea: false };
}

/**
 * Deterministic-priority pass over independently-traced paths: the first two
 * to reach a tile share it (a confluence); a path is truncated the moment it
 * reaches a tile already claimed twice, and discarded if that leaves it
 * under the minimum length — mirrors `RiverGenerator.ResolveCollisions`.
 */
function resolveCollisions(paths: AxialCoord[][], allowConfluence: boolean): AxialCoord[][] {
  const ordered = [...paths].sort((a, b) => a[0].q - b[0].q || a[0].r - b[0].r);
  const claimCount = new Map<string, number>();
  const survivors: AxialCoord[][] = [];

  for (const path of ordered) {
    if (!allowConfluence) {
      // Lava streams never merge, never share a tile: a path that reaches
      // any tile an earlier path already claimed is dropped entirely rather
      // than truncated into a confluence.
      if (path.some((tile) => claimCount.has(coordKey(tile)))) continue;
      if (path.length < MIN_RIVER_LENGTH) continue;

      for (const tile of path) claimCount.set(coordKey(tile), 1);
      survivors.push(path);
      continue;
    }

    const truncated: AxialCoord[] = [];
    for (const tile of path) {
      const key = coordKey(tile);
      const count = claimCount.get(key) ?? 0;
      if (count >= 2) break;

      truncated.push(tile);
      claimCount.set(key, count + 1);

      if (count >= 1) {
        // This tile just became a confluence: this path merges into
        // whichever path already owns it rather than continuing past it as
        // an independent line.
        break;
      }
    }

    if (truncated.length >= MIN_RIVER_LENGTH) survivors.push(truncated);
  }

  return survivors;
}

/** Mirrors `RiverGenerator.BuildRiverTiles`. */
function buildRiverTiles(paths: AxialCoord[][], wasted: boolean): RiverTile[] {
  const inDirections = new Map<string, TileOrientation[]>();
  const outDirection = new Map<string, TileOrientation>();
  const allTiles = new Map<string, AxialCoord>();

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const tile = path[i];
      const key = coordKey(tile);
      allTiles.set(key, tile);

      if (i > 0) {
        const previous = path[i - 1];
        const direction = TILE_ORIENTATIONS[directionIndex(tile, previous)];
        const list = inDirections.get(key);
        if (list) list.push(direction);
        else inDirections.set(key, [direction]);
      }

      if (i < path.length - 1) {
        const next = path[i + 1];
        outDirection.set(key, TILE_ORIENTATIONS[directionIndex(tile, next)]);
      }
    }
  }

  const result: RiverTile[] = [];
  for (const tile of sortedByQR([...allTiles.values()])) {
    const key = coordKey(tile);
    const ins = inDirections.get(key) ?? [];
    const outDir = outDirection.get(key) ?? null;

    let shape: RiverTileShape;
    if (ins.length === 0) {
      shape = 'spring';
    } else if (ins.length >= 2) {
      shape = 'confluence';
    } else if (outDir === null) {
      shape = 'mouth';
    } else {
      // 0°: continues straight through. 60° either side: a gentle bend. 120°
      // either side: the sharper bend60 — legal since `tracePath` doesn't
      // exclude it, just scores it down.
      const inIndex = TILE_ORIENTATIONS.indexOf(ins[0]);
      const outIndex = TILE_ORIENTATIONS.indexOf(outDir);
      const opposite = (inIndex + 3) % 6;
      const turn = Math.min((outIndex - opposite + 6) % 6, (opposite - outIndex + 6) % 6);
      shape = turn === 0 ? 'straight' : turn === 2 ? 'bend60' : 'bend';
    }

    result.push({ q: tile.q, r: tile.r, shape, inDirections: ins, outDirection: outDir, wasted });
  }

  return result;
}

/**
 * The pure river-tracing core — bit-exact mirror of `RiverGenerator.Generate`
 * (backend).
 *
 * `terrainOf` only needs to answer for hexes in `islandTiles` (used solely to
 * find Mountain clusters); `depthAt` and `globalIsLand` mirror the backend's
 * `sampler.IslandDepthAt`/`WastedDepthAt` and `sampler.IsLand` respectively —
 * callers pick the green or wasted pair the same way `WorldGenerator.Generate`
 * does (see that file's own doc comment on `depthAt`/`isLand`). `globalIsLand`
 * is only consulted when `wasted` is false: a wasted island's own "touches the
 * sea" check uses `islandTiles` membership instead, since `terrainAt`/
 * `wastedTerrainAt` report wasted land as sea (mirrors `RiverGenerator.Generate`'s
 * own `isLand` selection).
 */
export function generateRivers(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  depthAt: (c: AxialCoord) => number | null,
  globalIsLand: (c: AxialCoord) => boolean,
  worldSeed: number,
  islandIndex: number,
  wasted = false,
  allowConfluence = true,
): RiverTile[] {
  const islandLand = new Set(islandTiles.map((c) => coordKey(c)));

  // Large prime spacing so two islands never draw from overlapping noise —
  // the same trick `giantPlacement.ts`/`IslandNames` use for their own
  // per-index offsets.
  const seed = worldSeed + islandIndex * 104_729;

  const isLand = wasted ? (c: AxialCoord) => islandLand.has(coordKey(c)) : globalIsLand;

  const springs: AxialCoord[] = [];
  for (const cluster of clusterMountains(islandTiles, terrainOf)) {
    if (cluster.length < 2) continue;
    springs.push(pickSpring(cluster, seed));
  }

  const paths: AxialCoord[][] = [];
  for (const spring of springs) {
    const { path, reachedSea } = tracePath(spring, islandLand, depthAt, isLand, seed);
    if (reachedSea && path.length >= MIN_RIVER_LENGTH) paths.push(path);
  }

  const survivors = resolveCollisions(paths, allowConfluence);
  return buildRiverTiles(survivors, wasted);
}
