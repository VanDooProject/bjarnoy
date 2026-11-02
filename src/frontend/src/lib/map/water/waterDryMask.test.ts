import { describe, expect, it } from 'vitest';
import { SOURCE_H, SOURCE_W } from './dryMaskCore';
import { Texture } from 'pixi.js';
import { DRY_RT_MAX_SIDE, DRY_RT_PIXELS_PER_UNIT, artCanvasWorldRect, dryCellWorldRect, dryRenderTargetSize, seaDryEntries } from './waterDryMask';

describe('dryCellWorldRect', () => {
  it('puts the cell at the art sprite origin plus its source rect scaled to the tile width', () => {
    // TILE_W 168 -> 0.84 world units per source pixel.
    const rect = dryCellWorldRect({ x: 1000, y: 500 }, { sx: 10, sy: 150, sw: 180, sh: 150 }, 168);
    expect(rect.x).toBeCloseTo(1008.4, 6);
    expect(rect.y).toBeCloseTo(626, 6);
    expect(rect.w).toBeCloseTo(151.2, 6);
    expect(rect.h).toBeCloseTo(126, 6);
  });

  it('covers the whole sprite for a cell spanning the full canvas', () => {
    const cell = dryCellWorldRect({ x: 5, y: 7 }, { sx: 0, sy: 0, sw: SOURCE_W, sh: SOURCE_H }, 168);
    expect(cell).toEqual({ ...artCanvasWorldRect({ x: 5, y: 7 }, 168), x: 5, y: 7 });
    expect(cell.w).toBeCloseTo(168, 6);
    expect(cell.h).toBeCloseTo(252, 6);
  });
});

describe('dryRenderTargetSize', () => {
  it('uses the nominal resolution for a normal region', () => {
    const size = dryRenderTargetSize(1600, 800);
    expect(size.scale).toBe(DRY_RT_PIXELS_PER_UNIT);
    expect(size.width).toBe(1600 * DRY_RT_PIXELS_PER_UNIT);
    expect(size.height).toBe(800 * DRY_RT_PIXELS_PER_UNIT);
  });

  it('caps the long side', () => {
    const size = dryRenderTargetSize(8000, 3000);
    expect(size.width).toBe(DRY_RT_MAX_SIDE);
    expect(size.scale).toBeCloseTo(DRY_RT_MAX_SIDE / 8000, 9);
    expect(size.height).toBeLessThanOrEqual(DRY_RT_MAX_SIDE);
  });
});

describe('seaDryEntries', () => {
  const origin = (c: { q: number }) => ({ x: c.q * 10, y: 5 });

  it('takes every sea hex with art, at its sprite origin', () => {
    const art = Texture.WHITE;
    const entries = seaDryEntries([{ texture: art, coord: { q: 2, sea: true } }], (c) => c.sea, origin);
    expect(entries).toEqual([{ texture: art, x: 20, y: 5 }]);
  });

  it('skips a sea hex with no art yet instead of crashing the rebuild', () => {
    // A revealed wasted coast while its atlas pack is still loading: baseTextureFor has no texture for it.
    const entries = seaDryEntries([{ texture: undefined, coord: { q: 1, sea: true } }], (c) => c.sea, origin);
    expect(entries).toEqual([]);
  });

  it('skips land hexes and legacy-split crops', () => {
    const entries = seaDryEntries(
      [
        { texture: Texture.WHITE, coord: { q: 1, sea: false } },
        { texture: Texture.WHITE, coord: { q: 2, sea: true }, crop: { nativeY: 0, nativeH: 150 } },
      ],
      (c) => c.sea,
      origin,
    );
    expect(entries).toEqual([]);
  });
});
