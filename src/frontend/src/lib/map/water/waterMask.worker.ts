// The water-mask bake, off the main thread.
//
// The bake is the single most expensive thing the renderer does — even after
// the per-texel work was cut to a third, a zoomed-out world map's 670k texels
// still take ~165ms — and it is pure CPU with no DOM or GPU in it, which is
// exactly the shape of work a worker is for. Run inline it is a frozen frame;
// run here it is a few hundred milliseconds during which the sea is drawn with
// the mask it already had, and then is not.
//
// World mode only, and that is not a limitation so much as the reason this
// works. The bake's one impure input is `hasWaterProp`, which needs a hex's
// *building*, and buildings are live game state this thread does not have.
// World mode does not read that channel at all (WaterLayer only sets
// uPropMute in settlement mode — there are no painted sea tiles on the world
// map to protect), so the only terrain question left is `isLand`, and that is
// a pure function of the world seed. Settlement-mode masks are a few hundred
// thousand texels at most and bake in ~25ms inline, which is not a stall.
import { bakeWaterMask } from './waterMask';
import { terrainAt, type WorldGenerationConstants } from '../worldGenerator';
import type { WaterMaskRegion } from './waterMaskLayout';

export interface BakeRequest {
  /** Discarded by the main thread if a newer request has since gone out. */
  id: number;
  region: WaterMaskRegion;
  tileWidth: number;
  tileHeight: number;
  seed: number;
  generation: WorldGenerationConstants;
}

export interface BakeResponse {
  id: number;
  data: Uint8Array;
  width: number;
  height: number;
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
let cache = new Map<number, boolean>();

function isLandFor(seed: number, generation: WorldGenerationConstants) {
  if (cacheSeed !== seed) {
    cacheSeed = seed;
    cache = new Map();
  }
  const world = { seed, generation };
  return (q: number, r: number): boolean => {
    const k = ((((q | 0) + 0x8000) << 16) | (((r | 0) + 0x8000) & 0xffff)) | 0;
    let land = cache.get(k);
    if (land === undefined) {
      land = terrainAt(q, r, world) !== 'sea';
      cache.set(k, land);
    }
    return land;
  };
}

self.onmessage = (event: MessageEvent<BakeRequest>) => {
  const { id, region, tileWidth, tileHeight, seed, generation } = event.data;
  const started = performance.now();
  // No `getTile`: that is the documented way to ask for an all-zero A channel,
  // which is the one world mode reads anyway (see this file's header).
  const mask = bakeWaterMask(region, tileWidth, tileHeight, { isLand: isLandFor(seed, generation) });
  const response: BakeResponse = {
    id,
    data: mask.data,
    width: mask.width,
    height: mask.height,
    bakeMs: performance.now() - started,
  };
  // Transferred, not copied: the mask is 2.7MB at world zoom and structured
  // cloning it would put a chunk of the cost back on the main thread, which is
  // the whole thing this is here to avoid.
  (self as unknown as Worker).postMessage(response, [response.data.buffer]);
};
