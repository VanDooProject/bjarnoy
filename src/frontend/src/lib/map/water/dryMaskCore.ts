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
/**
 * The tile's flat top face inside the source canvas: the `isoTopPoints` hexagon, `SOURCE_W` wide, starting `TOP_FACE_Y` px
 * down and `TOP_FACE_H` px tall — the atlas manifests' `meta.bjarnoy.tile.topFaceY`/`topFaceH` (the build checks they agree).
 */
export const TOP_FACE_Y = 140;
export const TOP_FACE_H = 92;

/**
 * How far inside the top face's front edges the dry mask stops, in source px. Everything below those edges (the skirt, and
 * the face's own antialiased rim) is painted over on screen by the hexes in front, so a dry pixel there would cut the
 * caustics and foam of *their* water; the inset keeps the closed, grown mask off the rim too.
 */
export const FRONT_EDGE_INSET = 2;

/** Whether source pixel (x, y) is above the top face's lower outline (left vertex → bottom edge → right vertex), less `inset`. */
export function aboveFrontEdges(x: number, y: number, inset = FRONT_EDGE_INSET): boolean {
  const cy = TOP_FACE_Y + TOP_FACE_H / 2;
  const bottom = TOP_FACE_Y + TOP_FACE_H;
  const px = x + 0.5;
  const py = y + 0.5;
  // Lower outline as a function of x: rises from the side vertices (cy) to the bottom edge (bottom) over a quarter width.
  const q = SOURCE_W / 4;
  const t = Math.min(1, Math.min(px, SOURCE_W - px) / q);
  const edgeY = cy + (bottom - cy) * t;
  // Distance to a sloped edge is shorter than the vertical gap; scale the inset by the slope so it is a true perpendicular inset.
  const slope = t < 1 ? (bottom - cy) / q : 0;
  return py <= edgeY - inset * Math.sqrt(1 + slope * slope);
}

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
 * Luminance darkening at which art-painted water shadow counts as full shade. A soft shadow in the art is a few percent darker
 * than the plain water (it stays below `DRY_PIXEL_EPS`, so it is not dry). Light through clear water does not appear in shade,
 * so the darkening becomes a shade factor; a quarter darker reads as deep shade, so it maps to the full 1 and anything softer
 * scales linearly: a faint shadow dims caustics and foam a little, a deep one removes the caustics.
 */
export const SHADOW_FULL_DARKENING = 0.25;

/** Radius (source px) of the box blur smoothing the shadow channel; the render is dithered, so raw per-pixel darkening is speckled. */
export const SHADOW_BLUR_RADIUS = 2;

/** Rec.709 luma of the pixel at byte offset `i`. */
function luma(c: Canvas, i: number): number {
  return 0.2126 * c[i] + 0.7152 * c[i + 1] + 0.0722 * c[i + 2];
}

/** Box blur of radius `radius` (square window, outside the canvas counts as 0), separable. */
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const n = 2 * radius + 1;
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < width) sum += src[y * width + xx];
      }
      tmp[y * width + x] = sum / n;
    }
  }
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < height) sum += tmp[yy * width + x];
      }
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

/** The two half-resolution mask channels of one frame; both are `(SOURCE_W / 2) * (SOURCE_H / 2)` bytes. */
export interface ArtMasksHalf {
  /** 255 = dry (not plain water). */
  dry: Uint8Array;
  /** 255 = full shade painted on the water by the art (`SHADOW_FULL_DARKENING` or more darker than the plain water). */
  shadow: Uint8Array;
}

/** Box-downsamples a full-canvas 0..1 map 2x2 to bytes. */
function downsampleHalf(map: ArrayLike<number>, width: number, height: number): Uint8Array {
  const halfW = width >> 1;
  const halfH = height >> 1;
  const out = new Uint8Array(halfW * halfH);
  for (let y = 0; y < halfH; y++) {
    for (let x = 0; x < halfW; x++) {
      const i = 2 * y * width + 2 * x;
      out[y * halfW + x] = Math.round((255 * (map[i] + map[i + 1] + map[i + width] + map[i + width + 1])) / 4);
    }
  }
  return out;
}

/**
 * The dry and shadow masks of `art` against `reference`, at half resolution.
 *
 * Dry = art opaque AND (reference transparent OR RGB differs by more than
 * `DRY_PIXEL_EPS`). The 0/1 map is closed and grown by one source pixel (so the
 * shader stops just outside the object's outline, not on it), cleared below the
 * top face's front edges (`aboveFrontEdges`) and box-downsampled 2x2,
 * which makes the edge soft.
 *
 * Shadow = where art and reference are both opaque and the pixel is not dry, the
 * Rec.709 luma darkening `max(0, lumRef - lumArt) / max(lumRef, 1)` divided by
 * `SHADOW_FULL_DARKENING` and clamped to 0..1; dry pixels and brighter pixels
 * are 0. Blurred by `SHADOW_BLUR_RADIUS`, then cleared below the front edges and
 * downsampled like dry. The shader dims caustics and darkens foam by it.
 *
 * 255 = fully dry / fully shaded.
 */
export function artMasksHalf(art: Canvas, reference: Canvas, width = SOURCE_W, height = SOURCE_H): ArtMasksHalf {
  const dry = new Uint8Array(width * height);
  const shade = new Float32Array(width * height);
  for (let p = 0; p < dry.length; p++) {
    const i = p * 4;
    if (art[i + 3] < OPAQUE_ALPHA) continue;
    const isDry = reference[i + 3] < OPAQUE_ALPHA || !isSame(art, reference, i, DRY_PIXEL_EPS);
    dry[p] = isDry ? 1 : 0;
    if (isDry) continue;
    const lumRef = luma(reference, i);
    const darkening = Math.max(0, lumRef - luma(art, i)) / Math.max(lumRef, 1);
    shade[p] = Math.min(1, darkening / SHADOW_FULL_DARKENING);
  }

  // Close (grow 2, shrink 1): fills the pinholes the dithered render leaves inside an object and leaves the mask 1 px wider
  // than the object, so neither foam nor caustics show a seam along its edge.
  const dilated = morph(morph(dry, width, height, 2, true), width, height, 1, false);
  const shadow = boxBlur(shade, width, height, SHADOW_BLUR_RADIUS);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (aboveFrontEdges(x, y)) continue;
      dilated[y * width + x] = 0;
      shadow[y * width + x] = 0;
    }
  }
  return { dry: downsampleHalf(dilated, width, height), shadow: downsampleHalf(shadow, width, height) };
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

/** What the `virtual:water-dry-masks` module exports. */
export interface WaterDryMasksData {
  /** `data:image/png;base64,...` — an RGBA PNG: R is the shadow channel, G and B are 0, A is the dry mask. */
  url: string;
  /** Atlas size in texels. */
  width: number;
  height: number;
  frames: Record<string, DryMaskFrame>;
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
