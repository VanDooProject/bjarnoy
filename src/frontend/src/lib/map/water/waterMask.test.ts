import { describe, expect, it } from 'vitest';
import { isoGridPosition, isoPixelToAxial, isoTopPoints } from '../../hex/geometry';
import {
  bakeWaterMask,
  euclideanDistanceTransform,
  NEAR_SPAN_TILES,
  FOAM_REACH_TILES,
  groundSquash,
  hasWaterProp,
  hexMitreDistance,
  propMute,
  PROP_MUTE_FADE_TILES,
  topFaceHalfPlanes,
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

/**
 * Whether a texel reads as water, off the signed near field (R). R is the
 * mask's only land/water statement — A used to be a coverage bit and is now the
 * prop-tile mute, which says nothing about terrain.
 */
function isWaterTexel(mask: ReturnType<typeof bakeWaterMask>, x: number, y: number): boolean {
  return channel(mask, x, y, 0) > 128;
}

/** The far-field (G) channel at a world point — unsigned distance from land over FOAM_REACH_TILES. */
function sample(mask: ReturnType<typeof bakeWaterMask>, r: WaterMaskRegion, worldX: number, worldY: number): number {
  return channel(
    mask,
    Math.floor((worldX - r.rect.minX) / r.texelWorldSize),
    Math.floor((worldY - r.rect.minY) / r.texelWorldSize),
    1,
  );
}

/** The signed near field (R) at a world point, decoded back into tile widths. */
function signedAt(mask: ReturnType<typeof bakeWaterMask>, r: WaterMaskRegion, worldX: number, worldY: number): number {
  const raw = channel(
    mask,
    Math.floor((worldX - r.rect.minX) / r.texelWorldSize),
    Math.floor((worldY - r.rect.minY) / r.texelWorldSize),
    0,
  );
  return (raw / 255 - 0.5) * 2 * NEAR_SPAN_TILES;
}

/**
 * One texel's worth of the R ramp, in channel units. The mask stores one value
 * per texel and these tests read the texel a point falls in, so nothing can be
 * asserted tighter than this without testing the raster rather than the metric.
 */
function texelSlack(r: WaterMaskRegion): number {
  return (255 * r.texelWorldSize) / (FOAM_REACH_TILES * TILE_W);
}

/** A single land hex with open water all round it — the cleanest shape to measure a metric against. */
const ONE_HEX_ISLAND: TerrainLookup = { isLand: (q, r) => q === 0 && r === 0 };

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
  it('puts every land texel below the coastline in R and every water texel above it', () => {
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
          // Land: the signed near field is at or below the coastline, and the
          // far field (distance from land) is zero.
          expect(channel(mask, x, y, 0)).toBeLessThanOrEqual(128);
          expect(channel(mask, x, y, 1)).toBe(0);
        } else {
          sawWater = true;
          expect(channel(mask, x, y, 0)).toBeGreaterThanOrEqual(128);
        }
      }
    }
    expect(sawLand && sawWater).toBe(true);
  });

  it('puts the signed near field at exactly 0.5 on the coastline', () => {
    // The property the whole inner-edge fix rests on: R crosses 0.5 on the tile
    // edge the art draws, so linear filtering places the crossing within a
    // fraction of a texel of it instead of on a texel boundary.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ONE_HEX_ISLAND);
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const squash = groundSquash(TILE_W, TILE_H);

    for (const t of [0.35, 0.5, 0.65]) {
      const onEdge = signedAt(mask, r, grid.x + TILE_W * t, grid.y);
      expect(Math.abs(onEdge)).toBeLessThan((r.texelWorldSize / TILE_W) * 1.5);
    }
    // And it is signed the right way either side of that edge.
    expect(signedAt(mask, r, grid.x + TILE_W / 2, grid.y - 0.3 * TILE_W * squash)).toBeGreaterThan(0.2);
    expect(signedAt(mask, r, grid.x + TILE_W / 2, grid.y + TILE_H / 2)).toBeLessThan(-0.2);
  });

  it('ramps the signed near field linearly in ground units out from a real tile edge', () => {
    // Measured out from an actual top-face edge rather than by counting texels
    // from the first water texel: the coastline of a hex grid zig-zags, so "one
    // tile east of the first water texel" is not one tile from land.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ONE_HEX_ISLAND);
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const squash = groundSquash(TILE_W, TILE_H);

    for (const tilesOut of [0.15, 0.3, 0.45]) {
      // Straight up from the middle of the hex's flat top edge. The offset is a
      // ground distance, so on screen it is foreshortened by `squash`.
      const value = signedAt(mask, r, grid.x + TILE_W / 2, grid.y - tilesOut * TILE_W * squash);
      expect(Math.abs(value - tilesOut)).toBeLessThan(r.texelWorldSize / TILE_W);
    }
  });

  it('measures distance along the ground, not on screen — so the band is not painted on the glass', () => {
    // The isometric projection squashes the ground to ~53% in y. A band of
    // constant *screen* distance around a tile is not the projection of a band
    // of constant ground distance, and reads as a decal in front of the map
    // rather than as foam lying on the water. So the same ground distance north
    // of a hex must come out at the same value as diagonally out from it —
    // which on screen is a visibly smaller offset.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ONE_HEX_ISLAND);
    const squash = groundSquash(TILE_W, TILE_H);
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const out = 0.35 * TILE_W;

    const north = signedAt(mask, r, grid.x + TILE_W / 2, grid.y - out * squash);
    // Perpendicular to the upper-right edge, whose ground-space outward normal
    // is 30 degrees above the x axis.
    const edgeMid = { x: grid.x + (7 * TILE_W) / 8, y: grid.y + TILE_H / 4 };
    const diagonal = signedAt(
      mask,
      r,
      edgeMid.x + Math.cos(Math.PI / 6) * out,
      edgeMid.y - Math.sin(Math.PI / 6) * out * squash,
    );

    expect(Math.abs(north - diagonal)).toBeLessThan(r.texelWorldSize / TILE_W);
    expect(squash).toBeLessThan(0.6);
  });

  it('has a far field that is monotonic outward from the coast and saturates past the reach', () => {
    // G is the raster transform, deliberately approximate: it only feeds the
    // wave coast-fade, which reads it out in the middle of its range where a
    // texel of error is invisible. The exact metric is reserved for R, near the
    // shore, where the foam is.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(-2));
    const y = Math.floor(mask.height / 2);

    let previous = -1;
    let sawSaturated = false;
    for (let x = 0; x < mask.width; x++) {
      if (!isWaterTexel(mask, x, y)) continue;
      const value = channel(mask, x, y, 1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
      if (value === 255) sawSaturated = true;
    }
    expect(sawSaturated).toBe(true);
  });

  it('measures the far field along the ground too, not on the glass', () => {
    // The same failure the signed near field had before it was lifted into
    // ground space: a distance measured in screen pixels puts its level sets
    // 1/squash further out on a north-facing shore than an east-facing one, so
    // anything keyed off it — the wave coast fade, the caustics' keep-off — sits
    // at a different distance depending on which way the coast happens to run.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ONE_HEX_ISLAND);
    const squash = groundSquash(TILE_W, TILE_H);
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const out = 0.9 * TILE_W;

    // Straight up from the middle of the flat top edge, and straight out from
    // the middle of the east point — the same ground distance either way.
    const north = sample(mask, r, grid.x + TILE_W / 2, grid.y - out * squash);
    const east = sample(mask, r, grid.x + TILE_W + out, grid.y + TILE_H / 2);

    expect(north).toBeGreaterThan(0);
    expect(north).toBeLessThan(255);
    // Within a couple of levels: G is the raster transform, so a texel of
    // disagreement is expected — a factor of 1/squash (1.9x) is not.
    expect(Math.abs(north - east)).toBeLessThan(16);
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
      const isLand = !isWaterTexel(mask, x, y);
      if (isLand) inLand = true;
      else if (!inLand) rowLeft.push(channel(mask, x, y, 1));
      else rowRight.push(channel(mask, x, y, 1));
    }
    const n = Math.min(rowLeft.length, rowRight.length, 8);
    for (let i = 0; i < n; i++) {
      // rowLeft runs *towards* the coast, rowRight runs away from it.
      expect(rowLeft[rowLeft.length - 1 - i]).toBeCloseTo(rowRight[i], -1);
    }
  });

  it('saturates across a region with no land in it at all', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_WATER);
    for (let i = 0; i < mask.width * mask.height; i++) {
      expect(mask.data[i * 4 + 0]).toBe(255);
      expect(mask.data[i * 4 + 1]).toBe(255);
    }
  });

  it('saturates across a region with no water in it at all', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_LAND);
    for (let i = 0; i < mask.width * mask.height; i++) {
      expect(mask.data[i * 4 + 0]).toBe(0);
      expect(mask.data[i * 4 + 1]).toBe(0);
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

describe('mitred hex-edge distance', () => {
  // Why the field is not a plain euclidean distance transform: a euclidean band
  // rounds every convex corner over a radius equal to its own width, and a hex
  // edge is half a tile long while the foam band is a third of one — so on a hex
  // coastline the corners dominate and the band reads as a soft blob rather than
  // as something following the shoreline.
  const r = waterMaskRegion({ minX: -600, maxX: 600, minY: -400, maxY: 400 }, TILE_W);
  const mask = bakeWaterMask(r, TILE_W, TILE_H, ONE_HEX_ISLAND);
  const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
  const squash = groundSquash(TILE_W, TILE_H);

  it('is constant along a straight run parallel to a tile edge', () => {
    // Sampling parallel to the flat top edge at a fixed perpendicular offset
    // must read the same value all the way along. That is what "straight edges"
    // means: the band's outer boundary is a line parallel to the tile edge, not
    // an arc swung from its endpoints.
    const offset = 0.3 * TILE_W * squash;
    const y = grid.y - offset;
    const values = [0.3, 0.45, 0.5, 0.6, 0.7].map((t) => sample(mask, r, grid.x + TILE_W * t, y));
    for (const value of values) expect(Math.abs(value - values[0])).toBeLessThan(texelSlack(r));
  });

  it('mitres the corners instead of rounding them off', () => {
    // Asserted on the metric itself rather than through the mask: the raster
    // stores one value per texel, and the difference this is about is smaller
    // than a texel's worth of the ramp.
    //
    // Straight out along a corner's bisector a mitred field reads *lower* than a
    // euclidean one by cos(30 degrees) — which is the same thing as saying its
    // level set reaches 1/cos(30) further out there, so the band comes to a
    // point at the corner instead of being cut off by an arc.
    const planes = topFaceHalfPlanes(TILE_W, TILE_H);
    const groundGrid = { x: grid.x, y: grid.y / squash };
    const out = 0.3 * TILE_W;

    // Perpendicular from the middle of the flat top edge, and along the east
    // vertex's bisector — the same ground distance in both cases.
    const groundH = TILE_H / squash;
    const fromEdge = hexMitreDistance(grid.x + TILE_W / 2, groundGrid.y - out, groundGrid.x, groundGrid.y, planes);
    const fromCorner = hexMitreDistance(
      grid.x + TILE_W + out,
      groundGrid.y + groundH / 2,
      groundGrid.x,
      groundGrid.y,
      planes,
    );

    expect(fromEdge).toBeCloseTo(out, 6);
    expect(fromCorner).toBeCloseTo(out * Math.cos(Math.PI / 6), 6);
  });

  it('is zero exactly on a top-face edge, which is where the art\'s coastline is', () => {
    const planes = topFaceHalfPlanes(TILE_W, TILE_H);
    const groundGrid = { x: grid.x, y: grid.y / squash };
    for (const t of [0.3, 0.5, 0.7]) {
      expect(hexMitreDistance(grid.x + TILE_W * t, groundGrid.y, groundGrid.x, groundGrid.y, planes)).toBeCloseTo(0, 6);
    }
  });

  it('is negative inside the hex', () => {
    const planes = topFaceHalfPlanes(TILE_W, TILE_H);
    const groundGrid = { x: grid.x, y: grid.y / squash };
    const centre = hexMitreDistance(
      grid.x + TILE_W / 2,
      groundGrid.y + TILE_H / squash / 2,
      groundGrid.x,
      groundGrid.y,
      planes,
    );
    expect(centre).toBeLessThan(0);
    // A regular flat-top hexagon's inradius is w * sqrt(3) / 4.
    expect(-centre).toBeCloseTo((TILE_W * Math.sqrt(3)) / 4, 6);
  });
});

describe('hasWaterProp', () => {
  const coastal = (variant: number) => ({ q: 0, r: 0, terrain: 'sea' as const, isCoastalWater: true, variant });

  it('is false for the plain coastal tile, which is most of the coast', () => {
    expect(hasWaterProp(coastal(0))).toBe(false);
  });

  it('is true for the two variants the art pack draws a boat and a rock on', () => {
    expect(hasWaterProp(coastal(1))).toBe(true);
    expect(hasWaterProp(coastal(2))).toBe(true);
  });

  it('is false for open sea, however its cosmetic variant rolled', () => {
    // watertile_* has no variants at all, so a non-zero index here is just the
    // shared per-hex roll and must not be read as a prop.
    expect(hasWaterProp({ q: 0, r: 0, terrain: 'sea', isCoastalWater: false, variant: 2 })).toBe(false);
  });

  it('is false for land', () => {
    expect(hasWaterProp({ q: 0, r: 0, terrain: 'grass', variant: 2 })).toBe(false);
  });

  it('is false once a building stands on the tile', () => {
    // A fishing hut replaces the coastal art with its own, prop included — so
    // there is nothing left to mute the shader for.
    expect(hasWaterProp({ ...coastal(1), buildingType: 'fishinghut' })).toBe(false);
  });
});

describe('propMute', () => {
  it('is fully on over the tile itself and fully off past the fade', () => {
    expect(propMute(0, 60)).toBe(1);
    expect(propMute(-5, 60)).toBe(1);
    expect(propMute(60, 60)).toBe(0);
    expect(propMute(200, 60)).toBe(0);
  });

  it('falls monotonically across the fade', () => {
    let previous = 1;
    for (let d = 0; d <= 60; d += 5) {
      const value = propMute(d, 60);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it('flattens out at both ends rather than meeting the unmuted water at a corner', () => {
    // The property the smoothstep is there for: a linear ramp would put the
    // same drop in the first and last twentieth of the fade, and that corner is
    // visible as a ring in a bright foam band.
    const fade = 60;
    const atEdge = propMute(0, fade) - propMute(fade * 0.05, fade);
    const inMiddle = propMute(fade * 0.475, fade) - propMute(fade * 0.525, fade);
    expect(atEdge).toBeLessThan(inMiddle * 0.5);
  });
});

describe("the mask's prop-tile mute (A)", () => {
  /** A world where the single hex `(q, r)` is coastal water carrying a prop; everything else is plain open sea. */
  function oneProp(q: number, r: number): TerrainLookup {
    return {
      isLand: () => false,
      getTile: (tq, tr) => ({ q: tq, r: tr, terrain: 'sea', isCoastalWater: tq === q && tr === r, variant: tq === q && tr === r ? 1 : 0 }),
    };
  }

  it('is zero everywhere when the lookup cannot report tiles', () => {
    // The interface's getTile is optional, and a caller without one must get a
    // mask that mutes nothing rather than one that mutes everything.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, ALL_WATER);
    for (let i = 3; i < mask.data.length; i += 4) expect(mask.data[i]).toBe(0);
  });

  it('is zero everywhere when no tile carries a prop', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, {
      isLand: () => false,
      getTile: (q, tr) => ({ q, r: tr, terrain: 'sea', isCoastalWater: true, variant: 0 }),
    });
    for (let i = 3; i < mask.data.length; i += 4) expect(mask.data[i]).toBe(0);
  });

  it('is full strength at the prop hex centre', () => {
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, oneProp(0, 0));
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const at = (x: number, y: number) =>
      channel(mask, Math.floor((x - r.rect.minX) / r.texelWorldSize), Math.floor((y - r.rect.minY) / r.texelWorldSize), 3);
    expect(at(grid.x + TILE_W / 2, grid.y + TILE_H / 2)).toBe(255);
  });

  it('fades out with distance instead of stopping at the hex edge', () => {
    // The whole point of baking a ramp rather than a per-hex flag: a hard cutoff
    // would put a hexagon-shaped hole in the foam collar, which is far more
    // visible than the prop it is protecting.
    const r = region();
    const mask = bakeWaterMask(r, TILE_W, TILE_H, oneProp(0, 0));
    const grid = isoGridPosition({ q: 0, r: 0 }, TILE_W, TILE_H);
    const centre = { x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 };
    const at = (dx: number) =>
      channel(
        mask,
        Math.floor((centre.x + dx - r.rect.minX) / r.texelWorldSize),
        Math.floor((centre.y - r.rect.minY) / r.texelWorldSize),
        3,
      );

    // Straight out along +x: full strength inside the hex, nothing well past the
    // fade, and somewhere in between at least one texel that is neither — which
    // is the whole claim. Sampled as a walk rather than at three chosen offsets:
    // the fade is only a couple of texels wide, so a fixed offset is a test of
    // where the texel grid happens to fall.
    expect(at(TILE_W * 0.3)).toBe(255);
    expect(at(TILE_W * (0.5 + PROP_MUTE_FADE_TILES + 0.3))).toBe(0);

    const ramp: number[] = [];
    for (let t = 0.5; t <= 0.5 + PROP_MUTE_FADE_TILES; t += 0.02) ramp.push(at(TILE_W * t));
    expect(ramp.some((v) => v > 0 && v < 255)).toBe(true);
    // ...and it only ever falls as you go out.
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeLessThanOrEqual(ramp[i - 1]);
  });

  it('leaves the distance channels alone — the mute is a separate quantity', () => {
    // A prop tile is still water, and still has a coastline running past it. If
    // baking the mute perturbed R or G, muting the shader over one tile would
    // also move the foam on its neighbours.
    const r = region();
    const plain = bakeWaterMask(r, TILE_W, TILE_H, verticalCoast(0));
    const withProp = bakeWaterMask(r, TILE_W, TILE_H, {
      isLand: (q) => q <= 0,
      getTile: (q, tr) => ({ q, r: tr, terrain: q <= 0 ? 'grass' : 'sea', isCoastalWater: q === 1, variant: q === 1 ? 1 : 0 }),
    });
    for (let i = 0; i < plain.data.length; i += 4) {
      expect(withProp.data[i]).toBe(plain.data[i]);
      expect(withProp.data[i + 1]).toBe(plain.data[i + 1]);
      expect(withProp.data[i + 2]).toBe(plain.data[i + 2]);
    }
    // ...and the prop column really did mute something, so the assertion above
    // isn't passing because nothing happened.
    expect(Array.from(withProp.data).some((_, i) => i % 4 === 3 && withProp.data[i] === 255)).toBe(true);
  });
});
