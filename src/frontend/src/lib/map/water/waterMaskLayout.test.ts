import { describe, expect, it } from 'vitest';
import {
  MASK_MARGIN_TILES,
  MASK_MAX_TEXELS,
  MASK_TEXELS_PER_TILE,
  waterMaskCovers,
  waterMaskPlacement,
  waterMaskRegion,
  type WorldRect,
} from './waterMaskLayout';

const TILE_W = 168;

function viewport(cx: number, cy: number, halfW: number, halfH: number): WorldRect {
  return { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
}

describe('waterMaskRegion', () => {
  it('covers the viewport plus the margin', () => {
    const view = viewport(0, 0, 900, 500);
    const region = waterMaskRegion(view, TILE_W);
    const margin = MASK_MARGIN_TILES * TILE_W;

    expect(region.rect.minX).toBeLessThanOrEqual(view.minX - margin);
    expect(region.rect.maxX).toBeGreaterThanOrEqual(view.maxX + margin);
    expect(region.rect.minY).toBeLessThanOrEqual(view.minY - margin);
    expect(region.rect.maxY).toBeGreaterThanOrEqual(view.maxY + margin);
  });

  it('uses square texels that tile the rect exactly', () => {
    const region = waterMaskRegion(viewport(37, -211, 640, 360), TILE_W);
    expect(region.rect.maxX - region.rect.minX).toBeCloseTo(region.width * region.texelWorldSize, 6);
    expect(region.rect.maxY - region.rect.minY).toBeCloseTo(region.height * region.texelWorldSize, 6);
  });

  it('resolves a tile into MASK_TEXELS_PER_TILE texels while the budget allows', () => {
    const region = waterMaskRegion(viewport(0, 0, 400, 300), TILE_W);
    expect(region.texelWorldSize).toBeCloseTo(TILE_W / MASK_TEXELS_PER_TILE, 6);
  });

  it('clamps the long edge at MASK_MAX_TEXELS when zoomed far out', () => {
    // Far enough out that the ideal 8-texels-per-tile grid would want tens of
    // thousands of texels on the long edge.
    const region = waterMaskRegion(viewport(0, 0, 400_000, 200_000), TILE_W);
    expect(Math.max(region.width, region.height)).toBeLessThanOrEqual(MASK_MAX_TEXELS);
    expect(region.texelWorldSize).toBeGreaterThan(TILE_W / MASK_TEXELS_PER_TILE);
  });

  it('snaps to a world-anchored texel grid, so two overlapping bakes agree on their texel centres', () => {
    // The stability property waterMaskRegion's comment claims: pan by an
    // arbitrary non-texel amount and the grid lands on the same world points.
    const a = waterMaskRegion(viewport(0, 0, 600, 400), TILE_W);
    const b = waterMaskRegion(viewport(137.4, -59.9, 600, 400), TILE_W);

    expect(b.texelWorldSize).toBeCloseTo(a.texelWorldSize, 9);
    const offset = (b.rect.minX - a.rect.minX) / a.texelWorldSize;
    expect(offset).toBeCloseTo(Math.round(offset), 9);
    const offsetY = (b.rect.minY - a.rect.minY) / a.texelWorldSize;
    expect(offsetY).toBeCloseTo(Math.round(offsetY), 9);
  });
});

describe('waterMaskCovers', () => {
  const region = waterMaskRegion(viewport(0, 0, 600, 400), TILE_W);

  it('is true for the viewport it was built for', () => {
    expect(waterMaskCovers(region, viewport(0, 0, 600, 400))).toBe(true);
  });

  it('survives a pan well past rebuildAll’s own 0.4-tile threshold', () => {
    expect(waterMaskCovers(region, viewport(TILE_W, 0, 600, 400))).toBe(true);
  });

  it('is false once the viewport leaves the covered region', () => {
    expect(waterMaskCovers(region, viewport(MASK_MARGIN_TILES * TILE_W + 200, 0, 600, 400))).toBe(false);
    expect(waterMaskCovers(region, viewport(0, 0, 6000, 400))).toBe(false);
  });
});

describe('waterMaskPlacement', () => {
  it('round-trips a texel centre to its own UV', () => {
    const region = waterMaskRegion(viewport(120, -80, 500, 300), TILE_W);
    const { scale, offset } = waterMaskPlacement(region);

    for (const [tx, ty] of [
      [0, 0],
      [1, 5],
      [region.width - 1, region.height - 1],
    ]) {
      const worldX = region.rect.minX + (tx + 0.5) * region.texelWorldSize;
      const worldY = region.rect.minY + (ty + 0.5) * region.texelWorldSize;
      // What the shader computes, and then what a sampler does with it.
      expect((worldX * scale[0] + offset[0]) * region.width - 0.5).toBeCloseTo(tx, 6);
      expect((worldY * scale[1] + offset[1]) * region.height - 0.5).toBeCloseTo(ty, 6);
    }
  });

  it('maps the rect corners onto the 0..1 UV box', () => {
    const region = waterMaskRegion(viewport(0, 0, 500, 300), TILE_W);
    const { scale, offset } = waterMaskPlacement(region);
    expect(region.rect.minX * scale[0] + offset[0]).toBeCloseTo(0, 9);
    expect(region.rect.maxX * scale[0] + offset[0]).toBeCloseTo(1, 9);
    expect(region.rect.minY * scale[1] + offset[1]).toBeCloseTo(0, 9);
    expect(region.rect.maxY * scale[1] + offset[1]).toBeCloseTo(1, 9);
  });
});
