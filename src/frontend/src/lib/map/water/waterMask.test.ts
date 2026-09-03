import { describe, expect, it } from 'vitest';
import { isoGridPosition, isoPixelToAxial, isoTopPoints } from '../../hex/geometry';
import {
  bakeWaterMask,
  euclideanDistanceTransform,
  FOAM_BLEED_TILES,
  FOAM_REACH_TILES,
  waterNoiseSeed,
  type TerrainLookup,
} from './waterMask';
import { waterMaskRegion, type WaterMaskRegion } from './waterMaskLayout';

const TILE_W = 168;
const TILE_H = (TILE_W * 92) / 200;

/** Land everywhere at or left of `q <= boundary`, open water beyond — a straight north-south coast. */
function verticalCoast(boundary: number): TerrainLookup {
  return { isLand: (q) => q <= boundary };
}

const ALL_WATER: TerrainLookup = { isLand: () => false };
const ALL_LAND: TerrainLookup = { isLand: () => true };

function region(): WaterMaskRegion {
  return waterMaskRegion({ minX: -600, maxX: 600, minY: -400, maxY: 400 }, TILE_W);
}

function channel(mask: ReturnType<typeof bakeWaterMask>, x: number, y: number, c: 0 | 1 | 2 | 3): number {
  return mask.data[(y * mask.width + x) * 4 + c];
}

describe('euclideanDistanceTransform', () => {
  it('is zero on the seeds and exact off them', () => {
    const w = 9;
    const h = 7;
    const seeds = new Uint8Array(w * h);
    seeds[3 * w + 4] = 1;
    const d = euclideanDistanceTransform(seeds, w, h);

    expect(d[3 * w + 4]).toBe(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(d[y * w + x]).toBeCloseTo(Math.hypot(x - 4, y - 3), 5);
      }
    }
  });

  it('is exactly euclidean on a diagonal, where a chamfer is not', () => {
    // A 3-4 chamfer reads (8,8) as 32/3 = 10.67 against the true 11.31 — a 6%
    // error that is *directional*, which is what showed up as radial streaks
    // in the spike (see this transform's own comment).
    const n = 12;
    const seeds = new Uint8Array(n * n);
    seeds[0] = 1;
    const d = euclideanDistanceTransform(seeds, n, n);
    expect(d[8 * n + 8]).toBeCloseTo(Math.sqrt(128), 5);
  });

  it('saturates to a large finite distance when there are no seeds at all', () => {
    // Open ocean with no land in the region: every texel must still come out
    // finite, or the normalisation below turns the whole mask into NaN.
    const d = euclideanDistanceTransform(new Uint8Array(16), 4, 4);
    for (const v of d) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('waterNoiseSeed', () => {
  it('is deterministic per hex and varies between neighbours', () => {
    expect(waterNoiseSeed(3, -7)).toBe(waterNoiseSeed(3, -7));
    const seeds = new Set([waterNoiseSeed(0, 0), waterNoiseSeed(1, 0), waterNoiseSeed(0, 1), waterNoiseSeed(-1, 2)]);
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('fits a byte', () => {
    for (let q = -20; q <= 20; q++) {
      const s = waterNoiseSeed(q, q * 3 - 5);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(255);
    }
  });
});

describe('bakeWaterMask', () => {
  it('marks land as A=0 R=0 and open water as A=255', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(0));

    let sawLand = false;
    let sawWater = false;
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        const worldX = r.rect.minX + (x + 0.5) * r.texelWorldSize;
        const worldY = r.rect.minY + (y + 0.5) * r.texelWorldSize;
        const hex = isoPixelToAxial({ x: worldX, y: worldY }, TILE_W, TILE_H);
        if (hex.q <= 0) {
          sawLand = true;
          expect(channel(mask, x, y, 3)).toBe(0);
          expect(channel(mask, x, y, 0)).toBe(0);
        } else {
          sawWater = true;
          expect(channel(mask, x, y, 3)).toBe(255);
          expect(channel(mask, x, y, 1)).toBe(0);
        }
      }
    }
    expect(sawLand && sawWater).toBe(true);
  });

  it('ramps R over FOAM_REACH_TILES, so a texel one tile offshore reads ~1/1.5', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(0));
    const texelsPerTile = TILE_W / r.texelWorldSize;

    // Walk east along one scanline from the first water texel.
    const y = Math.floor(mask.height / 2);
    let firstWater = -1;
    for (let x = 0; x < mask.width; x++) {
      if (channel(mask, x, y, 3) === 255) {
        firstWater = x;
        break;
      }
    }
    expect(firstWater).toBeGreaterThan(0);

    const oneTileOut = firstWater + Math.round(texelsPerTile) - 1;
    const expected = 255 / FOAM_REACH_TILES;
    expect(channel(mask, oneTileOut, y, 0)).toBeGreaterThan(expected * 0.85);
    expect(channel(mask, oneTileOut, y, 0)).toBeLessThan(expected * 1.15);
  });

  it('is monotonic outward from the coast and saturates past the reach', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(-2));
    const y = Math.floor(mask.height / 2);

    let previous = -1;
    let sawSaturated = false;
    for (let x = 0; x < mask.width; x++) {
      if (channel(mask, x, y, 3) !== 255) continue;
      const value = channel(mask, x, y, 0);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
      if (value === 255) sawSaturated = true;
    }
    expect(sawSaturated).toBe(true);
  });

  it('is symmetric across a straight coast', () => {
    // Two coasts the same distance apart on either side of a land strip must
    // produce mirrored ramps — an asymmetric transform (a one-pass chamfer,
    // say) fails this.
    const strip: TerrainLookup = { isLand: (q) => q >= -1 && q <= 1 };
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, strip);
    const y = Math.floor(mask.height / 2);

    const rowLeft: number[] = [];
    const rowRight: number[] = [];
    let inLand = false;
    for (let x = 0; x < mask.width; x++) {
      const isLand = channel(mask, x, y, 3) === 0;
      if (isLand) inLand = true;
      else if (!inLand) rowLeft.push(channel(mask, x, y, 0));
      else rowRight.push(channel(mask, x, y, 0));
    }
    const n = Math.min(rowLeft.length, rowRight.length, 8);
    for (let i = 0; i < n; i++) {
      // rowLeft runs *towards* the coast, rowRight runs away from it.
      expect(rowLeft[rowLeft.length - 1 - i]).toBeCloseTo(rowRight[i], -1);
    }
  });

  it('ramps G inward over FOAM_BLEED_TILES so foam can lick onto the beach', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(0));
    const bleedTexels = (FOAM_BLEED_TILES * TILE_W) / r.texelWorldSize;
    const y = Math.floor(mask.height / 2);

    let lastLand = -1;
    for (let x = 0; x < mask.width; x++) if (channel(mask, x, y, 3) === 0) lastLand = x;
    // Just inside the coast: partway up the ramp. Well inland: saturated.
    expect(channel(mask, lastLand, y, 1)).toBeGreaterThan(0);
    expect(channel(mask, lastLand, y, 1)).toBeLessThan(255);
    expect(channel(mask, Math.max(0, lastLand - Math.ceil(bleedTexels) - 2), y, 1)).toBe(255);
  });

  it('saturates R across a region with no land in it at all', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_WATER);
    for (let i = 0; i < mask.width * mask.height; i++) {
      expect(mask.data[i * 4 + 0]).toBe(255);
      expect(mask.data[i * 4 + 3]).toBe(255);
    }
  });

  it('saturates G across a region with no water in it at all', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_LAND);
    for (let i = 0; i < mask.width * mask.height; i++) {
      expect(mask.data[i * 4 + 1]).toBe(255);
      expect(mask.data[i * 4 + 3]).toBe(0);
    }
  });

  it('carries the per-hex seed through unchanged', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_WATER);
    const x = Math.floor(mask.width / 3);
    const y = Math.floor(mask.height / 3);
    const hex = isoPixelToAxial(
      { x: r.rect.minX + (x + 0.5) * r.texelWorldSize, y: r.rect.minY + (y + 0.5) * r.texelWorldSize },
      TILE_W,
      TILE_H,
    );
    expect(channel(mask, x, y, 2)).toBe(waterNoiseSeed(hex.q, hex.r));
  });
});

describe('mask/art alignment (§3.4)', () => {
  // The invariant the whole design rests on, stated as an assertion: the mask
  // is baked through isoPixelToAxial, and the *visible* land/water boundary in
  // the art is the top-face polygon edge, because top faces tessellate and
  // every tile's 68px skirt is covered by the tile in front of it. So a point
  // inside a hex's top face must belong to that hex, and a point in its skirt
  // must belong to the hex in front — the one whose art actually paints there.
  // If the tile geometry constants ever move, this fails loudly instead of
  // detaching the foam from the coastline by up to 68 world units.
  // `oddQToAxial` can hand back a negative zero (`-0`), which `toEqual`
  // distinguishes from `0` — normalise so these assertions test the geometry
  // rather than the sign of a zero.
  const at = (p: { x: number; y: number }) => {
    const c = isoPixelToAxial(p, TILE_W, TILE_H);
    return { q: c.q + 0, r: c.r + 0 };
  };
  const hexes = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: -3, r: 5 },
    { q: 7, r: -2 },
  ];

  it('puts every point inside a top face in that hex', () => {
    for (const hex of hexes) {
      const grid = isoGridPosition(hex, TILE_W, TILE_H);
      const centreX = grid.x + TILE_W / 2;
      const centreY = grid.y + TILE_H / 2;
      for (const p of isoTopPoints(TILE_W, TILE_H)) {
        // 90% of the way from the centre to each corner — inside, but close
        // enough to the edge to catch a half-cell error.
        const x = centreX + (grid.x + p.x - centreX) * 0.9;
        const y = centreY + (grid.y + p.y - centreY) * 0.9;
        expect(at({ x, y })).toEqual(hex);
      }
    }
  });

  it('puts a point in a tile’s skirt in the hex in front of it, not the tile itself', () => {
    for (const hex of hexes) {
      const grid = isoGridPosition(hex, TILE_W, TILE_H);
      // A third of a row below the hex's own top face — inside the skirt the
      // art draws there, and inside the top face of the hex one row down.
      const skirt = { x: grid.x + TILE_W / 2, y: grid.y + TILE_H + TILE_H / 3 };
      expect(at(skirt)).not.toEqual(hex);
      expect(at(skirt)).toEqual({ q: hex.q, r: hex.r + 1 });
    }
  });
});
