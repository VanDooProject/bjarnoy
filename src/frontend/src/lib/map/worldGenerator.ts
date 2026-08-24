// Deterministic, dependency-free procedural terrain: a scattered archipelago
// of distinct islands (matching the docs/design/zip-brainstorms.md world-map
// mockup) rather than one continuous landmass. Tiles are generated on demand
// from (q, r) and a seed, so nothing needs to be precomputed or stored for
// the whole map — memory is bounded by hexes actually visited.
import { axialToOddQ } from '../hex/coords';
import type { Terrain, Tile } from './types';

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

export function generateTile(q: number, r: number, world: WorldSeed): Tile {
  return { q, r, terrain: terrainAt(q, r, world) };
}
