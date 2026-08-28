// Deterministic, dependency-free procedural terrain: a scattered archipelago
// of distinct islands (matching the docs/design/zip-brainstorms.md world-map
// mockup) rather than one continuous landmass. Tiles are generated on demand
// from (q, r) and a seed, so nothing needs to be precomputed or stored for
// the whole map — memory is bounded by hexes actually visited.
import { axialToOddQ, neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS } from './types';
import type { Terrain, Tile, TileOrientation } from './types';

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

export interface WorldSeed {
  seed: number;
}

// Islands are seeded on a coarse grid of cells (in odd-q offset space, which
// is roughly square so islands read as evenly, not axially, spread out).
// Each cell independently rolls whether it holds an island, where its
// (jittered) centre sits, and how big it is — all as O(1) hashes of the
// cell's own coordinates, so a hex's terrain never depends on generating
// its neighbours.
const ISLAND_CELL = 9;
const ISLAND_CHANCE = 0.45;
const ISLAND_MIN_RADIUS = 2.4;
const ISLAND_MAX_RADIUS = 5.6;

function closestIsland(col: number, row: number, seed: number): { t: number } | null {
  let best: { t: number } | null = null;
  for (let dcx = -1; dcx <= 1; dcx++) {
    for (let dcy = -1; dcy <= 1; dcy++) {
      const cellCol = Math.floor(col / ISLAND_CELL) + dcx;
      const cellRow = Math.floor(row / ISLAND_CELL) + dcy;
      if (hash2(cellCol, cellRow, seed) > ISLAND_CHANCE) continue;
      const jitter = ISLAND_CELL * 0.55;
      const centerCol =
        cellCol * ISLAND_CELL + ISLAND_CELL / 2 + (hash2(cellCol, cellRow, seed + 11) - 0.5) * jitter;
      const centerRow =
        cellRow * ISLAND_CELL + ISLAND_CELL / 2 + (hash2(cellCol, cellRow, seed + 13) - 0.5) * jitter;
      const radius =
        ISLAND_MIN_RADIUS + hash2(cellCol, cellRow, seed + 17) * (ISLAND_MAX_RADIUS - ISLAND_MIN_RADIUS);
      const dist = Math.hypot(col - centerCol, row - centerRow);
      const t = dist / radius;
      if (t <= 1 && (!best || t < best.t)) best = { t };
    }
  }
  return best;
}

export function terrainAt(q: number, r: number, world: WorldSeed): Terrain {
  const { col, row } = axialToOddQ({ q, r });
  const island = closestIsland(col, row, world.seed);
  if (!island) return 'sea';
  if (island.t > 0.82) return 'sand';
  const rockiness = valueNoise(q, r, world.seed + 2, 2.5);
  if (island.t < 0.4 && rockiness > 0.72) return 'mountain';
  return rockiness > 0.52 ? 'forest' : 'grass';
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
  // vector to exactly zero. Falling back to the first land direction found
  // keeps the pick deterministic instead of an arbitrary default.
  if (sumX === 0 && sumY === 0) return TILE_ORIENTATIONS[firstLandIndex];

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

/** Per-terrain variant count the tile art pack actually has, everything else falling back to 1. */
const VARIANT_COUNTS: Partial<Record<Terrain, number>> = {
  grass: 3,
  forest: 3,
  mountain: 2,
};

/**
 * Seed-stable variant index for a hex, in `[0, N)` where `N` is however many
 * variants `VARIANT_COUNTS` knows the art pack has for that terrain (1 —
 * i.e. always variant 0 — for anything not listed). Capping the range this
 * way *is* the fallback: a terrain with fewer variants than the pack's
 * richest one never gets asked for a variant it doesn't have.
 */
export function variantAt(q: number, r: number, world: WorldSeed): number {
  const terrain = terrainAt(q, r, world);
  const count = VARIANT_COUNTS[terrain] ?? 1;
  if (count <= 1) return 0;
  const h = hash2(q, r, world.seed + 31);
  const index = Math.floor(h * count);
  return index >= count ? count - 1 : index;
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
