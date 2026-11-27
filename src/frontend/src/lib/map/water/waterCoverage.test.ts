import { describe, expect, it } from 'vitest';
import { hexesInRadius, neighbors, oddQToAxial, axialToOddQ, type AxialCoord } from '../../hex/coords';
import { isoGridPosition, isoPixelToAxial, isoTopPoints } from '../../hex/geometry';
import { bakeWaterMask, NEAR_SPAN_TILES } from './waterMask';
import { FOAM_WIDTH_RANGE } from './waterDebug';
import { FOAM_LAND_REACH } from './WaterLayer';
import { waterMaskRegion } from './waterMaskLayout';
import { HEX_ACROSS_FLATS_TILES, WaterMeshBuffers, seaAndShoreHexes } from './waterCoverage';

const TILE_W = 168;
const TILE_H = (TILE_W * 92) / 200;

const key = (q: number, r: number) => `${q},${r}`;

// A land blob of radius 3 around the origin in an otherwise open sea.
const land = new Set(hexesInRadius({ q: 0, r: 0 }, 3).map((c) => key(c.q, c.r)));
const isLand = (q: number, r: number) => land.has(key(q, r));

function bake() {
  const region = waterMaskRegion({ minX: -700, minY: -450, maxX: 900, maxY: 550 }, TILE_W);
  return bakeWaterMask(region, TILE_W, TILE_H, { isLand });
}

function asKeys(hexes: { col: number; row: number }[]): Set<string> {
  return new Set(
    hexes.map((h) => {
      const a = oddQToAxial(h);
      return key(a.q, a.r);
    }),
  );
}

describe('water mesh coverage', () => {
  it('covers every sea hex and the land ring next to it, and no other land', () => {
    const mask = bake();
    const covered = asKeys(seaAndShoreHexes(mask, TILE_W, TILE_H));

    // Land with a sea neighbour (the outer ring of radius 3) is covered, land without one is not.
    for (const c of hexesInRadius({ q: 0, r: 0 }, 3)) {
      const touchesSea = neighbors(c).some((n) => !isLand(n.q, n.r));
      expect(covered.has(key(c.q, c.r)), `land ${c.q},${c.r}`).toBe(touchesSea);
    }
    // Every sea hex whose centre is in the region is covered.
    const { rect } = mask.region;
    for (const c of hexesInRadius({ q: 0, r: 0 }, 14)) {
      if (isLand(c.q, c.r)) continue;
      const g = isoGridPosition(c, TILE_W, TILE_H);
      const cx = g.x + TILE_W / 2;
      const cy = g.y + TILE_H / 2;
      if (cx < rect.minX || cx > rect.maxX || cy < rect.minY || cy > rect.maxY) continue;
      expect(covered.has(key(c.q, c.r)), `sea ${c.q},${c.r}`).toBe(true);
    }
  });
});

describe('shore ring assumption', () => {
  it('keeps the foam reach onto land, at the slider highest, inside the ring', () => {
    // A land hex with no sea neighbour is at least a hex-across-the-flats from the sea; the ring only covers what foam can reach.
    expect(FOAM_WIDTH_RANGE.max * FOAM_LAND_REACH).toBeLessThan(HEX_ACROSS_FLATS_TILES);
  });
});

describe('water mesh pixel coverage', () => {
  // A deterministic archipelago whose land and sea both touch the baked rect's edges.
  function archipelago() {
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const landSet = new Set<string>();
    for (const c of hexesInRadius({ q: 0, r: 0 }, 9)) if (rnd() < 0.45) landSet.add(key(c.q, c.r));
    const region = waterMaskRegion({ minX: -500, minY: -300, maxX: 500, maxY: 300 }, TILE_W);
    return bakeWaterMask(region, TILE_W, TILE_H, { isLand: (q, r) => landSet.has(key(q, r)) });
  }

  it('covers every texel the shader would draw on, and no hex lies outside the rect', () => {
    const mask = archipelago();
    const hexes = seaAndShoreHexes(mask, TILE_W, TILE_H);
    const covered = asKeys(hexes);
    const { rect, width, texelWorldSize } = mask.region;
    const reach = FOAM_WIDTH_RANGE.max * FOAM_LAND_REACH;

    let drawn = 0;
    let landDrawn = 0;
    const missed: string[] = [];
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = (mask.data[(y * width + x) * 4]! / 255 - 0.5) * NEAR_SPAN_TILES * 2;
        // The water shader discards land farther than the foam's reach from the coast.
        if (dist <= 0 && -dist > reach) continue;
        drawn++;
        if (dist <= 0) landDrawn++;
        const a = isoPixelToAxial({ x: rect.minX + (x + 0.5) * texelWorldSize, y: rect.minY + (y + 0.5) * texelWorldSize }, TILE_W, TILE_H);
        if (!covered.has(key(a.q, a.r))) missed.push(`${x},${y}`);
      }
    }
    expect(drawn).toBeGreaterThan(0);
    expect(landDrawn).toBeGreaterThan(0);
    expect(missed).toEqual([]);

    // Sea and land both reach the rect's edge in this fixture, and nothing is emitted that the rect does not touch.
    const { positions } = new WaterMeshBuffers().fill(hexes, TILE_W, TILE_H, rect);
    for (let k = 0; k < hexes.length; k++) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let v = 0; v < 6; v++) {
        const px = positions[(k * 6 + v) * 2]!;
        const py = positions[(k * 6 + v) * 2 + 1]!;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      const overlaps = maxX > rect.minX && minX < rect.maxX && maxY > rect.minY && minY < rect.maxY;
      expect(overlaps, `hex ${hexes[k]!.col},${hexes[k]!.row}`).toBe(true);
    }
  });
});

describe('WaterMeshBuffers', () => {
  const rect = { minX: -100, minY: -50, maxX: 900, maxY: 450 };

  it('draws each hex as its own top-face hexagon with UVs over the mask rect', () => {
    const hex = axialToOddQ({ q: 2, r: -1 });
    const { positions, uvs, indices } = new WaterMeshBuffers().fill([hex], TILE_W, TILE_H, rect);
    const grid = isoGridPosition({ q: 2, r: -1 }, TILE_W, TILE_H);
    isoTopPoints(TILE_W, TILE_H).forEach((p, i) => {
      expect(positions[i * 2]).toBeCloseTo(grid.x + p.x, 3);
      expect(positions[i * 2 + 1]).toBeCloseTo(grid.y + p.y, 3);
      expect(uvs[i * 2]).toBeCloseTo((positions[i * 2]! - rect.minX) / (rect.maxX - rect.minX), 5);
      expect(uvs[i * 2 + 1]).toBeCloseTo((positions[i * 2 + 1]! - rect.minY) / (rect.maxY - rect.minY), 5);
    });
    expect(indices.length).toBe(12);
  });

  it('gives neighbouring hexes bit-identical shared vertices, so there are no cracks', () => {
    const a: AxialCoord = { q: 1, r: 1 };
    const cells = [a, ...neighbors(a)].map(axialToOddQ);
    const { positions } = new WaterMeshBuffers().fill(cells, TILE_W, TILE_H, rect);
    const verts = new Map<string, number>();
    for (let i = 0; i < positions.length; i += 2) {
      const k = `${positions[i]},${positions[i + 1]}`;
      verts.set(k, (verts.get(k) ?? 0) + 1);
    }
    // 7 hexes x 6 corners = 42 corners; the centre hex shares each of its corners with two neighbours.
    expect(verts.size).toBeLessThan(42);
    expect([...verts.values()].some((n) => n >= 3)).toBe(true);
  });

  it('reuses its buffers and returns views of exactly the used length', () => {
    const buffers = new WaterMeshBuffers();
    const big = buffers.fill([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }], TILE_W, TILE_H, rect);
    const small = buffers.fill([{ col: 0, row: 0 }], TILE_W, TILE_H, rect);
    expect(big.positions.length).toBe(36);
    expect(small.positions.length).toBe(12);
    expect(small.positions.buffer).toBe(big.positions.buffer);
    expect(small.indices.length).toBe(12);
  });
});
