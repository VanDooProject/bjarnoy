// The water-mask bake, off the main thread.
//
// The bake is the single most expensive thing the renderer does — even after
// the per-texel work was cut to a third, a zoomed-out map's ~600k texels still
// take a few hundred milliseconds — and it is pure CPU with no DOM or GPU in
// it, which is exactly the shape of work a worker is for. Run inline it is a
// frozen frame; run here it is a few hundred milliseconds during which the sea
// is drawn with the mask it already had, and then is not.
//
// Both modes bake here. The bake is a pure function of the world seed plus
// two short hex lists (river mouths) the request carries.
import { bakeWaterMask } from './waterMask';
import { terrainAt, wastedTerrainAt, type WorldGenerationConstants } from '../worldGenerator';
import type { WaterMaskRegion } from './waterMaskLayout';

export interface BakeRequest {
  /** Discarded by the main thread if a newer request has since gone out. */
  id: number;
  region: WaterMaskRegion;
  tileWidth: number;
  tileHeight: number;
  seed: number;
  generation: WorldGenerationConstants;
  /**
   * Whether this world's wasted islands are currently revealed
   * (`WorldModel.isWastedRevealed`) — a hex the plain green `terrainAt`
   * calls sea may actually be wasted land once this is set, and must bake
   * as land (no foam/squiggle water surface drawn over it) the same way
   * `WorldModel.terrainOf` treats it. Defaults to `false` (every existing
   * caller's assumption) when omitted.
   */
  wastedRevealed?: boolean;
  /**
   * River-mouth hexes (`WorldModel.riverMouthHexKeys`, packed with `hexKey`).
   * Rivers are server state the worker cannot derive from the seed, so like
   * `buildingHexes` they travel as a short list. Omitted or empty means the
   * no-foam field is all zero.
   */
  noFoamHexes?: number[];
}

export interface BakeResponse {
  id: number;
  data: Uint8Array;
  width: number;
  height: number;
  /** See `WaterMask.taint`. */
  taint: Uint8Array;
  /** See `WaterMask.noFoam`. */
  noFoam: Uint8Array;
  /** What the bake itself took here, so the panel reports the real cost rather than the round trip. */
  bakeMs: number;
}

/**
 * Terrain cache for this worker, keyed and shaped exactly like
 * `WorldModel`'s, and kept between bakes.
 *
 * Successive bakes overlap heavily — a bake is triggered by the viewport
 * leaving the last one's region, so most of the new region is the old one —
 * so this is the difference between every bake being a cold one and only the
 * first being. Cleared when the seed changes, which in practice means never:
 * a reseed replaces the whole WorldModel, and the renderer built on it gets a
 * new worker with it.
 */
let cacheSeed: number | null = null;
let cacheWastedRevealed = false;
let cache = new Map<number, boolean>();

// Separate cache from `isLandFor`'s: that one answers "is this land at all",
// folding the wasted layer into the same yes/no `isLand` every other caller
// wants. The taint field needs the narrower question — "is this land *only*
// because the wasted layer says so" — which `isLandFor`'s cached answer
// can't be un-mixed back into, so this keeps its own memo table rather than
// deriving from it.
let wastedCacheSeed: number | null = null;
let wastedCacheRevealed = false;
let wastedCache = new Map<number, boolean>();

/** `WorldModel`'s own packing, so the two agree about what a hex key is. */
function hexKey(q: number, r: number): number {
  return ((((q | 0) + 0x8000) << 16) | (((r | 0) + 0x8000) & 0xffff)) | 0;
}

// Exported (only) so waterMask.worker.test.ts can exercise the reveal-aware
// land check directly, without spinning up a real Worker (workers need a
// browser/worker global this repo's node-environment vitest config doesn't
// provide).
export function isLandFor(seed: number, generation: WorldGenerationConstants, wastedRevealed: boolean) {
  // Cleared on a reveal flip too, not just a seed change: a cached `false`
  // (sea) from before the reveal would otherwise survive and keep drawing
  // water over now-revealed wasted land — see WorldModel.setWastedRevealed's
  // own reasoning for why this can only ever go stale in the "was sea"
  // direction.
  if (cacheSeed !== seed || cacheWastedRevealed !== wastedRevealed) {
    cacheSeed = seed;
    cacheWastedRevealed = wastedRevealed;
    cache = new Map();
  }
  const world = { seed, generation };
  return (q: number, r: number): boolean => {
    const k = hexKey(q, r);
    let land = cache.get(k);
    if (land === undefined) {
      land = terrainAt(q, r, world) !== 'sea';
      // Mirrors WorldModel.terrainOf's own fall-through to the wasted layer
      // for a hex the green layer alone calls sea.
      if (!land && wastedRevealed) {
        land = wastedTerrainAt(q, r, world) !== 'sea';
      }
      cache.set(k, land);
    }
    return land;
  };
}

// Exported (only) so waterMask.worker.test.ts can exercise the taint-aware
// wasted-land check directly, the same way it exercises `isLandFor` — see
// that export's own comment for why (no `self` under this repo's
// node-environment vitest config).
export function isWastedLandFor(
  seed: number,
  generation: WorldGenerationConstants,
  wastedRevealed: boolean,
): (q: number, r: number) => boolean {
  if (wastedCacheSeed !== seed || wastedCacheRevealed !== wastedRevealed) {
    wastedCacheSeed = seed;
    wastedCacheRevealed = wastedRevealed;
    wastedCache = new Map();
  }
  const world = { seed, generation };
  return (q: number, r: number): boolean => {
    if (!wastedRevealed) return false;
    const k = hexKey(q, r);
    let land = wastedCache.get(k);
    if (land === undefined) {
      land = terrainAt(q, r, world) === 'sea' && wastedTerrainAt(q, r, world) !== 'sea';
      wastedCache.set(k, land);
    }
    return land;
  };
}

// Guarded rather than assigned unconditionally: this lets
// waterMask.worker.test.ts import isLandFor directly (they have
// no Worker dependency of their own) under this repo's node-environment
// vitest config, which has no `self` at all — a real worker context always
// has one, so this changes nothing there.
if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent<BakeRequest>) => {
    const { id, region, tileWidth, tileHeight, seed, generation, wastedRevealed, noFoamHexes } = event.data;
    const noFoamSet = noFoamHexes && noFoamHexes.length > 0 ? new Set(noFoamHexes) : null;
    const started = performance.now();
    const isLand = isLandFor(seed, generation, wastedRevealed ?? false);
    const mask = bakeWaterMask(region, tileWidth, tileHeight, {
      isLand,
      isWastedLand: isWastedLandFor(seed, generation, wastedRevealed ?? false),
      noFoam: noFoamSet ? (q, r) => noFoamSet.has(hexKey(q, r)) : undefined,
    });
    const response: BakeResponse = {
      id,
      data: mask.data,
      width: mask.width,
      height: mask.height,
      taint: mask.taint,
      noFoam: mask.noFoam,
      bakeMs: performance.now() - started,
    };
    // Transferred, not copied: the mask is 2.7MB at world zoom and
    // structured cloning it would put a chunk of the cost back on the main
    // thread, which is the whole thing this is here to avoid.
    (self as unknown as Worker).postMessage(response, [response.data.buffer, response.taint.buffer, response.noFoam.buffer]);
  };
}
