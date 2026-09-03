// The water mask — docs/design/water-shader.md §2.
//
// Both effects this feature adds are functions of one quantity: how far is
// this pixel from land. Foam is a band at small distances; mid-water waves are
// suppressed at small ones (today's per-hex `isNearLand` cull, but continuous).
// So the shader needs a distance field, and that means a CPU-baked data
// texture — the same shape of thing `demoFogMask` bakes, over a different
// grid (waterMaskLayout.ts) and with a different transform.
import { isoPixelToAxial } from '../../hex/geometry';
import type { WaterMaskRegion } from './waterMaskLayout';

/**
 * The subset of `WorldModel` the bake needs — the same narrow interface
 * `shoreline.ts` already declares, and for the same reason: terrain is
 * deterministic from the world seed on the client, so this needs no backend
 * round trip and tests can pass a plain object.
 */
export interface TerrainLookup {
  isLand(q: number, r: number): boolean;
}

/**
 * How far out from land the R channel ramps, in tile widths. Well past the
 * foam band itself: R also drives §4.2's wave coast-fade, which needs headroom
 * beyond the foam to fade the crests in over.
 */
export const FOAM_REACH_TILES = 1.5;

/**
 * How far *into* land the G channel ramps, in tile widths. Under half a hex —
 * this only exists so foam can lick onto the beach rather than stopping short
 * of it in a visible gap, and the land art above the mesh clips it anyway
 * (§3.5).
 */
export const FOAM_BLEED_TILES = 0.35;

export interface WaterMask {
  /** RGBA8, `width * height * 4`. R: distance from land. G: distance from water. B: per-hex seed. A: water coverage. */
  data: Uint8Array;
  width: number;
  height: number;
  region: WaterMaskRegion;
}

const EDT_INF = 1e20;

/**
 * Felzenszwalb & Huttenlocher's exact 1D squared-distance transform:
 * `d[q] = min over p of (q - p)^2 + f[p]`, in O(n).
 *
 * Exact, rather than the 3-4 chamfer the spike used. That is not a
 * gold-plating: a chamfer's error is *directional* (it is cheapest along the
 * eight directions its weights encode), and the spike showed it as faint
 * radial streaks fanning out from the coast — visible in the foam band, which
 * is where the whole effect lives. §11 records that as the reason not to treat
 * this as an optimisation to skip.
 *
 * `f` uses EDT_INF rather than Infinity for the non-seed cost so the parabola
 * intersection below stays finite: with two infinite costs the numerator would
 * be Infinity - Infinity = NaN, and the whole scanline would collapse.
 */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Exact euclidean distance, in texels, from every cell to the nearest cell
 * with `seeds[i] !== 0`. Separable: `edt1d` down every column, then across
 * every row of the result.
 */
export function euclideanDistanceTransform(seeds: Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const squared = new Float64Array(width * height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = seeds[y * width + x] ? 0 : EDT_INF;
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) squared[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = squared[row + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) squared[row + x] = d[x];
  }

  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(squared[i]);
  return out;
}

/**
 * Deterministic per-hex pseudo-random seed for the shader's foam ruggedness
 * and wave phase — the same hash `demoFogMask`'s `noiseSeed` uses, and for the
 * same reason: it is only ever sampled locally, never compared against a
 * server-baked value.
 */
export function waterNoiseSeed(q: number, r: number): number {
  let h = (Math.imul(q, 374761393) ^ Math.imul(r, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 0xff;
}

/**
 * Bakes the mask over `region`.
 *
 * The world -> hex step goes through **`isoPixelToAxial`**, and not through
 * anything derived from sprite bounds. That is the single load-bearing choice
 * in this file (§2.3/§3.4): `isoPixelToAxial` is defined in terms of the
 * `isoTopPoints` top-face hexagon, which abuts its neighbours with no gaps or
 * overlaps — and because top faces tessellate exactly, a tile's 68px skirt is
 * always covered by the tile in front of it, so the *visible* land/water
 * boundary in the art falls on precisely that same polygon edge. Mask and art
 * therefore agree by construction, with no offset term anywhere. Bake from
 * sprite extents instead and every boundary shifts by up to 68 world units,
 * detaching the foam from the coastline it is supposed to be tracing.
 */
export function bakeWaterMask(region: WaterMaskRegion, tileWidth: number, tileHeight: number, terrain: TerrainLookup): WaterMask {
  const { width, height, texelWorldSize, rect } = region;
  const count = width * height;
  const water = new Uint8Array(count);
  const land = new Uint8Array(count);
  const seed = new Uint8Array(count);

  // One `isoPixelToAxial` per texel is the bake's whole cost. It is a rounded
  // estimate plus at most seven point-in-hexagon tests, and at 1024^2 in the
  // clamped worst case that is the number `waterMaskBakeMs` reports.
  for (let y = 0; y < height; y++) {
    const wy = rect.minY + (y + 0.5) * texelWorldSize;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const wx = rect.minX + (x + 0.5) * texelWorldSize;
      const hex = isoPixelToAxial({ x: wx, y: wy }, tileWidth, tileHeight);
      const isLand = terrain.isLand(hex.q, hex.r);
      land[row + x] = isLand ? 1 : 0;
      water[row + x] = isLand ? 0 : 1;
      seed[row + x] = waterNoiseSeed(hex.q, hex.r);
    }
  }

  const distanceFromLand = euclideanDistanceTransform(land, width, height);
  const distanceFromWater = euclideanDistanceTransform(water, width, height);

  const reach = (FOAM_REACH_TILES * tileWidth) / texelWorldSize;
  const bleed = (FOAM_BLEED_TILES * tileWidth) / texelWorldSize;

  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4 + 0] = Math.round(255 * Math.min(1, distanceFromLand[i] / reach));
    data[i * 4 + 1] = Math.round(255 * Math.min(1, distanceFromWater[i] / bleed));
    data[i * 4 + 2] = seed[i];
    data[i * 4 + 3] = water[i] ? 255 : 0;
  }
  return { data, width, height, region };
}
