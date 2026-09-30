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
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import { confluenceKind, TILE_ORIENTATIONS } from './types';
import type { RiverTile, RiverTileShape, RiverWidth, Terrain, TileOrientation } from './types';

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

/** Land tiles an island needs per river spring — mirrors `WorldGenerationOptions.RiverTilesPerSpring`. */
export const RIVER_TILES_PER_SPRING = 900;
/** Most springs one island gets — mirrors `WorldGenerationOptions.MaxSpringsPerIsland`. */
export const MAX_SPRINGS_PER_ISLAND = 16;
/** Springs are picked farthest-first until the best is closer than this — mirrors `WorldGenerationOptions.MinSpringSpacing`. */
export const MIN_SPRING_SPACING = 10;
/** Score bonus for a step that merges into an existing river — mirrors `WorldGenerationOptions.MergeBonus`. */
export const MERGE_BONUS = 0.35;
/** Pull of earlier rivers on a walk: up to this much extra score within `MERGE_ATTRACTION_RADIUS` hexes of one — mirrors `WorldGenerationOptions.MergeAttraction`. */
export const MERGE_ATTRACTION = 0.3;
/** Reach (hexes) of `MERGE_ATTRACTION` — mirrors `WorldGenerationOptions.MergeAttractionRadius`. */
export const MERGE_ATTRACTION_RADIUS = 12;

/** Counters a caller can pass to `generateRivers` to see what the tracer did (the preview tool, tests). */
export interface RiverStats {
  springs: number;
  rivers: number;
  merges: number;
  widenings: number;
  truncatedBranches: number;
  droppedRivers: number;
}

export function emptyRiverStats(): RiverStats {
  return { springs: 0, rivers: 0, merges: 0, widenings: 0, truncatedBranches: 0, droppedRivers: 0 };
}

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
  claims: Map<string, Claim> | null,
  claimDistance: Map<string, number> | null,
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

    let merge = false;
    const claim = claims?.get(key);
    if (claim) {
      // A tile of an earlier river is a step only as a merge, and only into a plain one-inflow
      // tile whose Y the art can draw (never a spring, mouth or confluence).
      if (claim.spring || claim.in1 < 0 || claim.in2 >= 0 || claim.out < 0 || confluenceKind(claim.in1, (i + 3) % 6, claim.out) === null) {
        continue;
      }
      merge = true;
    }

    const noise = hash2(neighbour.q, neighbour.r, seed + 43);
    let score = depth + RIVER_MEANDER_WEIGHT * noise;
    if (merge) score += MERGE_BONUS;
    else {
      const pull = claimDistance?.get(key);
      if (pull !== undefined) score += (MERGE_ATTRACTION * (MERGE_ATTRACTION_RADIUS - pull + 1)) / MERGE_ATTRACTION_RADIUS;
    }
    if (i === sharpTurnA || i === sharpTurnB) score -= SHARP_BEND_PENALTY;

    (depth >= currentDepth ? forward : fallback).push({ coord: neighbour, score });
  }

  forward.sort((a, b) => b.score - a.score);
  fallback.sort((a, b) => b.score - a.score);

  return [...forward.map((c) => c.coord), ...fallback.map((c) => c.coord)];
}

/** A tile already part of a committed river: its inflow(s) and outflow as direction indices (-1 = none). */
interface Claim {
  in1: number;
  in2: number;
  out: number;
  spring: boolean;
}

type TraceOutcome = 'failed' | 'sea' | 'merged';

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
  claims: Map<string, Claim> | null,
  claimDistance: Map<string, number> | null,
): { path: AxialCoord[]; outcome: TraceOutcome } {
  const path: AxialCoord[] = [spring];
  const visited = new Set<string>([coordKey(spring)]);
  const frames: TraceFrame[] = [
    { candidates: buildCandidates(spring, path, islandLand, visited, depthAt, seed, claims, claimDistance), nextIndex: 0 },
  ];

  // Each tile's candidate list is built once, when it's pushed, and every
  // candidate in it is consumed at most once before the frame is popped — so
  // total work is bounded by edges in the island's tile graph, not
  // exponential. This cap is a defensive backstop against any pathological
  // island shape, not the normal exit path.
  let budget = islandLand.size * 8;

  while (frames.length > 0 && budget-- > 0) {
    const current = path[path.length - 1];
    if (claims && path.length > 1 && claims.has(coordKey(current))) {
      // Stepped onto an earlier river (buildCandidates only offers a tile the art can draw as a
      // Y): the tributary has become part of the trunk.
      return { path, outcome: 'merged' };
    }

    if (touchesSea(current, isLand)) {
      return { path, outcome: 'sea' };
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
    frames.push({ candidates: buildCandidates(next, path, islandLand, visited, depthAt, seed, claims, claimDistance), nextIndex: 0 });
  }

  return { path, outcome: 'failed' };
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

/** A traced river hex on its way to becoming a `RiverTile` — mirrors the backend's private `Node`. */
interface Node {
  coord: AxialCoord;
  shape: RiverTileShape;
  ins: number[];
  out: number;
  width: RiverWidth;
  outRiver: boolean;
  removed: boolean;
}

/** The shape of a tile with these inflow directions and this outflow (-1 = none) — mirrors `RiverGenerator.ShapeOf`. */
function shapeOf(ins: number[], out: number): RiverTileShape {
  if (ins.length === 0) return 'spring';
  if (ins.length >= 2) return 'confluence';
  if (out < 0) return 'mouth';
  // 0°: continues straight through. 60° either side: a gentle bend. 120° either side: the
  // sharper bend60.
  const opposite = (ins[0]! + 3) % 6;
  const turn = Math.min((out - opposite + 6) % 6, (opposite - out + 6) % 6);
  return turn === 0 ? 'straight' : turn === 2 ? 'bend60' : 'bend';
}

/** Mirrors `RiverGenerator.BuildRiverTiles`. */
function buildNodes(paths: AxialCoord[][]): Node[] {
  const inDirections = new Map<string, number[]>();
  const outDirection = new Map<string, number>();
  const allTiles = new Map<string, AxialCoord>();

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const tile = path[i]!;
      const key = coordKey(tile);
      allTiles.set(key, tile);

      if (i > 0) {
        const direction = directionIndex(tile, path[i - 1]!);
        const list = inDirections.get(key);
        if (list) list.push(direction);
        else inDirections.set(key, [direction]);
      }

      if (i < path.length - 1) outDirection.set(key, directionIndex(tile, path[i + 1]!));
    }
  }

  const result: Node[] = [];
  for (const tile of sortedByQR([...allTiles.values()])) {
    const key = coordKey(tile);
    const ins = inDirections.get(key) ?? [];
    const out = outDirection.get(key) ?? -1;
    result.push({ coord: tile, shape: shapeOf(ins, out), ins, out, width: 'river', outRiver: false, removed: false });
  }
  return result;
}

function nodeToTile(n: Node, width: RiverWidth, wasted: boolean): RiverTile {
  return {
    q: n.coord.q,
    r: n.coord.r,
    shape: n.shape,
    inDirections: n.ins.map((d) => TILE_ORIENTATIONS[d]!),
    outDirection: n.out >= 0 ? TILE_ORIENTATIONS[n.out]! : null,
    width,
    wasted,
  };
}

const step = (from: AxialCoord, dir: number): AxialCoord => {
  const n = neighbors(from)[dir]!;
  return { q: n.q, r: n.r };
};

/**
 * Assigns each tile's width — mirrors `RiverGenerator.AssignWidths`. Every tile starts as a
 * stream; two streams meeting widen at the Y (smallwide Y, river below); a branch that must
 * arrive at river width (the sea mouth, a confluence with a river) widens on a straight tile
 * chosen by hash from the second half of its stream run, and is truncated when that half has none.
 */
function assignWidths(
  nodes: Node[],
  isLand: (c: AxialCoord) => boolean,
  seed: number,
  stats: RiverStats | undefined,
): RiverTile[] {
  const byCoord = new Map(nodes.map((n) => [coordKey(n.coord), n]));
  const pending = new Map(nodes.map((n) => [coordKey(n.coord), n.ins.length]));
  const queue: Node[] = nodes.filter((n) => n.ins.length === 0);

  const upstream = (n: Node, dir: number): Node => byCoord.get(coordKey(step(n.coord, dir)))!;

  // The pure stream run ending at `last`, spring first.
  const chainTo = (last: Node): Node[] => {
    const chain: Node[] = [];
    let cur = last;
    for (;;) {
      chain.push(cur);
      if (cur.ins.length === 0) break;
      cur = upstream(cur, cur.ins[0]!);
    }
    return chain.reverse();
  };

  // Widens somewhere in the second half of the chain; false when no straight tile lives there.
  const tryWiden = (chain: Node[], requirement: AxialCoord): boolean => {
    const candidates: number[] = [];
    for (let i = Math.max(1, Math.floor((chain.length + 1) / 2)); i < chain.length; i++) {
      if (chain[i]!.shape === 'straight') candidates.push(i);
    }
    if (candidates.length === 0) return false;

    const pick = candidates[Math.floor(hash2(requirement.q, requirement.r, seed + 47) * candidates.length)]!;
    chain[pick]!.width = 'widen';
    chain[pick]!.outRiver = true;
    for (let i = pick + 1; i < chain.length; i++) {
      chain[i]!.width = 'river';
      chain[i]!.outRiver = true;
    }
    if (stats) stats.widenings++;
    return true;
  };

  const remove = (chain: Node[]) => {
    for (const n of chain) n.removed = true;
  };

  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    switch (v.shape) {
      case 'spring':
        v.width = 'stream';
        v.outRiver = false;
        break;

      case 'confluence': {
        const a = upstream(v, v.ins[0]!);
        const b = upstream(v, v.ins[1]!);
        if (!a.outRiver && !b.outRiver) {
          v.width = 'widen';
          v.outRiver = true;
          if (stats) stats.widenings++;
        } else if (a.outRiver && b.outRiver) {
          v.width = 'river';
          v.outRiver = true;
        } else {
          const streamBranch = a.outRiver ? b : a;
          const streamDir = a.outRiver ? v.ins[1]! : v.ins[0]!;
          const chain = chainTo(streamBranch);
          if (tryWiden(chain, v.coord)) {
            v.width = 'river';
          } else {
            // No straight tile to widen on: the branch is dropped up to where it would join, and
            // this tile carries on as a plain tile of the river.
            remove(chain);
            v.ins.splice(v.ins.indexOf(streamDir), 1);
            v.shape = shapeOf(v.ins, v.out);
            v.width = 'river';
            if (stats) stats.truncatedBranches++;
          }
          v.outRiver = true;
        }
        break;
      }

      case 'mouth': {
        const up = upstream(v, v.ins[0]!);
        if (up.outRiver) {
          v.width = 'river';
          v.outRiver = true;
        } else {
          const chain = chainTo(up);
          if (tryWiden(chain, v.coord)) {
            v.width = 'river';
          } else if (!isLand(step(v.coord, (v.ins[0]! + 3) % 6))) {
            v.width = 'widen';
            if (stats) stats.widenings++;
          } else {
            chain.push(v);
            remove(chain);
            if (stats) stats.droppedRivers++;
          }
          v.outRiver = true;
        }
        break;
      }

      default: {
        const up = upstream(v, v.ins[0]!);
        v.width = up.outRiver ? 'river' : 'stream';
        v.outRiver = up.outRiver;
        break;
      }
    }

    if (v.out >= 0 && !v.removed) {
      const next = byCoord.get(coordKey(step(v.coord, v.out)))!;
      const key = coordKey(next.coord);
      const left = pending.get(key)! - 1;
      pending.set(key, left);
      if (left === 0) queue.push(next);
    }
  }

  return nodes.filter((n) => !n.removed).map((n) => nodeToTile(n, n.width, false));
}

/** Mirrors `RiverGenerator.SpreadClaimDistance`: distance to the nearest tile a walk could merge from. */
function spreadClaimDistance(
  path: AxialCoord[],
  claims: Map<string, Claim>,
  islandLand: Set<string>,
  claimDistance: Map<string, number>,
): void {
  let frontier: AxialCoord[] = [];
  for (const tile of path) {
    const claim = claims.get(coordKey(tile))!;
    if (claim.spring || claim.in1 < 0 || claim.in2 >= 0 || claim.out < 0) continue;
    const ns = neighbors(tile);
    for (let b = 0; b < 6; b++) {
      const approach = ns[b]!;
      const k = coordKey(approach);
      if (
        islandLand.has(k) &&
        !claims.has(k) &&
        confluenceKind(claim.in1, b, claim.out) !== null &&
        !((claimDistance.get(k) ?? 99) <= 1)
      ) {
        claimDistance.set(k, 1);
        frontier.push(approach);
      }
    }
  }

  for (let d = 2; d <= MERGE_ATTRACTION_RADIUS && frontier.length > 0; d++) {
    const next: AxialCoord[] = [];
    for (const tile of frontier) {
      for (const n of neighbors(tile)) {
        const k = coordKey(n);
        if (!islandLand.has(k) || claims.has(k)) continue;
        const known = claimDistance.get(k);
        if (known !== undefined && known <= d) continue;
        claimDistance.set(k, d);
        next.push(n);
      }
    }
    frontier = next;
  }
}

/**
 * Springs by farthest-point sampling — mirrors `RiverGenerator.PickSprings`: candidates are
 * mountain tiles of clusters of at least two that sit on a range edge and do not touch the sea
 * (falling back to any mountain tile of such a cluster that does not touch the sea); the first
 * is the most inland, each next one maximises its distance to those already chosen.
 */
function pickSprings(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  islandLand: Set<string>,
  depthAt: (c: AxialCoord) => number | null,
  seed: number,
): AxialCoord[] {
  const strict: AxialCoord[] = [];
  const loose: AxialCoord[] = [];
  for (const cluster of clusterMountains(islandTiles, terrainOf)) {
    if (cluster.length < 2) continue;
    for (const tile of cluster) {
      let seaAdjacent = false;
      let rangeEdge = false;
      for (const n of neighbors(tile)) {
        if (!islandLand.has(coordKey(n))) {
          seaAdjacent = true;
          break;
        }
        if (terrainOf(n) !== 'mountain') rangeEdge = true;
      }
      if (seaAdjacent) continue;
      loose.push(tile);
      if (rangeEdge) strict.push(tile);
    }
  }

  const candidates = sortedByQR(strict.length > 0 ? strict : loose);
  const springs: AxialCoord[] = [];
  if (candidates.length === 0) return springs;

  const hash = candidates.map((c) => hash2(c.q, c.r, seed + 41));
  const k = Math.min(
    MAX_SPRINGS_PER_ISLAND,
    Math.max(1, Math.floor(islandTiles.length / RIVER_TILES_PER_SPRING + 0.5)),
  );

  let first = 0;
  let firstDepth = depthAt(candidates[0]!) ?? 0;
  for (let i = 1; i < candidates.length; i++) {
    const d = depthAt(candidates[i]!) ?? 0;
    if (d < firstDepth || (d === firstDepth && hash[i]! > hash[first]!)) {
      first = i;
      firstDepth = d;
    }
  }

  springs.push(candidates[first]!);
  const minDistance = candidates.map((c) => hexDistance(c, candidates[first]!));
  while (springs.length < k) {
    let best = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (
        best < 0 ||
        minDistance[i]! > minDistance[best]! ||
        (minDistance[i] === minDistance[best] && hash[i]! > hash[best]!)
      ) {
        best = i;
      }
    }
    if (minDistance[best]! < MIN_SPRING_SPACING || minDistance[best] === 0) break;
    springs.push(candidates[best]!);
    for (let i = 0; i < candidates.length; i++) {
      minDistance[i] = Math.min(minDistance[i]!, hexDistance(candidates[i]!, candidates[best]!));
    }
  }
  return springs;
}

/**
 * The pure river-tracing core — bit-exact mirror of `RiverGenerator.Generate` (backend).
 *
 * `terrainOf` only needs to answer for hexes in `islandTiles` (mountain clusters, the range-edge
 * test); `depthAt` and `globalIsLand` mirror the backend's `sampler.IslandDepthAt`/`WastedDepthAt`
 * and `sampler.IsLand` respectively — callers pick the green or wasted pair the same way
 * `WorldGenerator.Generate` does. `globalIsLand` is only consulted when `wasted` is false: a
 * wasted island's own "touches the sea" check uses `islandTiles` membership instead, since
 * `terrainAt`/`wastedTerrainAt` report wasted land as sea.
 *
 * Green islands trace farthest-first springs sequentially, merging a tributary only where the art
 * can draw the Y, then assign widths (stream, one widening, river). Lava (wasted) rivers keep the
 * older independent-walk rule (`allowConfluence: false`, one spring per cluster, river width).
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
  stats?: RiverStats,
): RiverTile[] {
  const islandLand = new Set(islandTiles.map((c) => coordKey(c)));

  // Large prime spacing so two islands never draw from overlapping noise — the same trick
  // `giantPlacement.ts`/`IslandNames` use for their own per-index offsets.
  const seed = worldSeed + islandIndex * 104_729;

  const isLand = wasted ? (c: AxialCoord) => islandLand.has(coordKey(c)) : globalIsLand;

  if (wasted || !allowConfluence) {
    const springs: AxialCoord[] = [];
    for (const cluster of clusterMountains(islandTiles, terrainOf)) {
      if (cluster.length < 2) continue;
      springs.push(pickSpring(cluster, seed));
    }

    const paths: AxialCoord[][] = [];
    for (const spring of springs) {
      const { path, outcome } = tracePath(spring, islandLand, depthAt, isLand, seed, null, null);
      if (outcome === 'sea' && path.length >= MIN_RIVER_LENGTH) paths.push(path);
    }

    const survivors = resolveCollisions(paths, allowConfluence);
    return buildNodes(survivors).map((n) => nodeToTile(n, 'river', wasted));
  }

  const springs = pickSprings(islandTiles, terrainOf, islandLand, depthAt, seed);
  const claims = new Map<string, Claim>();
  const claimDistance = new Map<string, number>();
  const paths: AxialCoord[][] = [];
  for (const spring of springs) {
    if (claims.has(coordKey(spring))) continue;

    const { path, outcome } = tracePath(spring, islandLand, depthAt, isLand, seed, claims, claimDistance);
    if (outcome === 'failed' || path.length < MIN_RIVER_LENGTH) continue;

    const merged = outcome === 'merged';
    for (let i = 0; i < path.length; i++) {
      const tile = path[i]!;
      const inDir = i > 0 ? directionIndex(tile, path[i - 1]!) : -1;
      const outDir = i < path.length - 1 ? directionIndex(tile, path[i + 1]!) : -1;
      if (i === path.length - 1 && merged) {
        claims.get(coordKey(tile))!.in2 = inDir;
        continue;
      }
      claims.set(coordKey(tile), { in1: inDir, in2: -1, out: outDir, spring: i === 0 });
    }
    spreadClaimDistance(path, claims, islandLand, claimDistance);
    paths.push(path);
    if (stats) {
      stats.rivers++;
      if (merged) stats.merges++;
    }
  }
  if (stats) stats.springs += springs.length;

  return assignWidths(buildNodes(paths), isLand, seed, stats);
}
