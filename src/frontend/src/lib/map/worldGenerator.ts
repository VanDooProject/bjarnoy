// Deterministic, dependency-free procedural terrain: a scattered archipelago
// of distinct islands (matching the docs/design/zip-brainstorms.md world-map
// mockup) rather than one continuous landmass. Tiles are generated on demand
// from (q, r) and a seed, so nothing needs to be precomputed or stored for
// the whole map — memory is bounded by hexes actually visited.
import { axialToOddQ, hexDistance, oddQToAxial, neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS } from './types';
import type { IslandLabel, Terrain, Tile, TileOrientation } from './types';

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise sampled on a lattice of the given cell size. */
function valueNoise(x: number, y: number, seed: number, cell: number): number {
  const x0 = Math.floor(x / cell);
  const y0 = Math.floor(y / cell);
  const tx = smooth(x / cell - x0);
  const ty = smooth(y / cell - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/**
 * The generation constants a world was created with — mirrors the backend's
 * `WorldGenerationOptions`/`WorldGenerationResponse` (issue #159 part B).
 * Persisted per world and sent once with `WorldResponse`, since an admin
 * reseed (`POST /api/v1/admin/worlds/{id}/preview-seed`) can change these
 * away from the defaults below, and the client has to mirror the exact
 * terrain the server paths over, not just its own hardcoded guess at it.
 */
export interface WorldGenerationConstants {
  islandCellSize: number;
  islandChance: number;
  islandMinRadius: number;
  islandMaxRadius: number;
  islandMinLobes: number;
  islandMaxLobes: number;
  islandMaxElongation: number;
  islandBendiness: number;
  islandLobeBlend: number;
  islandLobeMinScale: number;
  islandLobeMaxScale: number;
  islandCoastWarp: number;
  islandCoastWarpScale: number;
  beachThreshold: number;
  mountainThreshold: number;
  mountainRockiness: number;
  forestRockiness: number;
}

/** `WorldGenerationOptions`'s own C# defaults — demo mode's world (no backend to ask). */
export const DEFAULT_GENERATION: WorldGenerationConstants = {
  islandCellSize: 36,
  islandChance: 0.45,
  islandMinRadius: 5.0,
  islandMaxRadius: 11.5,
  islandMinLobes: 3,
  islandMaxLobes: 6,
  islandMaxElongation: 2.0,
  islandBendiness: 2.8,
  islandLobeBlend: 0.12,
  islandLobeMinScale: 0.32,
  islandLobeMaxScale: 0.98,
  islandCoastWarp: 2.8,
  islandCoastWarpScale: 4.5,
  beachThreshold: 0.82,
  mountainThreshold: 0.4,
  mountainRockiness: 0.72,
  forestRockiness: 0.52,
};

export interface WorldSeed {
  seed: number;
  generation: WorldGenerationConstants;
}

/** Polynomial smooth minimum: a hard `Math.min` at k = 0. */
function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * The shortest depth a single island cell's shape gives the (possibly
 * domain-warped) sample point `(px, py)`: a chain of 1-5 lobes (offset
 * discs) walked out from the jittered centre along a spine that bends by a
 * per-island amount, smooth-blended where lobes meet — mirrors the
 * backend's `TerrainSampler.IslandCellDepth` exactly (down to using no
 * trigonometry, so both sides rotate the spine direction identically).
 * With `islandMinLobes`/`islandMaxLobes` both 1 this reduces to exactly the
 * single-disc circle the original algorithm produced.
 */
function islandCellDepth(
  cellCol: number,
  cellRow: number,
  seed: number,
  centerCol: number,
  centerRow: number,
  radius: number,
  px: number,
  py: number,
  gen: WorldGenerationConstants,
): number {
  const dx0 = px - centerCol;
  const dy0 = py - centerRow;
  let best = Math.sqrt(dx0 * dx0 + dy0 * dy0) / radius;

  const minLobes = gen.islandMinLobes;
  const maxLobes = gen.islandMaxLobes;
  const lobeCount =
    minLobes + Math.floor(hash2(cellCol, cellRow, seed + 19) * (maxLobes - minLobes + 1));

  if (lobeCount <= 1) return best;

  const ax = hash2(cellCol, cellRow, seed + 23) - 0.5;
  const ay = hash2(cellCol, cellRow, seed + 47) - 0.5;
  const len = Math.sqrt(ax * ax + ay * ay);
  let ux: number;
  let uy: number;
  if (len < 1e-9) {
    ux = 1;
    uy = 0;
  } else {
    ux = ax / len;
    uy = ay / len;
  }

  const curl = (hash2(cellCol, cellRow, seed + 59) - 0.5) * 2;
  const turn = curl * gen.islandBendiness;
  const elongFraction = hash2(cellCol, cellRow, seed + 61);
  const spineLength = radius * gen.islandMaxElongation * elongFraction;
  const step = spineLength / (lobeCount - 1);

  let lx = centerCol;
  let ly = centerRow;
  const blend = gen.islandLobeBlend;

  for (let lobe = 1; lobe < lobeCount; lobe++) {
    lx += ux * step;
    ly += uy * step;

    const lobeScale =
      gen.islandLobeMinScale +
      hash2(cellCol, cellRow, seed + 200 + lobe) * (gen.islandLobeMaxScale - gen.islandLobeMinScale);
    const lobeRadius = radius * lobeScale;

    const ddx = px - lx;
    const ddy = py - ly;
    const lobeDepth = Math.sqrt(ddx * ddx + ddy * ddy) / lobeRadius;

    best = smoothMin(best, lobeDepth, blend);

    // Rotate (ux, uy) by turn radians' worth of curl for the next segment,
    // without trigonometry: u + turn * perp(u), renormalised.
    const tx = ux - turn * uy;
    const ty = uy + turn * ux;
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl > 1e-9) {
      ux = tx / tl;
      uy = ty / tl;
    }
  }

  return best;
}

// Islands are seeded on a coarse grid of cells (in odd-q offset space, which
// is roughly square so islands read as evenly, not axially, spread out).
// Each cell independently rolls whether it holds an island, where its
// (jittered) centre sits, and how big it is — all as O(1) hashes of the
// cell's own coordinates, so a hex's terrain never depends on generating
// its neighbours.
function closestIsland(col: number, row: number, seed: number, gen: WorldGenerationConstants): { t: number } | null {
  // A cheap domain warp applied once per hex, before distance is measured
  // against any island's lobes, so coastlines wobble instead of tracing
  // perfect arcs. Zero when islandCoastWarp is 0, which keeps this
  // identical to the un-warped sample point.
  let px = col;
  let py = row;
  if (gen.islandCoastWarp > 0) {
    const warpScale = gen.islandCoastWarpScale;
    px += (valueNoise(col, row, seed + 53, warpScale) - 0.5) * 2 * gen.islandCoastWarp;
    py += (valueNoise(col, row, seed + 71, warpScale) - 0.5) * 2 * gen.islandCoastWarp;
  }

  let best: { t: number } | null = null;
  for (let dcx = -1; dcx <= 1; dcx++) {
    for (let dcy = -1; dcy <= 1; dcy++) {
      const cellCol = Math.floor(col / gen.islandCellSize) + dcx;
      const cellRow = Math.floor(row / gen.islandCellSize) + dcy;
      if (hash2(cellCol, cellRow, seed) > gen.islandChance) continue;
      const jitter = gen.islandCellSize * 0.55;
      const centerCol =
        cellCol * gen.islandCellSize + gen.islandCellSize / 2 + (hash2(cellCol, cellRow, seed + 11) - 0.5) * jitter;
      const centerRow =
        cellRow * gen.islandCellSize + gen.islandCellSize / 2 + (hash2(cellCol, cellRow, seed + 13) - 0.5) * jitter;
      const radius =
        gen.islandMinRadius + hash2(cellCol, cellRow, seed + 17) * (gen.islandMaxRadius - gen.islandMinRadius);
      const t = islandCellDepth(cellCol, cellRow, seed, centerCol, centerRow, radius, px, py, gen);
      if (t <= 1 && (!best || t < best.t)) best = { t };
    }
  }
  return best;
}

// Deterministic Norse-flavoured island names, mirroring the backend's
// `Bjarnoy.Domain.World.IslandNames` (the stem/ending lists are copy-kept in
// sync by eye, not shared code — demo mode has no access to backend code and
// only ever needs *a* name, not the exact same one a live world would pick).
const NAME_STEMS = [
  'Bjorn', 'Fjord', 'Grim', 'Hav', 'Isa', 'Jarl', 'Kettil', 'Lyng',
  'Mork', 'Nord', 'Orm', 'Rav', 'Sig', 'Thor', 'Ulf', 'Vald',
  'Ymir', 'Aske', 'Brand', 'Dyr', 'Eik', 'Frost', 'Gard', 'Hjalm',
];
const NAME_ENDINGS = [
  'ey', 'holm', 'vik', 'nes', 'fjell', 'sund', 'strand', 'berg',
  'havn', 'skar', 'oy', 'dal',
];

function islandNameFor(cellCol: number, cellRow: number, seed: number): string {
  const stem = NAME_STEMS[Math.floor(hash2(cellCol, cellRow, seed + 101) * NAME_STEMS.length) % NAME_STEMS.length];
  const ending =
    NAME_ENDINGS[Math.floor(hash2(cellCol, cellRow, seed + 103) * NAME_ENDINGS.length) % NAME_ENDINGS.length];
  return stem + ending;
}

/**
 * Enumerates the islands the demo generator places within `radius` hexes of
 * the origin, with a dummy Norse-flavoured name for each — demo mode has no
 * backend `GET /worlds/{id}/islands` to ask (unlike a live world's own init
 * in `stores/world.ts`, which calls that and feeds the response straight
 * into `WorldModel.setIslands`), so without this the world map's island-name
 * labels (`HexMapRenderer`'s `worldModel.listIslands()` loop) simply have
 * nothing to draw in demo mode. Replays `closestIsland`'s own per-cell roll
 * to find each island's jittered centre rather than inventing a second
 * scheme, so a demo island's label always sits over the same island
 * `terrainAt`/`isLand` actually generate there.
 */
export function enumerateIslands(world: WorldSeed, radius: number): IslandLabel[] {
  const gen = world.generation;
  const cellSpan = Math.ceil(radius / gen.islandCellSize) + 1;
  const islands: IslandLabel[] = [];
  for (let cellCol = -cellSpan; cellCol <= cellSpan; cellCol++) {
    for (let cellRow = -cellSpan; cellRow <= cellSpan; cellRow++) {
      if (hash2(cellCol, cellRow, world.seed) > gen.islandChance) continue;
      const jitter = gen.islandCellSize * 0.55;
      const centerCol =
        cellCol * gen.islandCellSize +
        gen.islandCellSize / 2 +
        (hash2(cellCol, cellRow, world.seed + 11) - 0.5) * jitter;
      const centerRow =
        cellRow * gen.islandCellSize +
        gen.islandCellSize / 2 +
        (hash2(cellCol, cellRow, world.seed + 13) - 0.5) * jitter;
      const center = oddQToAxial({ col: Math.round(centerCol), row: Math.round(centerRow) });
      if (hexDistance({ q: 0, r: 0 }, center) > radius) continue;
      islands.push({
        id: `demo-${cellCol}-${cellRow}`,
        name: islandNameFor(cellCol, cellRow, world.seed),
        q: center.q,
        r: center.r,
      });
    }
  }
  return islands;
}

export function terrainAt(q: number, r: number, world: WorldSeed): Terrain {
  const { col, row } = axialToOddQ({ q, r });
  const island = closestIsland(col, row, world.seed, world.generation);
  if (!island) return 'sea';
  if (island.t > world.generation.beachThreshold) return 'sand';
  const rockiness = valueNoise(q, r, world.seed + 2, 2.5);
  if (island.t < world.generation.mountainThreshold && rockiness > world.generation.mountainRockiness) {
    return 'mountain';
  }
  return rockiness > world.generation.forestRockiness ? 'forest' : 'grass';
}

function isLand(q: number, r: number, world: WorldSeed): boolean {
  return terrainAt(q, r, world) !== 'sea';
}

/** Sea that borders land — the ring a coastal-water sprite belongs on. */
export function isCoastalWater(q: number, r: number, world: WorldSeed): boolean {
  if (terrainAt(q, r, world) !== 'sea') return false;
  return neighbors({ q, r }).some((n) => isLand(n.q, n.r, world));
}

/**
 * The direction a coastal-water hex's land neighbours sit in: each land
 * neighbour contributes a unit vector at its direction's angle (60° apart,
 * matching `neighbors()`'s direction order), and the summed vector is
 * snapped to the nearest of the six `TileOrientation`s.
 */
function coastalOrientation(q: number, r: number, world: WorldSeed): TileOrientation {
  const ns = neighbors({ q, r });
  let sumX = 0;
  let sumY = 0;
  let firstLandIndex = -1;

  ns.forEach((n, i) => {
    if (!isLand(n.q, n.r, world)) return;
    if (firstLandIndex < 0) firstLandIndex = i;
    const angle = i * (Math.PI / 3);
    sumX += Math.cos(angle);
    sumY += Math.sin(angle);
  });

  // Opposite land neighbours (e.g. a one-hex-wide strait) can cancel the
  // vector to (near) zero — a small epsilon rather than an exact `=== 0`
  // check, because two land neighbours 180 degrees apart don't reliably sum
  // their sin/cos terms to bit-exact zero (this is where the .NET and JS
  // Math libraries' cos/sin/atan2 diverge at the ULP level, and atan2 near
  // the origin is extremely sensitive to that — the backend mirror uses the
  // same epsilon so both land on the same orientation for these hexes).
  // Falling back to the first land direction found keeps the pick
  // deterministic instead of an arbitrary default.
  const ZERO_EPSILON = 1e-9;
  if (Math.abs(sumX) < ZERO_EPSILON && Math.abs(sumY) < ZERO_EPSILON) return TILE_ORIENTATIONS[firstLandIndex];

  let angle = Math.atan2(sumY, sumX);
  if (angle < 0) angle += 2 * Math.PI;
  const index = Math.round(angle / (Math.PI / 3)) % 6;
  return TILE_ORIENTATIONS[index];
}

/** Seed-stable cosmetic rotation for tiles that don't face anything in particular. */
function defaultOrientation(q: number, r: number, world: WorldSeed): TileOrientation {
  const h = hash2(q, r, world.seed + 29);
  const index = Math.min(5, Math.floor(h * 6));
  return TILE_ORIENTATIONS[index];
}

/**
 * Which of the six art-pack rotations a hex renders with. Coastal water
 * faces the land it borders; everything else gets a cosmetic, seed-stable
 * rotation so the map doesn't read as one repeated tile stamped everywhere.
 */
export function orientationAt(q: number, r: number, world: WorldSeed): TileOrientation {
  return isCoastalWater(q, r, world) ? coastalOrientation(q, r, world) : defaultOrientation(q, r, world);
}

/**
 * Per-terrain variant count the tile art pack actually has, everything else
 * falling back to 1. Grass has a plain top image plus `variant000`-
 * `variant002` (4); forest has a plain image plus `variant000`-`variant001`
 * (3); mountain has four distinct shapes — cone, table, saddleback, corrie
 * (mirrors the backend's `MountainShape`) — each its own composited (not
 * base/top split) render, so this index doubles as that shape's own numeric
 * value.
 */
const VARIANT_COUNTS: Partial<Record<Terrain, number>> = {
  grass: 4,
  forest: 3,
  mountain: 4,
};

/**
 * Coastal water (`coastalwatertile_*`) has its own plain image plus
 * `variant000`-`variant001` (3) — a different art family from open
 * `watertile_*` sea, which has no variants at all, so this can't live in
 * `VARIANT_COUNTS` (keyed by `Terrain`, not by coastal-ness). Unlike the
 * other variant families, its picks aren't uniform: the plain (no-suffix)
 * image should dominate the coastline, with the two numbered variants only
 * an occasional accent, so each entry here is a weight rather than an
 * equal-odds slot — see `weightedIndex`.
 */
const COASTAL_WATER_VARIANT_WEIGHTS = [0.8, 0.1, 0.1];

/** Picks an index from `weights` (assumed to sum to ~1) using a `[0, 1)` roll `h`. */
function weightedIndex(h: number, weights: number[]): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (h < acc) return i;
  }
  return weights.length - 1;
}

/**
 * Seed-stable variant index for a hex, in `[0, N)` where `N` is however many
 * variants the art pack has for that terrain (1 — i.e. always variant 0 —
 * for anything not listed). Capping the range this way *is* the fallback: a
 * terrain with fewer variants than the pack's richest one never gets asked
 * for a variant it doesn't have.
 */
export function variantAt(q: number, r: number, world: WorldSeed): number {
  const h = hash2(q, r, world.seed + 31);
  if (isCoastalWater(q, r, world)) return weightedIndex(h, COASTAL_WATER_VARIANT_WEIGHTS);
  const count = VARIANT_COUNTS[terrainAt(q, r, world)] ?? 1;
  if (count <= 1) return 0;
  const index = Math.floor(h * count);
  return index >= count ? count - 1 : index;
}

/**
 * Which spring-capable mountain shape (saddleback=2 or corrie=3, see
 * `VARIANT_COUNTS`'s doc comment) a hex should render as once it's known to
 * carry a river's `spring` tile — mirrors the backend's
 * `TerrainSampler.SpringMountainShapeAt` exactly (same seed offset, same
 * threshold), since only those two mountain shapes shipped a `_spring` art
 * cut. Pure and independent of whether the hex actually ends up being a
 * spring; the caller (river rendering) is what knows that.
 */
export function springMountainShapeAt(q: number, r: number, world: WorldSeed): number {
  const h = hash2(q, r, world.seed + 37);
  return h < 0.5 ? 2 : 3;
}

export function generateTile(q: number, r: number, world: WorldSeed): Tile {
  return {
    q,
    r,
    terrain: terrainAt(q, r, world),
    isCoastalWater: isCoastalWater(q, r, world),
    orientation: orientationAt(q, r, world),
    variant: variantAt(q, r, world),
  };
}
