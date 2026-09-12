// The water-mask bake, off the main thread.
//
// The bake is the single most expensive thing the renderer does — even after
// the per-texel work was cut to a third, a zoomed-out map's ~600k texels still
// take a few hundred milliseconds — and it is pure CPU with no DOM or GPU in
// it, which is exactly the shape of work a worker is for. Run inline it is a
// frozen frame; run here it is a few hundred milliseconds during which the sea
// is drawn with the mask it already had, and then is not.
//
// Both modes bake here. That was not true at first: the bake's one impure
// input is `hasWaterProp`, which needs to know whether a hex carries a
// *building*, and buildings are live game state this thread has no copy of —
// so settlement mode, the only mode that reads that channel, stayed on the
// main thread. Which made the settlement view the worse of the two by a wide
// margin at full zoom-out: a ~300ms stall against the world map's none.
//
// The fix is that "which hexes carry a building" is a *short list*, not a
// lookup: a settlement has a few dozen, and the request carries them. Every
// other input to `hasWaterProp` — sea, coastal, variant — is a pure function
// of the world seed and is computed here.
import { bakeWaterMask, hasWaterProp } from './waterMask';
import { generateTile, terrainAt, type WorldGenerationConstants } from '../worldGenerator';
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
   * Hexes that currently carry a building, packed with `hexKey`.
   *
   * Only settlement mode sends them, and only because a building replaces the
   * coastal-water art the prop mute exists to protect (a fishing hut or
   * dockyard draws its own tile, so there is no painted boat or rock under the
   * foam). Empty — the world-mode case — means the A channel is not read at
   * all and no prop work is done.
   */
  buildingHexes?: number[];
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

/** `WorldModel`'s own packing, so the two agree about what a hex key is. */
function hexKey(q: number, r: number): number {
  return ((((q | 0) + 0x8000) << 16) | (((r | 0) + 0x8000) & 0xffff)) | 0;
}

function isLandFor(seed: number, generation: WorldGenerationConstants) {
  if (cacheSeed !== seed) {
    cacheSeed = seed;
    cache = new Map();
  }
  const world = { seed, generation };
  return (q: number, r: number): boolean => {
    const k = hexKey(q, r);
    let land = cache.get(k);
    if (land === undefined) {
      land = terrainAt(q, r, world) !== 'sea';
      cache.set(k, land);
    }
    return land;
  };
}

/** `neighbors()`'s directions, as scalars — this runs per sea hex in the region. */
const NEIGHBOR_DQ = [1, 1, 0, -1, -1, 0];
const NEIGHBOR_DR = [0, -1, -1, 0, 1, 1];

/**
 * `hasWaterProp` for a hex, without a `Tile` to read it off.
 *
 * Two things keep this cheap. It is asked once per water *texel*, so the
 * answer is cached per hex — a hex spans dozens of texels. And a hex can only
 * carry a prop if it is coastal water, which is seven cached `isLand` lookups,
 * so the far more expensive `generateTile` (which is what actually decides the
 * variant, and therefore whether there is a prop at all) runs only for the
 * thin ring of hexes where the answer can be yes.
 *
 * `generateTile` rather than a reimplementation of the variant roll, so this
 * cannot drift from what the renderer actually draws — that art is picked from
 * the same tile.
 */
function hasPropFor(
  seed: number,
  generation: WorldGenerationConstants,
  isLand: (q: number, r: number) => boolean,
  buildingHexes: number[],
) {
  const world = { seed, generation };
  const buildings = new Set(buildingHexes);
  const sample = (q: number, r: number) => (isLand(q, r) ? ('grass' as const) : ('sea' as const));
  const props = new Map<number, boolean>();
  return (q: number, r: number): boolean => {
    const k = hexKey(q, r);
    const cached = props.get(k);
    if (cached !== undefined) return cached;
    let answer = false;
    // Only coastal water can carry one, and a hex with a building on it draws
    // the building instead.
    if (!isLand(q, r) && !buildings.has(k)) {
      for (let i = 0; i < 6; i++) {
        if (!isLand(q + NEIGHBOR_DQ[i], r + NEIGHBOR_DR[i])) continue;
        answer = hasWaterProp(generateTile(q, r, world, sample));
        break;
      }
    }
    props.set(k, answer);
    return answer;
  };
}

self.onmessage = (event: MessageEvent<BakeRequest>) => {
  const { id, region, tileWidth, tileHeight, seed, generation, buildingHexes } = event.data;
  const started = performance.now();
  const isLand = isLandFor(seed, generation);
  // No prop predicate at all where the caller sent no building list: that is
  // the documented way to ask for an all-zero A channel, and it is what world
  // mode reads anyway (see this file's header).
  const mask = bakeWaterMask(region, tileWidth, tileHeight, {
    isLand,
    hasProp: buildingHexes ? hasPropFor(seed, generation, isLand, buildingHexes) : undefined,
  });
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
