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
import { hash2, valueNoise } from './worldGenerator';
import { confluenceKind, TILE_ORIENTATIONS } from './types';
import type { BogTile, RiverTile, RiverTileShape, RiverWidth, Terrain } from './types';
import { BogGenerator, BogPaths, emptyBogStats, HexSet, type BogStats } from './bogGenerator';

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
export const RIVER_TILES_PER_SPRING = 500;
/** Most springs one island gets — mirrors `WorldGenerationOptions.MaxSpringsPerIsland`. */
export const MAX_SPRINGS_PER_ISLAND = 24;
/** Springs are picked farthest-first until the best is closer than this — mirrors `WorldGenerationOptions.MinSpringSpacing`. */
export const MIN_SPRING_SPACING = 8;
/** Land tiles an island needs per river outlet — mirrors `WorldGenerationOptions.OutletTilesPer`. */
export const OUTLET_TILES_PER = 2000;
/** Most outlets one island gets — mirrors `WorldGenerationOptions.MaxOutlets`. */
export const MAX_OUTLETS = 12;
/** Outlets are picked farthest-first until the best is closer than this — mirrors `WorldGenerationOptions.MinOutletSpacing`. */
export const MIN_OUTLET_SPACING = 25;
/** Weight of the per-tile noise in a drainage step's cost — mirrors `WorldGenerationOptions.DrainageNoise`. */
export const DRAINAGE_NOISE = 1.5;
/** Weight of the smooth valley noise in a drainage step's cost — mirrors `WorldGenerationOptions.ValleyNoise`. */
export const VALLEY_NOISE = 6.0;
/** Wavelength (hexes) of the valley noise — mirrors `WorldGenerationOptions.ValleyScale`. */
export const VALLEY_SCALE = 4.0;
/** Extra drainage cost of a mountain tile — mirrors `WorldGenerationOptions.MountainCost`. */
export const MOUNTAIN_COST = 2.0;
/** Drainage cost of a 60 degree turn — mirrors `WorldGenerationOptions.BendCost`. */
export const BEND_COST = 0.03;
/** Drainage cost of a 120 degree turn — mirrors `WorldGenerationOptions.SharpBendCost`. */
export const SHARP_BEND_COST = 1.0;
/** How much longer a tributary's way via a drawable junction may be than running on alone and still be taken — mirrors `WorldGenerationOptions.MergeSlack`. */
export const MERGE_SLACK = 6.0;
/** Drainage cost within which a tributary looks for a trunk to join — mirrors `WorldGenerationOptions.MergeReach`. */
export const MERGE_REACH = 20.0;
/** Cost a junction search takes off a wide-Y junction into a river-width trunk — mirrors `WorldGenerationOptions.RiverStreamBonus`. */
export const RIVER_STREAM_BONUS = 3.0;

/** Counters a caller can pass to `generateRivers` to see what the tracer did (the preview tool, tests). */
export interface RiverStats extends BogStats {
  springs: number;
  outlets: number;
  rivers: number;
  merges: number;
  widenings: number;
  riverStreamJoins: number;
  truncatedBranches: number;
  droppedRivers: number;
}

export function emptyRiverStats(): RiverStats {
  return {
    springs: 0,
    outlets: 0,
    rivers: 0,
    merges: 0,
    widenings: 0,
    riverStreamJoins: 0,
    truncatedBranches: 0,
    droppedRivers: 0,
    ...emptyBogStats(),
  };
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

/** A tile already part of a committed river: its inflow(s) and outflow as direction indices (-1 = none). */
interface Claim {
  in1: number;
  in2: number;
  out: number;
  spring: boolean;
  /** Downstream of a confluence, so (probably) river width. */
  downstream: boolean;
}

type TraceOutcome = 'failed' | 'sea';

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
): { path: AxialCoord[]; outcome: TraceOutcome } {
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
    frames.push({ candidates: buildCandidates(next, path, islandLand, visited, depthAt, seed), nextIndex: 0 });
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
  /** The (single) inflow comes out of a bog creek, not out of another river tile. */
  bogIn: boolean;
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
function buildNodes(
  paths: AxialCoord[][],
  forcedOut: Map<string, number> | null = null,
  bogIn: Map<string, number> | null = null,
): Node[] {
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

  // A river handing its water to a bog creek flows out toward it; one coming out of a creek flows in from it.
  if (forcedOut) for (const [key, dir] of forcedOut) if (allTiles.has(key)) outDirection.set(key, dir);
  if (bogIn) {
    for (const [key, dir] of bogIn) {
      if (!allTiles.has(key)) continue;
      const list = inDirections.get(key);
      if (list) list.push(dir);
      else inDirections.set(key, [dir]);
    }
  }

  const result: Node[] = [];
  for (const tile of sortedByQR([...allTiles.values()])) {
    const key = coordKey(tile);
    const ins = inDirections.get(key) ?? [];
    const out = outDirection.get(key) ?? -1;
    result.push({
      coord: tile,
      shape: shapeOf(ins, out),
      ins,
      out,
      width: 'river',
      outRiver: false,
      removed: false,
      bogIn: bogIn !== null && bogIn.has(key),
    });
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
  requireRiver: Set<string> | null = null,
): RiverTile[] {
  const byCoord = new Map(nodes.map((n) => [coordKey(n.coord), n]));

  // A tile fed by a bog creek starts a river-width run: the creek is river width.
  const pending = new Map(nodes.map((n) => [coordKey(n.coord), n.ins.length - (n.bogIn ? 1 : 0)]));
  const queue: Node[] = nodes.filter((n) => n.ins.length - (n.bogIn ? 1 : 0) === 0);

  const upstream = (n: Node, dir: number): Node => byCoord.get(coordKey(step(n.coord, dir)))!;

  // The pure stream run ending at `last`, spring first.
  const chainTo = (last: Node): Node[] => {
    const chain: Node[] = [];
    let cur = last;
    for (;;) {
      chain.push(cur);
      if (cur.ins.length === 0 || cur.bogIn) break;
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
    if (v.bogIn) {
      v.width = 'river';
      v.outRiver = true;
    } else switch (v.shape) {
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
        } else if (v.out >= 0 && confluenceKind(v.ins[0]!, v.ins[1]!, v.out) === 'wide') {
          // A stream joining a river at the wide Y: the river-stream Y, no widening needed. The stream
          // inflow is stored first so the renderer can orient the tributary art by it.
          v.width = 'riverstream';
          v.outRiver = true;
          if (a.outRiver) [v.ins[0], v.ins[1]] = [v.ins[1]!, v.ins[0]!];
          if (stats) stats.riverStreamJoins++;
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

        // A river handing its water to a bog creek must be river width there: widen upstream, or drop the branch.
        if (!v.outRiver && requireRiver !== null && requireRiver.has(coordKey(v.coord))) {
          const chain = chainTo(v);
          if (!tryWiden(chain, v.coord)) remove(chain);
        }
        break;
      }
    }

    // A tile that hands its water to a bog creek has no next river tile.
    const nextNode = v.out >= 0 && !v.removed ? byCoord.get(coordKey(step(v.coord, v.out))) : undefined;
    if (nextNode) {
      const next = nextNode;
      const key = coordKey(next.coord);
      const left = pending.get(key)! - 1;
      pending.set(key, left);
      if (left === 0) queue.push(next);
    }
  }

  return nodes.filter((n) => !n.removed).map((n) => nodeToTile(n, n.width, false));
}

/** A tile already part of a committed river; mirrors `RiverGenerator.Claim`. */
function joinable(c: Claim): boolean {
  return !c.spring && c.in1 >= 0 && c.in2 < 0 && c.out >= 0;
}

function commit(drainage: Drainage, path: AxialCoord[], merged: boolean, claims: (Claim | null)[]): void {
  for (let i = 0; i < path.length; i++) {
    const tile = path[i]!;
    const inDir = i > 0 ? directionIndex(tile, path[i - 1]!) : -1;
    const outDir = i < path.length - 1 ? directionIndex(tile, path[i + 1]!) : -1;
    const idx = drainage.index.get(coordKey(tile))!;
    if (i === path.length - 1 && merged) {
      claims[idx]!.in2 = inDir;
      for (let cur = idx; cur >= 0; cur = claims[cur]!.out >= 0 ? drainage.neighbour[cur * 6 + claims[cur]!.out]! : -1) {
        claims[cur]!.downstream = true;
      }
      continue;
    }
    claims[idx] = { in1: inDir, in2: -1, out: outDir, spring: i === 0, downstream: false };
  }
}

/** A binary min-heap on (priority, item), the item index breaking ties; mirrors `RiverGenerator.Heap`. */
class Heap {
  private readonly pri: number[] = [];
  private readonly item: number[] = [];

  get count(): number {
    return this.pri.length;
  }

  private less(a: number, b: number): boolean {
    return this.pri[a]! < this.pri[b]! || (this.pri[a] === this.pri[b] && this.item[a]! < this.item[b]!);
  }

  private swap(a: number, b: number): void {
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
    [this.item[a], this.item[b]] = [this.item[b]!, this.item[a]!];
  }

  push(priority: number, item: number): void {
    this.pri.push(priority);
    this.item.push(item);
    let i = this.pri.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { priority: number; item: number } {
    const top = { priority: this.pri[0]!, item: this.item[0]! };
    const lastPri = this.pri.pop()!;
    const lastItem = this.item.pop()!;
    if (this.pri.length > 0) {
      this.pri[0] = lastPri;
      this.item[0] = lastItem;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.pri.length && this.less(l, m)) m = l;
        if (r < this.pri.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * One island's drainage field — mirrors `RiverGenerator.Drainage`: land tiles indexed in (q, r)
 * order, the cost of the rest of the way to an outlet kept per (tile, arrival direction) state,
 * outlets on bays.
 */
class Drainage {
  readonly tiles: AxialCoord[];
  readonly index = new Map<string, number>();
  readonly neighbour: Int32Array;
  readonly interior: boolean[];
  readonly outlet: boolean[];
  readonly step: number[];
  readonly dist: number[];
  outletCount = 0;

  constructor(
    islandTiles: AxialCoord[],
    terrainOf: (c: AxialCoord) => Terrain,
    isLand: (c: AxialCoord) => boolean,
    seed: number,
    blocked: HexSet | null = null,
  ) {
    this.tiles = sortedByQR(islandTiles);
    const n = this.tiles.length;
    for (let i = 0; i < n; i++) this.index.set(coordKey(this.tiles[i]!), i);

    this.neighbour = new Int32Array(n * 6);
    this.interior = new Array<boolean>(n).fill(false);
    this.outlet = new Array<boolean>(n).fill(false);
    this.step = new Array<number>(n).fill(0);
    this.dist = new Array<number>(n * 6).fill(Infinity);
    const coastal = new Array<boolean>(n).fill(false);
    const isBlocked = new Array<boolean>(n).fill(false);
    if (blocked) for (let i = 0; i < n; i++) isBlocked[i] = blocked.has(this.tiles[i]!);
    for (let i = 0; i < n; i++) {
      const tile = this.tiles[i]!;
      const ns = neighbors(tile);
      for (let d = 0; d < 6; d++) {
        // Water never flows into a blocked tile (a bog): it is as good as not being there.
        const idx = this.index.get(coordKey(ns[d]!));
        this.neighbour[i * 6 + d] = idx !== undefined && !isBlocked[idx]! ? idx : -1;
      }
      // Neighbours that are island tiles are land without asking the (costly) sampler.
      coastal[i] = false;
      for (let d = 0; d < 6 && !coastal[i]; d++) coastal[i] = !this.index.has(coordKey(ns[d]!)) && !isLand(ns[d]!);
      if (isBlocked[i]) coastal[i] = false;
      this.interior[i] = !coastal[i] && !isBlocked[i];
      this.step[i] =
        1.0 +
        DRAINAGE_NOISE * hash2(tile.q, tile.r, seed + 53) +
        VALLEY_NOISE * valueNoise(tile.q, tile.r, seed + 61, VALLEY_SCALE) +
        (terrainOf(tile) === 'mountain' ? MOUNTAIN_COST : 0.0);
    }

    const outlets = this.pickOutlets(coastal, seed);
    this.outletCount = outlets.length;
    const heap = new Heap();
    for (const o of outlets) {
      this.outlet[o] = true;
      for (let j = 0; j < 6; j++) {
        this.dist[o * 6 + j] = 0.0;
        heap.push(0.0, o * 6 + j);
      }
    }

    while (heap.count > 0) {
      const { priority: d, item: s } = heap.pop();
      if (d > this.dist[s]!) continue;
      const node = Math.floor(s / 6);
      const j = s % 6;
      const t = this.neighbour[node * 6 + j]!;
      if (t < 0 || !this.interior[t]) continue;
      const outDir = (j + 3) % 6;
      for (let i = 0; i < 6; i++) {
        if (i === outDir) continue;
        const nd = d + this.step[node]! + this.turnCost(i, outDir);
        const ts = t * 6 + i;
        if (nd < this.dist[ts]!) {
          this.dist[ts] = nd;
          heap.push(nd, ts);
        }
      }
    }
  }

  /** The cost of turning from arrival direction `inDir` to leave by `outDir`; negative for a 180 degree hairpin. */
  turnCost(inDir: number, outDir: number): number {
    if (inDir < 0) return 0.0;
    if (inDir === outDir) return -1.0;
    const opposite = (inDir + 3) % 6;
    const turn = Math.min((outDir - opposite + 6) % 6, (opposite - outDir + 6) % 6);
    return turn === 0 ? 0.0 : turn === 1 ? BEND_COST : SHARP_BEND_COST;
  }

  /** The cheapest way on from a tile entered from `inDir` (-1 for a spring); `out` is -1 when nothing leads on. */
  bestOut(tile: number, inDir: number, excluded: ((i: number) => boolean) | null): { out: number; cost: number } {
    let best = -1;
    let bestCost = Infinity;
    for (let o = 0; o < 6; o++) {
      const n = this.neighbour[tile * 6 + o]!;
      if (n < 0 || (inDir >= 0 && o === inDir)) continue;
      const d = this.dist[n * 6 + ((o + 3) % 6)]!;
      if (d === Infinity || (excluded !== null && excluded(n))) continue;
      const cost = d + this.step[n]! + this.turnCost(inDir, o);
      if (cost < bestCost) {
        bestCost = cost;
        best = o;
      }
    }
    return { out: best, cost: bestCost };
  }

  private pickOutlets(coastal: boolean[], seed: number): number[] {
    const candidates: number[] = [];
    const score: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      if (!coastal[i]) continue;
      let receives = false;
      for (let d = 0; d < 6 && !receives; d++) {
        const n = this.neighbour[i * 6 + d]!;
        receives = n >= 0 && this.interior[n]!;
      }
      if (!receives) continue;

      const tile = this.tiles[i]!;
      let nearby = 0;
      for (let dq = -3; dq <= 3; dq++) {
        for (let dr = Math.max(-3, -dq - 3); dr <= Math.min(3, -dq + 3); dr++) {
          if (this.index.has(coordKey({ q: tile.q + dq, r: tile.r + dr }))) nearby++;
        }
      }
      candidates.push(i);
      score.push(nearby + hash2(tile.q, tile.r, seed + 59));
    }

    const outlets: number[] = [];
    if (candidates.length === 0) return outlets;

    const k = Math.min(MAX_OUTLETS, Math.max(1, Math.floor(this.tiles.length / OUTLET_TILES_PER + 0.5)));
    let first = 0;
    for (let i = 1; i < candidates.length; i++) if (score[i]! > score[first]!) first = i;

    outlets.push(candidates[first]!);
    const minDistance = candidates.map((c) => hexDistance(this.tiles[c]!, this.tiles[candidates[first]!]!));
    while (outlets.length < k) {
      let best = 0;
      for (let i = 1; i < candidates.length; i++) {
        if (
          minDistance[i]! > minDistance[best]! ||
          (minDistance[i] === minDistance[best] && score[i]! > score[best]!)
        ) {
          best = i;
        }
      }
      if (minDistance[best]! < MIN_OUTLET_SPACING || minDistance[best] === 0) break;
      outlets.push(candidates[best]!);
      for (let i = 0; i < candidates.length; i++) {
        minDistance[i] = Math.min(minDistance[i]!, hexDistance(this.tiles[candidates[i]!]!, this.tiles[candidates[best]!]!));
      }
    }
    return outlets;
  }
}

/**
 * Follows the drainage pointers from a spring to its outlet, after first looking for a nearby
 * trunk to join — mirrors `RiverGenerator.TraceDrainage`. Returns null when the walk is dropped.
 */
function traceDrainage(
  drainage: Drainage,
  spring: AxialCoord,
  claims: (Claim | null)[],
  onPath: boolean[],
  anyClaims: boolean,
  startIn = -1,
): { path: AxialCoord[]; merged: boolean } | null {
  const path: AxialCoord[] = [spring];
  const tiles: number[] = [];
  let current = drainage.index.get(coordKey(spring))!;
  tiles.push(current);
  onPath[current] = true;
  try {
    let inDir = startIn;
    let guard = drainage.tiles.length * 2;
    const taken = (i: number): boolean => claims[i] !== null || onPath[i]!;
    const step = (to: number, dir: number): void => {
      path.push(drainage.tiles[to]!);
      tiles.push(to);
      onPath[to] = true;
      current = to;
      inDir = (dir + 3) % 6;
    };

    if (anyClaims) {
      // Join a nearby trunk at a drawable Y unless that is much longer than running on alone.
      const route = searchJunction(drainage, path, claims, onPath, drainage.bestOut(current, inDir, null).cost + MERGE_SLACK, MERGE_REACH, RIVER_STREAM_BONUS);
      if (route) {
        path.push(...route);
        return { path, merged: true };
      }
    }

    while (guard-- > 0) {
      if (drainage.outlet[current]) return { path, merged: false };

      const { out: outDir, cost: naturalCost } = drainage.bestOut(current, inDir, null);
      if (outDir < 0) return null;

      const next = drainage.neighbour[current * 6 + outDir]!;
      if (!taken(next)) {
        if (!anyClaims || crowding(drainage, claims, next) === 0.0) {
          step(next, outDir);
          continue;
        }

        // About to run alongside an earlier river: join it if a drawable Y is near.
        const beside = searchJunction(drainage, path, claims, onPath, naturalCost + MERGE_SLACK, MERGE_REACH, RIVER_STREAM_BONUS);
        if (beside) {
          path.push(...beside);
          return { path, merged: true };
        }

        step(next, outDir);
        continue;
      }

      const claim = claims[next];
      if (claim && joinable(claim) && confluenceKind(claim.in1, (outDir + 3) % 6, claim.out) !== null) {
        path.push(drainage.tiles[next]!);
        return { path, merged: true };
      }

      if (anyClaims) {
        const route = searchJunction(drainage, path, claims, onPath, naturalCost + MERGE_SLACK, MERGE_REACH, RIVER_STREAM_BONUS);
        if (route) {
          path.push(...route);
          return { path, merged: true };
        }
      }

      // No drawable junction: run on alone to the nearest free coast (a new mouth).
      const alone = searchJunction(drainage, path, claims, onPath, Infinity, MERGE_REACH * 3.0, 0.0, true);
      if (alone) {
        path.push(...alone);
        return { path, merged: false };
      }

      return null;
    }
    return null;
  } finally {
    for (const t of tiles) onPath[t] = false;
  }
}

/**
 * The cheapest way for the walk (at its last tile) to join an earlier river at a Y the art can
 * draw — mirrors `RiverGenerator.SearchJunction`. Returns the tiles to append (ending on the
 * trunk tile), or null.
 */
function searchJunction(
  drainage: Drainage,
  path: AxialCoord[],
  claims: (Claim | null)[],
  onPath: boolean[],
  limit: number,
  reach: number,
  riverStreamBonus: number,
  toMouth = false,
): AxialCoord[] | null {
  const last = path[path.length - 1]!;
  const start = drainage.index.get(coordKey(last))!;
  const startIn = path.length > 1 ? directionIndex(last, path[path.length - 2]!) : -1;
  const startKey = start * 6 + Math.max(startIn, 0);
  const cost = new Map<number, number>([[startKey, 0.0]]);
  const parent = new Map<number, number>([[startKey, -1]]);
  const heap = new Heap();
  heap.push(0.0, startKey);

  let found = false;
  let bestTotal = limit;
  let bestState = -1;
  let bestJunction = -1;
  while (heap.count > 0) {
    const { priority: d, item: state } = heap.pop();
    if (d > cost.get(state)! || d > bestTotal || d > reach) continue;

    const tile = Math.floor(state / 6);
    const inDir = state === startKey ? startIn : state % 6;
    for (let dir = 0; dir < 6; dir++) {
      const turn = drainage.turnCost(inDir, dir);
      const n = drainage.neighbour[tile * 6 + dir]!;
      if (turn < 0 || n < 0) continue;

      const claim = claims[n];
      if (toMouth) {
        // Alone to the sea: any free coastal tile is a new mouth.
        if (claim || onPath[n]) continue;
        if (!drainage.interior[n]) {
          const total = d + turn + drainage.step[n]! + crowding(drainage, claims, n);
          if (!found || total < bestTotal) {
            found = true;
            bestTotal = total;
            bestState = state;
            bestJunction = n;
          }
          continue;
        }
      } else if (claim) {
        if (!joinable(claim) || confluenceKind(claim.in1, (dir + 3) % 6, claim.out) === null) continue;

        const total = d + turn + drainage.step[n]! + drainage.dist[n * 6 + claim.in1]!;

        // A stream reaching a river trunk prefers the wide Y: the river-stream Y needs no widening first.
        const preferred =
          claim.downstream && confluenceKind(claim.in1, (dir + 3) % 6, claim.out) === 'wide' ? total - riverStreamBonus : total;
        if (total <= limit && (!found || preferred < bestTotal)) {
          found = true;
          bestTotal = preferred;
          bestState = state;
          bestJunction = n;
        }
        continue;
      }

      if (!drainage.interior[n] || onPath[n] || claim) continue;

      const key = n * 6 + ((dir + 3) % 6);
      const nd = d + turn + drainage.step[n]! + (toMouth ? crowding(drainage, claims, n) : 0.0);
      const known = cost.get(key);
      if (nd <= reach && (known === undefined || nd < known)) {
        cost.set(key, nd);
        parent.set(key, state);
        heap.push(nd, key);
      }
    }
  }

  if (!found) return null;

  const route: AxialCoord[] = [drainage.tiles[bestJunction]!];
  for (let cur = bestState; cur >= 0 && cur !== startKey; cur = parent.get(cur)!) route.unshift(drainage.tiles[Math.floor(cur / 6)]!);

  // A shortest route in state space can, rarely, cross its own tile in another state.
  return new Set(route.map((c) => coordKey(c))).size === route.length ? route : null;
}

/** Extra cost per neighbour that is an earlier river, for a walk running on alone — mirrors `RiverGenerator.CrowdingCost`. */
const CROWDING_COST = 2.0;

/** Extra cost of a tile beside an earlier river on a walk that is not joining it — mirrors `RiverGenerator.Crowding`. */
function crowding(drainage: Drainage, claims: (Claim | null)[], tile: number): number {
  let total = 0.0;
  for (let d = 0; d < 6; d++) {
    const n = drainage.neighbour[tile * 6 + d]!;
    if (n >= 0 && claims[n] !== null) total += CROWDING_COST;
  }
  return total;
}

/** Spring candidates — mirrors `RiverGenerator.SpringCandidates`. */
function springCandidates(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  islandLand: Set<string>,
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
  return strict.length > 0 ? strict : loose;
}

/** Springs by farthest-point sampling over the candidates the drainage can carry to an outlet — mirrors `RiverGenerator.PickSprings`. */
function pickSprings(
  allCandidates: AxialCoord[],
  islandTileCount: number,
  depthAt: (c: AxialCoord) => number | null,
  drainage: Drainage,
  seed: number,
): AxialCoord[] {
  const candidates = sortedByQR(
    allCandidates.filter((c) => drainage.bestOut(drainage.index.get(coordKey(c))!, -1, null).out >= 0),
  );
  const springs: AxialCoord[] = [];
  if (candidates.length === 0) return springs;

  const hash = candidates.map((c) => hash2(c.q, c.r, seed + 41));
  const k = Math.min(MAX_SPRINGS_PER_ISLAND, Math.max(1, Math.floor(islandTileCount / RIVER_TILES_PER_SPRING + 0.5)));

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
 * `terrainOf` only needs to answer for hexes in `islandTiles`; `depthAt` and `globalIsLand`
 * mirror the backend's `sampler.IslandDepthAt`/`WastedDepthAt` and `sampler.IsLand` — callers pick
 * the green or wasted pair the same way `WorldGenerator.Generate` does. `globalIsLand` is only
 * consulted when `wasted` is false.
 *
 * Green islands get a drainage network: outlets on bays, a noisy shortest-path field over
 * (tile, arrival direction) states, springs that follow its pointers (paths that meet share the
 * rest of their route), junctions only where the art can draw the Y, then widths (stream, one
 * widening, river). Lava (wasted) rivers keep the older independent-walk rule
 * (`allowConfluence: false`, one spring per cluster, river width).
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
  return generateRiversWithBogs(islandTiles, terrainOf, depthAt, globalIsLand, worldSeed, islandIndex, wasted, allowConfluence, stats).rivers;
}

/** A green island's rivers together with the bogland placed among them — mirrors `RiverGenerator.Result`. */
export interface RiversAndBogs {
  rivers: RiverTile[];
  bogs: BogTile[];
}

/**
 * Like `generateRivers`, and also returns the island's bogland (`BogGenerator`): lakes with a river re-routed through them,
 * creeks, moss, sinks, spawns and enclosed sea pockets turned into lakes. Bogs exist only on green islands.
 */
export function generateRiversWithBogs(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  depthAt: (c: AxialCoord) => number | null,
  globalIsLand: (c: AxialCoord) => boolean,
  worldSeed: number,
  islandIndex: number,
  wasted = false,
  allowConfluence = true,
  stats?: RiverStats,
): RiversAndBogs {
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
      const { path, outcome } = tracePath(spring, islandLand, depthAt, isLand, seed);
      if (outcome === 'sea' && path.length >= MIN_RIVER_LENGTH) paths.push(path);
    }

    const survivors = resolveCollisions(paths, allowConfluence);
    return { rivers: buildNodes(survivors).map((n) => nodeToTile(n, 'river', wasted)), bogs: [] };
  }

  // Enclosed sea pockets become bog lakes with a bog ring before any river is traced: the drainage
  // network treats the lake as land it cannot enter and the ring as blocked.
  const bogs = new BogGenerator(islandTiles, terrainOf, isLand, seed, stats);
  bogs.findPockets();
  const pocketWater = bogs.pocketWater;
  const riverLand = pocketWater.size === 0 ? isLand : (c: AxialCoord) => isLand(c) || pocketWater.has(c);

  const candidates = springCandidates(islandTiles, terrainOf, islandLand);

  // An island without mountains has no river to run through a bog, but the bog guarantee may still spawn one.
  const guaranteeOnly = candidates.length === 0;
  if (guaranteeOnly && !bogs.guaranteeApplies) {
    bogs.fillHoles(null);
    return { rivers: [], bogs: bogs.classify() };
  }

  const drainage = new Drainage(islandTiles, terrainOf, riverLand, seed, bogs.pocketRing);
  if (stats && !guaranteeOnly) stats.outlets += drainage.outletCount;

  const springs = guaranteeOnly ? [] : pickSprings(candidates, islandTiles.length, depthAt, drainage, seed);
  const order = springs
    .map((spring) => ({ spring, cost: drainage.bestOut(drainage.index.get(coordKey(spring))!, -1, null).cost }))
    .sort((a, b) => b.cost - a.cost || a.spring.q - b.spring.q || a.spring.r - b.spring.r)
    .map((x) => x.spring);

  const claims: (Claim | null)[] = new Array<Claim | null>(drainage.tiles.length).fill(null);
  const onPath = new Array<boolean>(drainage.tiles.length).fill(false);
  const paths: AxialCoord[][] = [];
  const mergedFlags: boolean[] = [];
  for (const spring of order) {
    if (claims[drainage.index.get(coordKey(spring))!] !== null) continue;

    const traced = traceDrainage(drainage, spring, claims, onPath, paths.length > 0);
    if (!traced) {
      if (stats) stats.droppedRivers++;
      continue;
    }
    if (traced.path.length < MIN_RIVER_LENGTH) continue;

    commit(drainage, traced.path, traced.merged, claims);
    paths.push(traced.path);
    mergedFlags.push(traced.merged);
    if (stats) {
      stats.rivers++;
      if (traced.merged) stats.merges++;
    }
  }
  if (stats) stats.springs += springs.length;

  // Bog sites: through-river lakes (the river is re-routed through them), sinks and spawns.
  const bp = new BogPaths(paths, mergedFlags);
  const widthTrial = (trial: BogPaths) =>
    assignWidths(buildNodes(trial.paths, trial.forcedOut, trial.bogIn), riverLand, seed, undefined, trial.requireRiver);
  const traceRiver = (exit: AxialCoord, startIn: number, current: BogPaths, blocked: HexSet): AxialCoord[] | null => {
    const d2 = new Drainage(islandTiles, terrainOf, riverLand, seed, blocked);
    const claims2: (Claim | null)[] = new Array<Claim | null>(d2.tiles.length).fill(null);
    for (let k = 0; k < current.paths.length; k++) commit(d2, current.paths[k]!, current.merged[k]!, claims2);

    const onPath2 = new Array<boolean>(d2.tiles.length).fill(false);
    const traced = traceDrainage(d2, exit, claims2, onPath2, current.paths.length > 0, startIn);
    return traced ? traced.path : null;
  };
  if (guaranteeOnly) bogs.placeGuaranteeOnly(bp, widthTrial, traceRiver);
  else bogs.placeSites(bp, widthTrial, traceRiver);

  const nodes = buildNodes(bp.paths, bp.forcedOut, bp.bogIn);
  return { rivers: assignWidths(nodes, riverLand, seed, stats, bp.requireRiver), bogs: bogs.classify() };
}
