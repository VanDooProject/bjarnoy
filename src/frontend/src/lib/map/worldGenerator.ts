// Deterministic, dependency-free procedural terrain. Tiles are generated
// on demand from (q, r) and a seed — nothing needs to be precomputed or
// stored for the whole map, which is what lets the renderer stream an
// effectively unbounded world through a small viewport-sized cache.
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
  const tx = smooth((x / cell) - x0);
  const ty = smooth((y / cell) - y0);
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

export function terrainAt(q: number, r: number, world: WorldSeed): Terrain {
  const x = q;
  const y = r + q / 2;
  const elevation =
    valueNoise(x, y, world.seed, 7) * 0.65 + valueNoise(x, y, world.seed + 1, 16) * 0.35;
  if (elevation < 0.52) return 'sea';
  if (elevation < 0.55) return 'sand';
  const rockiness = valueNoise(x, y, world.seed + 2, 3);
  if (elevation > 0.74 && rockiness > 0.8) return 'mountain';
  return rockiness > 0.5 ? 'forest' : 'grass';
}

export function generateTile(q: number, r: number, world: WorldSeed): Tile {
  return { q, r, terrain: terrainAt(q, r, world) };
}
