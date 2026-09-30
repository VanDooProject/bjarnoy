// Deterministic, dependency-free procedural terrain: a scattered archipelago
// of distinct islands (matching the docs/design/zip-brainstorms.md world-map
// mockup) rather than one continuous landmass. Tiles are generated on demand
// from (q, r) and a seed, so nothing needs to be precomputed or stored for
// the whole map — memory is bounded by hexes actually visited.
import { axialToOddQ, hexDistance, hexRing, oddQToAxial, neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS } from './types';
import type { IslandLabel, RiverTileShape, Terrain, Tile, TileOrientation } from './types';

/**
 * Deterministic 2D hash in `[0, 1)` — the ECMAScript-integer-coercion-exact
 * function `Bjarnoy.Domain.World.ValueNoise.Hash2` (backend) is a bit-exact
 * port of. Exported so `giantPlacement.ts` can roll the same
 * shrine-chance/tie-break hashes the backend's `GiantGenerator` does,
 * without duplicating the arithmetic.
 */
export function hash2(x: number, y: number, seed: number): number {
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
  /**
   * The world's radius in hexes. Part of the terrain function, not just of the
   * world's bounds: an island that could cross this radius is not generated at
   * all, so the pure per-hex function has to know it.
   */
  worldRadius: number;
  islandCellSize: number;
  islandChance: number;
  islandMinWidth: number;
  islandMaxWidth: number;
  islandMinSegments: number;
  islandMaxSegments: number;
  islandMinElongation: number;
  islandMaxElongation: number;
  islandMinBend: number;
  islandMaxBend: number;
  islandCoastWarp: number;
  islandCoastWarpScale: number;
  islandCoastNoise: number;
  islandCoastNoiseScale: number;
  islandSmallShare: number;
  islandLargeShare: number;
  beachThreshold: number;
  mountainThreshold: number;
  mountainRockiness: number;
  forestRockiness: number;
}

/** `WorldGenerationOptions`'s own C# defaults — demo mode's world (no backend to ask). */
export const DEFAULT_GENERATION: WorldGenerationConstants = {
  worldRadius: 1000,
  islandCellSize: 260,
  islandChance: 0.8,
  islandMinWidth: 21,
  islandMaxWidth: 40,
  islandMinSegments: 5,
  islandMaxSegments: 9,
  islandMinElongation: 5,
  islandMaxElongation: 8,
  islandMinBend: 0.12,
  islandMaxBend: 0.35,
  islandCoastWarp: 9.5,
  islandCoastWarpScale: 42,
  islandCoastNoise: 1.0,
  islandCoastNoiseScale: 49,
  islandSmallShare: 0.3,
  islandLargeShare: 0.12,
  beachThreshold: 0.9,
  mountainThreshold: 0.4,
  mountainRockiness: 0.72,
  forestRockiness: 0.52,
};

/**
 * A scaled-down archipelago — the backend's `WorldGenerationOptions.Compact(seed, 300)`:
 * the same shape at test/dev scale (islands 5-40 hexes across on a 90-hex cell grid). Used
 * by the island lab's preset and by tests that need coast, sea and inland terrain inside a
 * window of a few dozen hexes (a production-size island is ~150 hexes across).
 */
export const COMPACT_GENERATION: WorldGenerationConstants = {
  ...DEFAULT_GENERATION,
  worldRadius: 300,
  islandCellSize: 90,
  islandMinWidth: 8,
  islandMaxWidth: 14,
  islandMinSegments: 3,
  islandMaxSegments: 5,
  islandMinElongation: 2,
  islandMaxElongation: 4,
  islandCoastWarp: 3,
  islandCoastWarpScale: 14,
  islandCoastNoise: 0.6,
  islandCoastNoiseScale: 16,
};

/**
 * The island-shape constants that are not admin knobs — mirrors the backend's
 * `IslandShapeConstants` exactly.
 */
export const ISLAND_SHAPE = {
  jitter: 0.55,
  taper: 0.5,
  widthMinScale: 0.6,
  widthMaxScale: 1.0,
  warp2: 3.8,
  warpScale2: 11.4,
  octave2: 0.7,
  octave3: 0.45,
  isletMax: 5,
  isletRadiusMin: 0.3,
  isletRadiusMax: 0.7,
  isletDistanceMin: 1.6,
  isletDistanceMax: 3.2,
  smallScale: 0.55,
  largeScale: 1.6,
} as const;

export interface WorldSeed {
  seed: number;
  generation: WorldGenerationConstants;
}

/** Size class of an island cell: small (A), medium (B) or large (C). */
export type IslandSizeClass = 'small' | 'medium' | 'large';

/**
 * One island cell's shape: a bent spine of vertices with a half-width each plus a
 * few satellite islets, all in odd-q offset space — mirrors the backend's
 * `IslandShape`. `sx`/`sy`/`ix`/`iy` are relative to the centre `(cx, cy)`.
 */
export interface IslandShape {
  cellCol: number;
  cellRow: number;
  cx: number;
  cy: number;
  sx: number[];
  sy: number[];
  w: number[];
  ix: number[];
  iy: number[];
  ir: number[];
  /** Farthest any land of the island can be from `(cx, cy)`, warps included. */
  reach: number;
  sizeClass: IslandSizeClass;
  /** 1 unless the island was shrunk to fit its 3x3 cell block. */
  clamp: number;
  /** Inclusive offset-space box outside which no hex of the island can be land. */
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

/** How far, in half-widths, land can be from a spine point: 1 plus the largest noise contribution. */
function noiseReachFactor(noise: number): number {
  return 1 + noise * 0.5 * (1 + ISLAND_SHAPE.octave2 + ISLAND_SHAPE.octave3);
}

/** The farthest an island's land may be from its centre before it is shrunk to fit. */
export function islandReachBudget(cellSize: number, warp: number): number {
  return (1.5 - ISLAND_SHAPE.jitter / 2) * cellSize - (warp + ISLAND_SHAPE.warp2);
}

// Per-cell shapes are pure functions of (cell, seed, generation constants), so
// caching them changes no result. The cache is keyed on the generation object and
// re-validated against a snapshot of every constant a shape depends on, because
// admin tooling edits a generation object in place.
interface ShapeCache {
  params: number[];
  green: Map<number, Map<number, IslandShape | null>>;
  wasted: Map<number, Map<number, IslandShape | null>>;
}
const shapeCaches = new WeakMap<WorldGenerationConstants, ShapeCache>();

function shapeParams(gen: WorldGenerationConstants): number[] {
  return [
    gen.worldRadius,
    gen.islandCellSize,
    gen.islandChance,
    gen.islandMinWidth,
    gen.islandMaxWidth,
    gen.islandMinSegments,
    gen.islandMaxSegments,
    gen.islandMinElongation,
    gen.islandMaxElongation,
    gen.islandMinBend,
    gen.islandMaxBend,
    gen.islandCoastWarp,
    gen.islandCoastNoise,
    gen.islandSmallShare,
    gen.islandLargeShare,
  ];
}

function shapeCacheFor(gen: WorldGenerationConstants): ShapeCache {
  const params = shapeParams(gen);
  let cache = shapeCaches.get(gen);
  if (cache) {
    let same = true;
    for (let i = 0; i < params.length; i++) {
      if (cache.params[i] !== params[i]) {
        same = false;
        break;
      }
    }
    if (same) return cache;
  }
  cache = { params, green: new Map(), wasted: new Map() };
  shapeCaches.set(gen, cache);
  return cache;
}

function cellKey(cellCol: number, cellRow: number): number {
  return (cellCol + 1048576) * 2097152 + (cellRow + 1048576);
}

// Whether the cell rolls an island at all. The wasted grid additionally skips every
// cell that is a green island cell (world seed, full chance), so a wasted island's own
// cell grid never overlaps a green island's.
function cellPresent(cellCol: number, cellRow: number, worldSeed: number, wasted: boolean, gen: WorldGenerationConstants): boolean {
  const seed = wasted ? worldSeed + WASTED_SEED_OFFSET : worldSeed;
  const chance = wasted ? gen.islandChance * WASTED_ISLAND_CHANCE_FACTOR : gen.islandChance;
  if (hash2(cellCol, cellRow, seed) > chance) return false;
  return !wasted || hash2(cellCol, cellRow, worldSeed) > gen.islandChance;
}

function cellClass(cellCol: number, cellRow: number, seed: number, gen: WorldGenerationConstants): IslandSizeClass {
  const h = hash2(cellCol, cellRow, seed + 301);
  return h < gen.islandSmallShare ? 'small' : h > 1 - gen.islandLargeShare ? 'large' : 'medium';
}

/**
 * The island (if any) seeded in grid cell `(cellCol, cellRow)` — mirrors the backend's
 * `TerrainSampler.IslandShapeAt`: `null` when the cell rolls no island, when a large
 * neighbour suppresses it, or when the island could cross the world radius.
 */
export function islandShapeAt(
  cellCol: number,
  cellRow: number,
  world: WorldSeed,
  wasted = false,
): IslandShape | null {
  const gen = world.generation;
  const cache = shapeCacheFor(gen);
  const seed = wasted ? world.seed + WASTED_SEED_OFFSET : world.seed;
  const bySeed = wasted ? cache.wasted : cache.green;
  let cells = bySeed.get(world.seed);
  if (!cells) {
    cells = new Map();
    bySeed.set(world.seed, cells);
  }
  const key = cellKey(cellCol, cellRow);
  const hit = cells.get(key);
  if (hit !== undefined) return hit;
  const shape = buildCell(cellCol, cellRow, world.seed, seed, wasted, gen);
  cells.set(key, shape);
  return shape;
}

function buildCell(
  cellCol: number,
  cellRow: number,
  worldSeed: number,
  seed: number,
  wasted: boolean,
  gen: WorldGenerationConstants,
): IslandShape | null {
  if (!cellPresent(cellCol, cellRow, worldSeed, wasted, gen)) return null;
  let cls = cellClass(cellCol, cellRow, seed, gen);

  // A large island clears its neighbours; of two neighbouring large ones the higher roll
  // wins. (`cls` is read as it stands after earlier neighbours may already have demoted it.)
  let suppressed = false;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const nc = cellCol + dc;
      const nr = cellRow + dr;
      if (!cellPresent(nc, nr, worldSeed, wasted, gen) || cellClass(nc, nr, seed, gen) !== 'large') continue;
      if (cls !== 'large') suppressed = true;
      else if (hash2(nc, nr, seed + 307) > hash2(cellCol, cellRow, seed + 307)) cls = 'medium';
    }
  }
  return suppressed ? null : buildShape(cellCol, cellRow, seed, gen, cls);
}

function buildShape(
  cc: number,
  cr: number,
  seed: number,
  gen: WorldGenerationConstants,
  cls: IslandSizeClass,
): IslandShape | null {
  const K = ISLAND_SHAPE;
  const cs = gen.islandCellSize;
  const jit = cs * K.jitter;
  const cx = cc * cs + cs / 2 + (hash2(cc, cr, seed + 11) - 0.5) * jit;
  const cy = cr * cs + cs / 2 + (hash2(cc, cr, seed + 13) - 0.5) * jit;
  const scale = cls === 'small' ? K.smallScale : cls === 'large' ? K.largeScale : 1;
  const radius = scale * (gen.islandMinWidth + hash2(cc, cr, seed + 17) * (gen.islandMaxWidth - gen.islandMinWidth));
  const n =
    gen.islandMinSegments + Math.floor(hash2(cc, cr, seed + 19) * (gen.islandMaxSegments - gen.islandMinSegments + 1));

  const ax = hash2(cc, cr, seed + 23) - 0.5;
  const ay = hash2(cc, cr, seed + 47) - 0.5;
  const len = Math.sqrt(ax * ax + ay * ay);
  let ux = len < 1e-9 ? 1 : ax / len;
  let uy = len < 1e-9 ? 0 : ay / len;
  const hb = hash2(cc, cr, seed + 59);
  const t0 = (hb < 0.5 ? -1 : 1) * (gen.islandMinBend + (gen.islandMaxBend - gen.islandMinBend) * ((hb < 0.5 ? hb : hb - 0.5) * 2));
  const elong = gen.islandMinElongation + (gen.islandMaxElongation - gen.islandMinElongation) * hash2(cc, cr, seed + 61);
  const step = (radius * elong) / Math.max(1, n - 1);

  const px: number[] = new Array<number>(n).fill(0);
  const py: number[] = new Array<number>(n).fill(0);
  let lx = 0;
  let ly = 0;
  for (let k = 1; k < n; k++) {
    const t = t0 * (0.5 + hash2(cc, cr, seed + 400 + k));
    const c = (1 - t * t) / (1 + t * t);
    const s = (2 * t) / (1 + t * t);
    const nx = ux * c - uy * s;
    const ny = uy * c + ux * s;
    ux = nx;
    uy = ny;
    lx += ux * step;
    ly += uy * step;
    px[k] = lx;
    py[k] = ly;
  }

  let mx = 0;
  let my = 0;
  for (let k = 0; k < n; k++) {
    mx += px[k];
    my += py[k];
  }
  mx /= n;
  my /= n;
  for (let k = 0; k < n; k++) {
    px[k] -= mx;
    py[k] -= my;
  }

  const w: number[] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : Math.abs((2 * k) / (n - 1) - 1);
    w.push(radius * (1 - K.taper * f * f) * (K.widthMinScale + hash2(cc, cr, seed + 200 + k) * (K.widthMaxScale - K.widthMinScale)));
  }

  const ni = Math.floor(hash2(cc, cr, seed + 300) * (K.isletMax + 1));
  const ix: number[] = [];
  const iy: number[] = [];
  const ir: number[] = [];
  for (let i = 0; i < ni; i++) {
    const k = Math.floor(hash2(cc, cr, seed + 310 + i) * n);
    let ox = hash2(cc, cr, seed + 320 + i) - 0.5;
    let oy = hash2(cc, cr, seed + 330 + i) - 0.5;
    let ol = Math.sqrt(ox * ox + oy * oy);
    if (ol === 0 || Number.isNaN(ol)) ol = 1;
    ox /= ol;
    oy /= ol;
    const dist = w[k] * (K.isletDistanceMin + (K.isletDistanceMax - K.isletDistanceMin) * hash2(cc, cr, seed + 340 + i));
    ix.push(px[k] + ox * dist);
    iy.push(py[k] + oy * dist);
    ir.push(w[k] * (K.isletRadiusMin + (K.isletRadiusMax - K.isletRadiusMin) * hash2(cc, cr, seed + 350 + i)));
  }

  // Reach clamp: the farthest land can get from the centre must fit the 3x3 cell scan.
  const nm = noiseReachFactor(gen.islandCoastNoise);
  let reach = 0;
  for (let k = 0; k < n; k++) reach = Math.max(reach, Math.sqrt(px[k] * px[k] + py[k] * py[k]) + w[k] * nm);
  for (let i = 0; i < ni; i++) reach = Math.max(reach, Math.sqrt(ix[i] * ix[i] + iy[i] * iy[i]) + ir[i] * nm);
  const budget = islandReachBudget(cs, gen.islandCoastWarp);
  let factor = 1;
  if (reach > budget) {
    factor = budget / reach;
    for (let k = 0; k < n; k++) {
      px[k] *= factor;
      py[k] *= factor;
      w[k] *= factor;
    }
    for (let i = 0; i < ni; i++) {
      ix[i] *= factor;
      iy[i] *= factor;
      ir[i] *= factor;
    }
    reach = budget;
  }

  // World edge: drop the island if any of it could cross the world radius.
  const warpSum = gen.islandCoastWarp + K.warp2;
  const col = Math.floor(cx + 0.5);
  const row = Math.floor(cy + 0.5);
  const q = col;
  const r = row - (col - (col & 1)) / 2;
  const d = (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
  if (d + 1.42 * (reach + warpSum) > gen.worldRadius) return null;

  // Tight box of every place land can be, for scanning (see the backend's IslandShape).
  let minX = Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;
  for (let k = 0; k < n; k++) {
    const e = w[k] * nm;
    minX = Math.min(minX, cx + px[k] - e);
    maxX = Math.max(maxX, cx + px[k] + e);
    minY = Math.min(minY, cy + py[k] - e);
    maxY = Math.max(maxY, cy + py[k] + e);
  }
  for (let i = 0; i < ni; i++) {
    const e = ir[i] * nm;
    minX = Math.min(minX, cx + ix[i] - e);
    maxX = Math.max(maxX, cx + ix[i] + e);
    minY = Math.min(minY, cy + iy[i] - e);
    maxY = Math.max(maxY, cy + iy[i] + e);
  }

  return {
    cellCol: cc,
    cellRow: cr,
    cx,
    cy,
    sx: px,
    sy: py,
    w,
    ix,
    iy,
    ir,
    reach: reach + warpSum,
    sizeClass: cls,
    clamp: factor,
    minCol: Math.floor(minX - warpSum),
    maxCol: Math.ceil(maxX + warpSum),
    minRow: Math.floor(minY - warpSum),
    maxRow: Math.ceil(maxY + warpSum),
  };
}

/**
 * Every island of the world in cell order (column, then row): the cells that hold an
 * island whose whole footprint is inside the world radius — mirrors the backend's
 * `TerrainSampler.EnumerateIslandShapes`.
 */
export function enumerateIslandShapes(world: WorldSeed, wasted = false): IslandShape[] {
  const gen = world.generation;
  const span = Math.floor(gen.worldRadius / gen.islandCellSize) + 2;
  const shapes: IslandShape[] = [];
  for (let cellCol = -span; cellCol <= span; cellCol++) {
    for (let cellRow = -span; cellRow <= span; cellRow++) {
      const shape = islandShapeAt(cellCol, cellRow, world, wasted);
      if (shape) shapes.push(shape);
    }
  }
  return shapes;
}

function shapeDistance(is: IslandShape, qx: number, qy: number): number {
  const { sx, sy, w } = is;
  let d = Infinity;
  if (sx.length === 1) d = Math.sqrt(qx * qx + qy * qy) / w[0];
  for (let k = 0; k < sx.length - 1; k++) {
    const x0 = sx[k];
    const y0 = sy[k];
    const dx = sx[k + 1] - x0;
    const dy = sy[k + 1] - y0;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((qx - x0) * dx + (qy - y0) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = qx - (x0 + t * dx);
    const ey = qy - (y0 + t * dy);
    const v = Math.sqrt(ex * ex + ey * ey) / (w[k] + (w[k + 1] - w[k]) * t);
    if (v < d) d = v;
  }
  for (let i = 0; i < is.ix.length; i++) {
    const ex = qx - is.ix[i];
    const ey = qy - is.iy[i];
    const v = Math.sqrt(ex * ex + ey * ey) / is.ir[i];
    if (v < d) d = v;
  }
  return d;
}

/**
 * Depth of offset-space hex `(col, row)` into the nearest island of the green (or
 * wasted) grid, `null` at sea — mirrors the backend's `TerrainSampler.DepthAt`.
 * Distance to each island in reach is the minimum over its spine segments of
 * distance / interpolated half-width (islets: distance / radius), plus three
 * octaves of shoreline noise.
 */
function closestIsland(col: number, row: number, world: WorldSeed, wasted: boolean): { t: number } | null {
  const gen = world.generation;
  const seed = wasted ? world.seed + WASTED_SEED_OFFSET : world.seed;

  // Two-octave domain warp, applied once per hex before any distance is measured, so
  // coastlines wobble (fjords, bays) instead of tracing arcs.
  let px = col;
  let py = row;
  px +=
    (valueNoise(col, row, seed + 53, gen.islandCoastWarpScale) - 0.5) * 2 * gen.islandCoastWarp +
    (valueNoise(col, row, seed + 83, ISLAND_SHAPE.warpScale2) - 0.5) * 2 * ISLAND_SHAPE.warp2;
  py +=
    (valueNoise(col, row, seed + 71, gen.islandCoastWarpScale) - 0.5) * 2 * gen.islandCoastWarp +
    (valueNoise(col, row, seed + 89, ISLAND_SHAPE.warpScale2) - 0.5) * 2 * ISLAND_SHAPE.warp2;

  const cs = gen.islandCellSize;
  const baseCol = Math.floor(col / cs);
  const baseRow = Math.floor(row / cs);
  let best: { t: number } | null = null;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const is = islandShapeAt(baseCol + dc, baseRow + dr, world, wasted);
      if (!is) continue;
      const qx = px - is.cx;
      const qy = py - is.cy;
      if (qx * qx + qy * qy > is.reach * is.reach) continue;
      let d = shapeDistance(is, qx, qy);
      const n1 = valueNoise(col, row, seed + 97, gen.islandCoastNoiseScale) - 0.5;
      const n2 = valueNoise(col, row, seed + 101, gen.islandCoastNoiseScale / 2.5) - 0.5;
      const n3 = valueNoise(col, row, seed + 103, gen.islandCoastNoiseScale / 6.25) - 0.5;
      d += gen.islandCoastNoise * (n1 + ISLAND_SHAPE.octave2 * n2 + ISLAND_SHAPE.octave3 * n3);
      if (d <= 1 && (!best || d < best.t)) best = { t: d };
    }
  }
  return best;
}

/**
 * Extra seed offset added on top of the world seed for every wasted-island
 * hash — mirrors the backend's `TerrainSampler.WastedSeedOffset` exactly.
 */
export const WASTED_SEED_OFFSET = 1_000_003;

/**
 * Fraction of `islandChance` a wasted island cell rolls against — mirrors
 * the backend's `TerrainSampler.WastedIslandChanceFactor` exactly.
 */
export const WASTED_ISLAND_CHANCE_FACTOR = 0.1;

/**
 * Wasted islands are extra islands generated from the same seed on a
 * separate, rarer cell grid, hidden as sea until the world's endboss is
 * triggered — mirrors the backend's `TerrainSampler.WastedTerrainAt`
 * exactly, including never touching (or growing onto) a green island's
 * footprint. Unlike `terrainAt`, this is not what any existing renderer
 * queries by default: a caller that knows the wasted reveal has fired
 * switches to this instead (see `WorldModel.setWastedRevealed`).
 */
export function wastedTerrainAt(q: number, r: number, world: WorldSeed): Terrain {
  const { col, row } = axialToOddQ({ q, r });
  const gen = world.generation;

  // Never on a green island: this guarantees wasted land can never fuse
  // with (or hide inside) a green island's own footprint.
  if (closestIsland(col, row, world, false)) return 'sea';

  const island = closestIsland(col, row, world, true);
  if (!island) return 'sea';

  // Nor may it touch green land through any of its six neighbours — this is
  // what stops a wasted island from growing a land bridge onto a green
  // island's coast.
  if (neighbors({ q, r }).some((n) => isLand(n.q, n.r, world))) return 'sea';

  if (island.t > gen.beachThreshold) return 'sand';
  const rockiness = valueNoise(q, r, world.seed + 2, 2.5);
  if (island.t < gen.mountainThreshold && rockiness > gen.mountainRockiness) return 'mountain';
  return rockiness > gen.forestRockiness ? 'forest' : 'grass';
}

/**
 * How far into the nearest green island `(q, r)` sits, as a fraction of that
 * island's radius: 0 at the centre, 1 at the shoreline, `null` at sea —
 * mirrors the backend's `TerrainSampler.IslandDepthAt` exactly. Exported for
 * `riverGenerator.ts`, which needs this (not just `terrainAt`'s coarser
 * land/sea answer) to score a river step's uphill/downhill candidates the
 * same way the backend's `RiverGenerator.BuildCandidates` does.
 */
export function islandDepthAt(q: number, r: number, world: WorldSeed): number | null {
  const { col, row } = axialToOddQ({ q, r });
  const island = closestIsland(col, row, world, false);
  return island ? island.t : null;
}

/**
 * `islandDepthAt`'s wasted-island counterpart — mirrors
 * `TerrainSampler.WastedDepthAt` exactly (same seed offset, same
 * `excludeGreenCells` gate against a wasted island's own cell grid
 * overlapping a green island's own).
 */
export function wastedDepthAt(q: number, r: number, world: WorldSeed): number | null {
  const { col, row } = axialToOddQ({ q, r });
  const island = closestIsland(col, row, world, true);
  return island ? island.t : null;
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
 * nothing to draw in demo mode. Uses the island cells' own jittered centres
 * (`enumerateIslandShapes`) rather than inventing a second scheme, so a demo
 * island's label always sits over the same island `terrainAt`/`isLand`
 * actually generate there.
 */
export function enumerateIslands(world: WorldSeed, radius: number): IslandLabel[] {
  const islands: IslandLabel[] = [];
  for (const shape of enumerateIslandShapes(world)) {
    let center = oddQToAxial({ col: Math.floor(shape.cx + 0.5), row: Math.floor(shape.cy + 0.5) });
    if (hexDistance({ q: 0, r: 0 }, center) > radius) continue;
    // The middle of a crescent or a C is open water: like the backend's `CentreOf`, put the
    // label on the land hex nearest to it (an island cell whose land eroded away entirely,
    // or was only a speck, gets no label).
    if (terrainAt(center.q, center.r, world) === 'sea') {
      const land = nearestLandWithin(center, Math.ceil(shape.reach), world);
      if (!land) continue;
      center = land;
    }
    islands.push({
      id: `demo-${shape.cellCol}-${shape.cellRow}`,
      name: islandNameFor(shape.cellCol, shape.cellRow, world.seed),
      q: center.q,
      r: center.r,
    });
  }
  return islands;
}

function nearestLandWithin(from: { q: number; r: number }, maxRadius: number, world: WorldSeed): { q: number; r: number } | null {
  for (let ring = 1; ring <= maxRadius; ring++) {
    for (const c of hexRing(from, ring)) if (terrainAt(c.q, c.r, world) !== 'sea') return c;
  }
  return null;
}

export function terrainAt(q: number, r: number, world: WorldSeed): Terrain {
  const { col, row } = axialToOddQ({ q, r });
  const island = closestIsland(col, row, world, false);
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

// `neighbors()`'s own direction list, used directly rather than through it so
// the per-tile neighbour walk allocates neither the array nor the six coords.
const NEIGHBOR_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
// The unit vector at each neighbour direction's angle (60 degrees apart, in
// NEIGHBOR_DIRS order), hoisted out of `coastalOrientationFrom`'s inner loop.
// Exactly the expressions `coastalOrientation` evaluates inline, so the sums
// they feed are bit-identical.
const NEIGHBOR_COS = [0, 1, 2, 3, 4, 5].map((i) => Math.cos(i * (Math.PI / 3)));
const NEIGHBOR_SIN = [0, 1, 2, 3, 4, 5].map((i) => Math.sin(i * (Math.PI / 3)));

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

/**
 * Top-variant weights for a wasted island's land, per green terrain it stands
 * in for — its own art set, so it can't borrow `VARIANT_COUNTS` (grass's 4
 * would never reach wasteland's two lava variants). Wasteland is plain,
 * rocks, spikes, rune crack, lava cracks, lava pool: the rune crack is the
 * rare accent and lava shows up regularly. Dead forest and black sand have
 * a plain frame and one variant each.
 */
const WASTED_VARIANT_WEIGHTS: Partial<Record<Terrain, number[]>> = {
  grass: [0.3, 0.2, 0.2, 0.06, 0.14, 0.1],
  forest: [0.5, 0.5],
  sand: [0.6, 0.4],
};

const WASTED_VARIANT_SALT = 1_000_003;

/** The top-variant index a revealed wasted-island tile of `terrain` shows at `(q, r)` — see `WASTED_VARIANT_WEIGHTS`. */
export function wastedVariantAt(q: number, r: number, world: WorldSeed, terrain: Terrain): number {
  const weights = WASTED_VARIANT_WEIGHTS[terrain];
  if (!weights) return 0;
  // A salt far from orientation's `seed + 29`: hash2 barely mixes its seed
  // term, so a nearby salt (the green variant's `+ 31`) lands every hex in
  // the same bucket as its orientation and pins each variant to one
  // rotation.
  return weightedIndex(hash2(q, r, world.seed + WASTED_VARIANT_SALT), weights);
}

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

/**
 * Which crop the island whose centre is (q, r) grows — `'wheat'` or
 * `'pumpkin'` — mirrors the backend's `TerrainSampler.SoilAt` exactly (same
 * seed offset, same threshold). Every Grass hex on that island shares this
 * one answer, so the caller hashes by the island's centre once rather than
 * per hex (see `WorldModel.soilAtIslandCentre`).
 */
export function soilAt(q: number, r: number, world: WorldSeed): 'wheat' | 'pumpkin' {
  const h = hash2(q, r, world.seed + 41);
  return h < 0.5 ? 'wheat' : 'pumpkin';
}

/**
 * A river-art dressing for a `straight`/`bend`/`bend60` hex, on top of the
 * shape itself — see `riverVariantAt`'s own doc comment for the weights and
 * `textures.ts`'s `riverTexturesFor`, which is what actually draws one.
 */
export type RiverVariant = 'plain' | 'meander' | 'island' | 'loop';

/**
 * Salt for `riverVariantAt` — the next unused prime continuing the per-hex-
 * property sequence this module already uses (`defaultOrientation` +29,
 * `variantAt` +31, `springMountainShapeAt` +37, `soilAt` +41): far enough
 * past that cluster, and past every noise-field salt this file also uses
 * (11, 13, 17, 19, 23, 47, 53, 59, 61, 71, 101, 103, 200+lobe), that hash2's
 * weak seed-mixing (see `WASTED_VARIANT_SALT`'s own doc comment) can't
 * correlate this pick with a neighbouring one.
 */
const RIVER_VARIANT_SALT = 67;

const RIVER_180_WEIGHTS = [0.4, 0.4, 0.2]; // plain, meander, island
const RIVER_120_WEIGHTS = [0.4, 0.4, 0.2]; // plain, meander, island
const RIVER_60_WEIGHTS = [0.85, 0.15]; // plain, loop

/**
 * Which river-art variant a `straight`/`bend`/`bend60` hex renders with —
 * `'plain'` for every other shape (spring/confluence/mouth have no variant
 * art). Mirrors the backend's `TerrainSampler.RiverVariantAt` exactly (same
 * salt, same weights): straight and bend each roll plain/meander/island at
 * 40/40/20, bend60 rolls plain/loop at 85/15. Pure and independent of
 * whether `(q, r)` actually carries a river of this shape — the caller
 * (river rendering, `riverBuildingAllowedHere`) already knows that from its
 * own `RiverTile` lookup, the same shape every other `*At` helper in this
 * file takes as a given.
 */
export function riverVariantAt(q: number, r: number, world: WorldSeed, shape: RiverTileShape): RiverVariant {
  if (shape !== 'straight' && shape !== 'bend' && shape !== 'bend60') return 'plain';
  const h = hash2(q, r, world.seed + RIVER_VARIANT_SALT);
  if (shape === 'bend60') {
    return weightedIndex(h, RIVER_60_WEIGHTS) === 0 ? 'plain' : 'loop';
  }
  const weights = shape === 'straight' ? RIVER_180_WEIGHTS : RIVER_120_WEIGHTS;
  const index = weightedIndex(h, weights);
  return index === 0 ? 'plain' : index === 1 ? 'meander' : 'island';
}

/**
 * A terrain sampler `generateTile` may reuse — `WorldModel.terrainOf` in
 * practice, which caches. Defaults to calling `terrainAt` directly, so a
 * caller that has no cache (a test, `enumerateIslands`' neighbours) still gets
 * the same tile.
 */
export type TerrainSampler = (q: number, r: number) => Terrain;

/**
 * The six neighbours' land/sea as a bitmask, bit `i` set when
 * `NEIGHBOR_DIRS[i]` is land.
 *
 * A bitmask rather than an array because this runs once per generated tile and
 * a zoomed-out world map generates tens of thousands of them in one rebuild —
 * a six-element array each would be pure garbage. Bit order *is*
 * `NEIGHBOR_DIRS` order, and `coastalOrientation` turns index into angle, so
 * the two must not drift apart.
 */
function landNeighbourMask(q: number, r: number, sample: TerrainSampler): number {
  let mask = 0;
  for (let i = 0; i < NEIGHBOR_DIRS.length; i++) {
    if (sample(q + NEIGHBOR_DIRS[i].q, r + NEIGHBOR_DIRS[i].r) !== 'sea') mask |= 1 << i;
  }
  return mask;
}

/**
 * `coastalOrientation` over an already-sampled neighbour mask. Same summed
 * unit vectors in the same index order — and therefore the same floating-point
 * accumulation, which matters because the zero-vector epsilon below exists
 * precisely for the cases where that sum lands near zero.
 */
function coastalOrientationFrom(landMask: number): TileOrientation {
  let sumX = 0;
  let sumY = 0;
  let firstLandIndex = -1;
  for (let i = 0; i < 6; i++) {
    if (!(landMask & (1 << i))) continue;
    if (firstLandIndex < 0) firstLandIndex = i;
    sumX += NEIGHBOR_COS[i];
    sumY += NEIGHBOR_SIN[i];
  }
  // Opposite land neighbours (e.g. a one-hex-wide strait) can cancel the
  // vector to (near) zero — see `coastalOrientation` for why this is an
  // epsilon rather than an exact `=== 0` check, and why the fallback is the
  // first land direction found.
  const ZERO_EPSILON = 1e-9;
  if (Math.abs(sumX) < ZERO_EPSILON && Math.abs(sumY) < ZERO_EPSILON) return TILE_ORIENTATIONS[firstLandIndex];

  let angle = Math.atan2(sumY, sumX);
  if (angle < 0) angle += 2 * Math.PI;
  const index = Math.round(angle / (Math.PI / 3)) % 6;
  return TILE_ORIENTATIONS[index];
}

/**
 * Builds one hex's `Tile`.
 *
 * The shape of this — sample the seven terrains once, then answer every
 * question from them — is the whole point, and it is worth stating why the
 * obvious version was not kept. Written as four independent calls
 * (`terrainAt`, `isCoastalWater`, `orientationAt`, `variantAt`) it looked
 * cheap, but three of the four re-derive coastal-ness, and each of those is
 * seven `terrainAt` calls: measured at 19us a tile against `terrainAt`'s own
 * 1.2us, i.e. sixteen times the necessary work. That is what made zooming the
 * world map out into unvisited water stall for over a second — 58,000 hexes
 * come into view at once and every one of them was paying it.
 *
 * `sample` is what makes the seven collapse to roughly one: `WorldModel`
 * passes a cached lookup, so a neighbour's terrain is computed by whichever
 * of the seven tiles that share it asks first.
 */
export function generateTile(q: number, r: number, world: WorldSeed, sample?: TerrainSampler): Tile {
  const terrainOf = sample ?? ((sq: number, sr: number) => terrainAt(sq, sr, world));
  const terrain = terrainOf(q, r);
  // Only sea can be coastal, so land hexes never pay for the neighbour walk.
  const landMask = terrain === 'sea' ? landNeighbourMask(q, r, terrainOf) : 0;
  const coastal = landMask !== 0;

  const h = hash2(q, r, world.seed + 31);
  let variant: number;
  if (coastal) {
    variant = weightedIndex(h, COASTAL_WATER_VARIANT_WEIGHTS);
  } else {
    const count = VARIANT_COUNTS[terrain] ?? 1;
    variant = count <= 1 ? 0 : Math.min(count - 1, Math.floor(h * count));
  }

  return {
    q,
    r,
    terrain,
    isCoastalWater: coastal,
    orientation: coastal ? coastalOrientationFrom(landMask) : defaultOrientation(q, r, world),
    variant,
  };
}
