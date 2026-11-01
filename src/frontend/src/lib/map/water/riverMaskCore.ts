// The pure half of the river water mask (docs/design/water-shader.md §4.4d).
//
// The river flow shader animates the painted river, stream and bog-creek water.
// To know which pixels of a river tile frame are that water, this file picks
// them by colour from the decoded art. It runs at build time
// (build/waterDryMasks.ts feeds it the decoded atlas pages) and works on plain
// RGBA byte arrays, so it needs no image library and is unit-testable.
import { OPAQUE_ALPHA, SOURCE_H, SOURCE_W, type Canvas } from './dryMaskCore.ts';

/**
 * A pixel is river water when its blue channel leads red by more than this (and is not below green).
 * Measured over the vendored art: river and creek water is navy (about 16,48..64,96..128), streams cyan
 * (about 64..80,144..160,160..192), so blue leads red by 80 and more. Grass, sand, rocks and cliff skirts
 * are red- or green-led and stay far below that margin.
 */
export const RIVER_BLUE_OVER_RED = 40;

/** Frames get a river mask only when it has at least this many water texels (full resolution). */
export const RIVER_MASK_MIN_TEXELS = 50;

/**
 * The `_base` frame families that carry painted river water: river tiles, bog creeks and the creek mouth of a bog lake,
 * and the buildings drawn on a river hex. Frozen rivers, lava streams and plain bog lakes are not in it.
 */
export const RIVER_FRAME_RE =
  /^(rivertile|bogcreek|boglake_mouth|sawmill|sawmillriver|sawmillbend|sawmillbend60|cropmill|hammerschmiede|riverbridge|bearrapids)(_|$)/;

/** True for an opaque pixel whose colour is river or stream water. */
export function isRiverWater(r: number, g: number, b: number, a: number): boolean {
  return a >= OPAQUE_ALPHA && b > r + RIVER_BLUE_OVER_RED && b >= g;
}

/** Binary dilation (`grow`) or erosion (`!grow`) by a square of `radius`; outside the canvas counts as not water. */
function morph(src: Uint8Array, width: number, height: number, radius: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = grow ? 0 : 1;
      for (let dy = -radius; dy <= radius && v === (grow ? 0 : 1); dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const s = xx >= 0 && xx < width && yy >= 0 && yy < height ? src[yy * width + xx] : 0;
          if (grow ? s : !s) {
            v = grow ? 1 : 0;
            break;
          }
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Number of water texels in the full-resolution 0/1 map of `canvas` (before closing). */
export function riverTexelCount(canvas: Canvas, width = SOURCE_W, height = SOURCE_H): number {
  let n = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (isRiverWater(canvas[i], canvas[i + 1], canvas[i + 2], canvas[i + 3])) n++;
  }
  return n;
}

/**
 * The river water mask of `canvas` at half resolution.
 *
 * Water = `isRiverWater`. The 0/1 map is closed (grow 1, shrink 1) to fill the pinholes the dithered render leaves, then
 * box-downsampled 2x2. Output is `(SOURCE_W / 2) * (SOURCE_H / 2)` bytes, 255 = water.
 */
export function riverMaskHalf(canvas: Canvas, width = SOURCE_W, height = SOURCE_H): Uint8Array {
  const water = new Uint8Array(width * height);
  for (let p = 0; p < water.length; p++) {
    const i = p * 4;
    if (isRiverWater(canvas[i], canvas[i + 1], canvas[i + 2], canvas[i + 3])) water[p] = 1;
  }
  const closed = morph(morph(water, width, height, 1, true), width, height, 1, false);

  const halfW = width >> 1;
  const halfH = height >> 1;
  const out = new Uint8Array(halfW * halfH);
  for (let y = 0; y < halfH; y++) {
    for (let x = 0; x < halfW; x++) {
      const i = 2 * y * width + 2 * x;
      out[y * halfW + x] = Math.round((255 * (closed[i] + closed[i + 1] + closed[i + width] + closed[i + width + 1])) / 4);
    }
  }
  return out;
}

/** True when a frame of this name gets a river mask (before the texel-count check). */
export function hasRiverWater(frameName: string): boolean {
  return RIVER_FRAME_RE.test(frameName);
}
