// The pure half of the art "dry" mask (docs/design/water-shader.md §4.4b).
//
// The water shader draws caustics and foam over the painted water tiles. Where
// the art on a sea hex is not plain water (a rock, a boat, a dock, a hut, their
// reflections) the shader must stay off it. This file decides, per pixel,
// which pixels of a sea-hex art frame are such objects, by comparing the frame
// with the plain water tile of the same orientation. It runs at build time
// (build/waterDryMasks.ts feeds it the decoded atlas pages) and works on plain
// RGBA byte arrays, so it needs no image library and is unit-testable.

/** The 200x300 canvas every tile frame is cut from. */
export const SOURCE_W = 200;
export const SOURCE_H = 300;

/** A frame placed on the full source canvas: RGBA8, `SOURCE_W * SOURCE_H * 4` bytes. */
export type Canvas = Uint8Array | Uint8ClampedArray;

/**
 * Two pixels count as "the same" when both are opaque and no RGB channel
 * differs by more than this. Lossless art differs by exactly 0 where the
 * reference water shows through; a small slack absorbs render noise between
 * variants of one water tile. Colour-independent: a blue sail is dry because it
 * differs from the reference pixel at that spot, not because of its hue.
 */
export const SAME_PIXEL_EPS = 6;

/** Alpha at or above which a pixel counts as opaque. */
/**
 * How far (max RGB channel) a pixel of the art may differ from the plain water tile and still count as water for the dry mask.
 * Higher than `SAME_PIXEL_EPS`: the art's soft ambient shadow on the water (a few levels darker, dithered) stays water, so foam
 * and caustics are cut only at the object and its contact shadow, not along a speckled halo around it.
 */
export const DRY_PIXEL_EPS = 20;

export const OPAQUE_ALPHA = 128;

/**
 * A frame is water-based art (and gets a mask) when at least this share of the
 * reference water tile's opaque pixels are the same in it. Measured over the
 * vendored art: water-based frames (coastal variants, huts, docks, palisades,
 * ice) score 0.57 and up, every land tile 0.14 or less.
 */
export const WATER_MATCH_MIN_RATIO = 0.4;

/** Reference (plain water) base frames: the art a sea hex is compared against. */
export const REFERENCE_FRAME_RE = /^(coastalwatertile|watertile|taintedwater|blacksandcoast|icecoast)_(E|NE|NW|SE|SW|W)_base$/;

/**
 * Reference frames of the bog lake: the plain lake tile of each orientation. Every other `boglake*` frame (inlet, shore,
 * half, mouth, art variants) is compared against the one of its own orientation to find the lake water in it
 * (docs/design/water-shader.md, "Bog lakes").
 */
export const LAKE_REFERENCE_FRAME_RE = /^boglake_(E|NE|NW|SE|SW|W)_base$/;

/** Every bog lake `_base` frame: the plain lake, `inlet`, `shore`, `half` and `mouth` families, with or without art variants. */
export const LAKE_FRAME_RE = /^boglake(_(inlet|shore|half|mouth))?_(E|NE|NW|SE|SW|W)(_variant\d+)?_base$/;

/** The orientation token of a frame name, or null. */
export function orientationOf(frameName: string): string | null {
  return /_(E|NE|NW|SE|SW|W)_/.exec(frameName)?.[1] ?? null;
}

/** Share of `reference`'s opaque pixels that `art` repeats (both opaque, RGB within `SAME_PIXEL_EPS`). */
export function matchRatio(art: Canvas, reference: Canvas): number {
  let opaque = 0;
  let same = 0;
  for (let i = 0; i < reference.length; i += 4) {
    if (reference[i + 3] < OPAQUE_ALPHA) continue;
    opaque++;
    if (isSame(art, reference, i)) same++;
  }
  return opaque === 0 ? 0 : same / opaque;
}

function isSame(art: Canvas, reference: Canvas, i: number, eps = SAME_PIXEL_EPS): boolean {
  return (
    art[i + 3] >= OPAQUE_ALPHA &&
    Math.abs(art[i] - reference[i]) <= eps &&
    Math.abs(art[i + 1] - reference[i + 1]) <= eps &&
    Math.abs(art[i + 2] - reference[i + 2]) <= eps
  );
}

/** Binary dilation (`grow`) or erosion (`!grow`) by a square of `radius`; outside the canvas counts as not dry. */
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

/**
 * The best reference for `art`: the one it repeats the largest share of. Returns
 * its index and ratio, or null for an empty list.
 */
export function bestReference(art: Canvas, references: readonly Canvas[]): { index: number; ratio: number } | null {
  let best: { index: number; ratio: number } | null = null;
  for (const [index, reference] of references.entries()) {
    const ratio = matchRatio(art, reference);
    if (!best || ratio > best.ratio) best = { index, ratio };
  }
  return best;
}

/**
 * The dry mask of `art` against `reference`, at half resolution.
 *
 * Dry = art opaque AND (reference transparent OR RGB differs by more than
 * `DRY_PIXEL_EPS`). The 0/1 map is closed and grown by one source pixel (so the
 * shader stops just outside the object's outline, not on it) and box-downsampled 2x2,
 * which makes the edge soft. Output is `(SOURCE_W / 2) * (SOURCE_H / 2)` bytes,
 * 255 = dry.
 */
export function dryMaskHalf(art: Canvas, reference: Canvas, width = SOURCE_W, height = SOURCE_H): Uint8Array {
  const dry = new Uint8Array(width * height);
  for (let p = 0; p < dry.length; p++) {
    const i = p * 4;
    if (art[i + 3] < OPAQUE_ALPHA) continue;
    dry[p] = reference[i + 3] < OPAQUE_ALPHA || !isSame(art, reference, i, DRY_PIXEL_EPS) ? 1 : 0;
  }

  // Close (grow 2, shrink 1): fills the pinholes the dithered render leaves inside an object and leaves the mask 1 px wider
  // than the object, so neither foam nor caustics show a seam along its edge.
  const dilated = morph(morph(dry, width, height, 2, true), width, height, 1, false);

  return downsampleHalf(dilated, width, height);
}

/**
 * Whether the reference pixel at byte offset `i` is lake water: opaque and blue-dominant. The blue test is what keeps the
 * tile prism's side faces (which repeat the reference as well, but are earth, not water) out of the lake mask.
 */
export function isLakeWaterPixel(reference: Canvas, i: number): boolean {
  return reference[i + 3] >= OPAQUE_ALPHA && reference[i + 2] > reference[i] + 15 && reference[i + 2] > reference[i + 1] + 5;
}

/**
 * The lake wet mask of `art` against `reference` (the plain lake tile of the same orientation), at half resolution.
 *
 * Wet = the reference pixel is lake water (`isLakeWaterPixel`) AND the art repeats it within `DRY_PIXEL_EPS`, so the
 * bank, the rocks, a creek's brighter water and the prism's sides are all not wet. The 0/1 map is eroded by one source
 * pixel (the opposite of `dryMaskHalf`'s growth: the effect stays off the bank outline) and box-downsampled 2x2, which
 * makes the edge soft. Output is `(SOURCE_W / 2) * (SOURCE_H / 2)` bytes, 255 = wet.
 */
export function lakeWetMaskHalf(art: Canvas, reference: Canvas, width = SOURCE_W, height = SOURCE_H): Uint8Array {
  const wet = new Uint8Array(width * height);
  for (let p = 0; p < wet.length; p++) {
    const i = p * 4;
    if (isLakeWaterPixel(reference, i) && isSame(art, reference, i, DRY_PIXEL_EPS)) wet[p] = 1;
  }
  return downsampleHalf(morph(wet, width, height, 1, false), width, height);
}

/** Box-downsamples a 0/1 map 2x2 to 0..255. */
function downsampleHalf(bits: Uint8Array, width: number, height: number): Uint8Array {
  const halfW = width >> 1;
  const halfH = height >> 1;
  const out = new Uint8Array(halfW * halfH);
  for (let y = 0; y < halfH; y++) {
    for (let x = 0; x < halfW; x++) {
      const i = 2 * y * width + 2 * x;
      out[y * halfW + x] = Math.round((255 * (bits[i] + bits[i + 1] + bits[i + width] + bits[i + width + 1])) / 4);
    }
  }
  return out;
}

/** Where a frame's mask cell sits in the packed atlas, and which part of the source canvas it covers. */
export interface DryMaskFrame {
  /** Cell origin in the mask atlas (texels). */
  x: number;
  y: number;
  /** The source-canvas rect the cell covers (source px, even-aligned: the cell is half this size). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** One packed mask atlas: a grey+alpha PNG whose alpha is the mask, and where each frame's cell sits in it. */
export interface MaskAtlasData {
  /** `data:image/png;base64,...` — a grey+alpha PNG whose alpha is the dry mask. */
  url: string;
  /** Atlas size in texels. */
  width: number;
  height: number;
  frames: Record<string, DryMaskFrame>;
}

/**
 * What the `virtual:water-dry-masks` module exports: the sea hexes' dry masks, plus under `lake` the bog lakes' wet masks
 * (`lakeWetMaskHalf`) in an atlas of their own.
 */
export interface WaterDryMasksData extends MaskAtlasData {
  lake: MaskAtlasData;
}

/** A frame's trim rect on the source canvas (the atlas's `spriteSourceSize`). */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The even-aligned source rect covering `trim`, so a half-resolution cell maps
 * onto it exactly (2 source px per texel).
 */
export function cellSourceRect(trim: SourceRect): { sx: number; sy: number; sw: number; sh: number } {
  const sx = trim.x & ~1;
  const sy = trim.y & ~1;
  const ex = (trim.x + trim.w + 1) & ~1;
  const ey = (trim.y + trim.h + 1) & ~1;
  return { sx, sy, sw: ex - sx, sh: ey - sy };
}

/** Copies the half-resolution rect for `rect` (from `cellSourceRect`) out of a full-canvas half mask. */
export function cropHalf(half: Uint8Array, rect: { sx: number; sy: number; sw: number; sh: number }): Uint8Array {
  const halfW = SOURCE_W >> 1;
  const cw = rect.sw >> 1;
  const ch = rect.sh >> 1;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const from = ((rect.sy >> 1) + y) * halfW + (rect.sx >> 1);
    out.set(half.subarray(from, from + cw), y * cw);
  }
  return out;
}
