// The art pack's base/top split, done in code for the families that don't have
// one yet — docs/design/water-shader.md §3.3.
//
// Why this exists at all: the water mesh sits above `terrainBase` and below
// `terrainTop` (§3.3's stack), so only art that rises *above* its hex's top
// face can be painted over by it — that art overhangs the hex to the north,
// which draws earlier. Every family the pack has already split has a base of
// at most 1px above the top face, so for those this is a non-issue. Four
// unsplit families genuinely stick up, and a magictower on a coastal hex with
// sea to its north gets its spire washed over (verified on screen, §11).
//
// The fix is not per-hex suppression, which was this plan's first answer and is
// wrong twice over: it would delete foam from a whole coastal hex, which is the
// one place foam exists to be, and magictower's 102px overhang exceeds the 92px
// row pitch, so suppressing a single hex would not even be sufficient.
//
// Instead the texture is cut at exactly the y the pack itself cuts at and the
// two halves are routed like a real split — so this is the art split done in
// code ahead of time, not a hack around the art, and it deletes unchanged once
// the pack ships. What makes it correct is layer order, not any measurement:
// `terrainTop` is added to `world` after the water mesh, so anything routed
// there draws above it by construction, however tall the art is.
import { Rectangle, Texture } from 'pixi.js';
import { TILE_ART_NATIVE_H, TILE_ART_NATIVE_W, TILE_ART_TOPFACE_Y_FRAC } from '../textures';

/**
 * The families the pack has no `top/` half for **and** whose art rises above
 * the top face. Measured from the art by *first row with at least 5 opaque
 * pixels*, not by the raw alpha bounding box — some files carry a stray
 * near-transparent row at the very top of the canvas, which a raw bbox reads as
 * a full-height overhang (`top/foresttile_*` measures 139px raw and 48px real).
 *
 *   mountaintile 66px · magictower 102px · dockyard 25px · towerbuilding 20px
 *
 * The row pitch is 92px, so only magictower (1.11 rows) reaches well past its
 * own hex; mountaintile is 0.72 and the rest under a third.
 *
 * The other unsplit families — watertile, coastalwatertile, sandtile,
 * fishinghutbuilding — are flat-topped at 0-1px and need nothing. That
 * distinction matters: keying this on "is it legacy" rather than on the
 * measurement would put sand, the most common terrain on any coastline, through
 * a split it does not need.
 *
 * This set is the only *performance* filter here; the predicate for splitting at
 * all is structural (`topTextureFor` returning nothing already means "unsplit").
 * Empty once the pack ships these split, at which point this whole module goes
 * — see water-shader.md §10's note to link that work back to this one.
 */
export const LEGACY_TALL_KEYS: ReadonlySet<string> = new Set(['mountain', 'magictower', 'tower', 'dockyard']);

/** Native-pixel y the pack cuts a split family's art at — the top of the top face. */
const SPLIT_Y = Math.round(TILE_ART_NATIVE_W * TILE_ART_TOPFACE_Y_FRAC);

export interface TilePiece {
  /** Native-pixel y where this piece starts inside the 200x300 art. */
  nativeY: number;
  /** Native-pixel height of the piece. */
  nativeH: number;
  texture: Texture;
}

// Sub-texture views are cheap but not free (each is a Texture object with its
// own frame), and rebuildTerrain runs on every camera move — so cut each source
// texture once. Weak so a texture pack swap doesn't pin the old frames alive.
const splitCache = new WeakMap<Texture, { base: TilePiece; top: TilePiece }>();

/**
 * Cuts one unsplit tile texture into its below-top-face and above-top-face
 * halves.
 *
 * The lower piece (top face + the 68px skirt) keeps its place in
 * `terrainBase`, so every existing `isoDepthKey` occlusion is untouched — no
 * reordering, and the coastline's sea/land occlusion is byte-for-byte what it
 * was. The upper piece — the part that overhangs north — goes to `terrainTop`.
 */
export function splitLegacyTexture(texture: Texture): { base: TilePiece; top: TilePiece } {
  const cached = splitCache.get(texture);
  if (cached) return cached;

  const frame = texture.frame;
  const made = {
    top: {
      nativeY: 0,
      nativeH: SPLIT_Y,
      texture: new Texture({ source: texture.source, frame: new Rectangle(frame.x, frame.y, frame.width, SPLIT_Y) }),
    },
    base: {
      nativeY: SPLIT_Y,
      nativeH: TILE_ART_NATIVE_H - SPLIT_Y,
      texture: new Texture({
        source: texture.source,
        frame: new Rectangle(frame.x, frame.y + SPLIT_Y, frame.width, frame.height - SPLIT_Y),
      }),
    },
  };
  splitCache.set(texture, made);
  return made;
}
