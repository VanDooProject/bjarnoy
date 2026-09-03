// Where the water mask sits in world space, and how world coordinates map
// onto its UVs — docs/design/water-shader.md §2.2.
//
// Deliberately *not* the fog mask's layout (fogMaskLayout.ts). That one lives
// in the hex "doubled-row" texel lattice because it mirrors a backend format;
// a euclidean distance transform over a hex-anchored lattice produces
// hexagonal contours, which is the exact artifact fogShader's whole edgeBand()
// machinery exists to undo. A ring of hexagonal foam around every island would
// be worse than no foam, so the water mask gets a plain axis-aligned grid of
// square texels instead, and its contours come out round.
//
// It is also viewport-anchored rather than world-anchored: demo worlds are
// boundless (WorldModel has no stored radius — see demoFogMask's
// DEMO_MASK_RADIUS note), so a world-covering mask would have to be either
// enormous or too coarse to resolve a foam band.

/** A world-space axis-aligned rectangle. Matches `visibleWorldRect`'s shape (camera.ts). */
export interface WorldRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Texels across one tile width. With TILE_W = 168 one texel is 21 world
 * units, so a half-hex foam band resolves into ~4 texels — enough given §4.3
 * perturbs the band with noise anyway.
 */
export const MASK_TEXELS_PER_TILE = 8;

/**
 * Cap on the long edge, so a zoomed-out world map can't ask for a
 * multi-megatexel bake.
 *
 * This, not MASK_TEXELS_PER_TILE, is the binding constraint in practice — the
 * spike (§11) ran at 512 and the distance contours visibly stair-stepped at
 * low zoom, which the wave coast-fade reads right through. 1024 quadruples
 * the texel count in the clamped case but the bake is linear and still well
 * under a millisecond there; `waterMaskBakeMs` in FogPerfPanel is how that
 * claim stays honest.
 */
export const MASK_MAX_TEXELS = 1024;

/**
 * How far past the viewport the mask reaches, in tile widths. The point is
 * that a small pan does not need a re-bake: `waterMaskCovers` stays true until
 * the camera has walked most of this out, and rebuildAll's own
 * `cameraMovedEnough` threshold (0.4 tiles) is comfortably inside it.
 */
export const MASK_MARGIN_TILES = 3;

export interface WaterMaskRegion {
  /** The world rect this mask covers — exactly `width x height` square texels. */
  rect: WorldRect;
  width: number;
  height: number;
  /** Side length of one texel in world units (square by construction). */
  texelWorldSize: number;
}

/**
 * The region to bake for a given viewport rect: inflated by
 * MASK_MARGIN_TILES and snapped outward onto a world-anchored texel grid.
 *
 * The snap is what keeps the mask *stable* under panning. Without it every
 * re-bake lands the texel centres on a slightly different set of world
 * points, so the distance field — and with it the foam's ragged edge — jitters
 * by up to a texel each time the camera moves far enough to trigger one.
 * Anchoring the grid at the world origin means a texel covers the same world
 * square in every bake, and successive masks agree exactly on their overlap.
 */
export function waterMaskRegion(viewport: WorldRect, tileWidth: number): WaterMaskRegion {
  const margin = MASK_MARGIN_TILES * tileWidth;
  const wantMinX = viewport.minX - margin;
  const wantMinY = viewport.minY - margin;
  const wantW = viewport.maxX - viewport.minX + margin * 2;
  const wantH = viewport.maxY - viewport.minY + margin * 2;

  // Ideal texel size, coarsened only as far as the budget forces. Because
  // texelWorldSize >= longestEdge / MASK_MAX_TEXELS, neither ceil below can
  // exceed MASK_MAX_TEXELS.
  const longestEdge = Math.max(wantW, wantH);
  const texelWorldSize = Math.max(tileWidth / MASK_TEXELS_PER_TILE, longestEdge / MASK_MAX_TEXELS);

  const minX = Math.floor(wantMinX / texelWorldSize) * texelWorldSize;
  const minY = Math.floor(wantMinY / texelWorldSize) * texelWorldSize;
  const width = Math.max(2, Math.ceil((wantMinX + wantW - minX) / texelWorldSize));
  const height = Math.max(2, Math.ceil((wantMinY + wantH - minY) / texelWorldSize));

  return {
    rect: {
      minX,
      minY,
      maxX: minX + width * texelWorldSize,
      maxY: minY + height * texelWorldSize,
    },
    width,
    height,
    texelWorldSize,
  };
}

/** Whether an already-baked region still covers `viewport` — false means re-bake. */
export function waterMaskCovers(region: WaterMaskRegion, viewport: WorldRect): boolean {
  const { rect } = region;
  return (
    viewport.minX >= rect.minX && viewport.maxX <= rect.maxX && viewport.minY >= rect.minY && viewport.maxY <= rect.maxY
  );
}

/**
 * World -> mask-UV affine: `uv = world * scale + offset`.
 *
 * No half-texel correction, unlike `fogMaskPlacement`. That one needs two
 * (a hex is placed by its bounding-box corner, and a texture samples texel `i`
 * at `(i + 0.5) / size`) because its grid is anchored to hex positions. This
 * grid is anchored to the rect itself and `bakeWaterMask` samples texel `i` at
 * the world point `(i + 0.5)` texels in — the two conventions are already the
 * same one, so the plain affine is exact.
 */
export function waterMaskPlacement(region: WaterMaskRegion): {
  scale: [number, number];
  offset: [number, number];
} {
  const worldW = region.rect.maxX - region.rect.minX;
  const worldH = region.rect.maxY - region.rect.minY;
  return {
    scale: [1 / worldW, 1 / worldH],
    offset: [-region.rect.minX / worldW, -region.rect.minY / worldH],
  };
}
