// The single-hex overlay outline (hover, pinned highlight, reach wash) on a hex's visible top face: on sea it sits on the lowered sea
// surface, and land in front hides the part that lies on its top face.
import { describe, expect, it } from 'vitest';
import type { AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';
import { polygonArea, type Pt } from './convexPolygon';
import { loweredHexOutline, pickVisibleHex, seaTopFaceDrop } from './loweredHexOutline';
import { neighbourAcrossEdge } from './realmBorders';
import { TILE_ART_SEA_TOPFACE_DROP_FRAC } from './textures';

const W = 168;
const H = (W * 92) / 200;
const STROKE = 4;
const C: AxialCoord = { q: 3, r: -1 };

const topOf = (c: AxialCoord): Pt[] => {
  const grid = isoGridPosition(c, W, H);
  return isoTopPoints(W, H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
};
const key = (c: AxialCoord) => `${c.q},${c.r}`;
const loweredExcept = (land: AxialCoord[]) => {
  const keys = new Set(land.map(key));
  return (q: number, r: number) => !keys.has(key({ q, r }));
};
const areaOf = (polys: Pt[][]) => polys.reduce((sum, p) => sum + polygonArea(p), 0);

/** Whether `p` lies strictly inside the convex polygon `poly`. */
function strictlyInside(p: Pt, poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}

describe('loweredHexOutline', () => {
  it('draws a land hex on its own top face, whole', () => {
    const o = loweredHexOutline(C, W, H, () => false, STROKE);
    expect(o.drop).toBe(0);
    expect(o.fill).toEqual([topOf(C)]);
    expect(o.edges.every((e) => e.pieces === null)).toBe(true);
    expect(o.edges.map((e) => e.a)).toEqual(topOf(C));
  });

  it('drops a sea hex to the sea top face (the bug: it was drawn on the land-level grid)', () => {
    const o = loweredHexOutline(C, W, H, () => true, STROKE);
    expect(o.drop).toBeCloseTo(W * TILE_ART_SEA_TOPFACE_DROP_FRAC);
    expect(seaTopFaceDrop(W)).toBe(o.drop);
    expect(o.fill).toEqual([topOf(C).map((p) => ({ x: p.x, y: p.y + o.drop }))]);
    expect(o.edges.every((e) => e.pieces === null)).toBe(true);
  });

  it('lets land in front hide the part of a sea hex outline that lies on its top face', () => {
    const front = neighbourAcrossEdge(C, 4);
    const o = loweredHexOutline(C, W, H, loweredExcept([front]), STROKE);
    const landTop = topOf(front);
    expect(areaOf(o.fill)).toBeLessThan(polygonArea(topOf(C)) - 1);
    for (const p of o.fill.flat()) expect(strictlyInside(p, landTop)).toBe(false);
    const pieces = o.edges.flatMap((e) => e.pieces ?? []);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces.flat()) expect(strictlyInside(p, landTop)).toBe(false);
    // Only the edges the land reaches are cut; the back edges stay plain strokes (no overlapping caps at their corners).
    expect([0, 1, 2].map((e) => o.edges[e].pieces)).toEqual([null, null, null]);
  });

  it('hides the outline behind land across each front edge', () => {
    for (const e of [3, 4, 5]) {
      const front = neighbourAcrossEdge(C, e);
      const o = loweredHexOutline(C, W, H, loweredExcept([front]), STROKE);
      expect(areaOf(o.fill)).toBeLessThan(polygonArea(topOf(C)) - 1);
      expect(o.edges[e].pieces).not.toBeNull();
    }
  });

  it('builds no stroke pieces for a fill-only overlay', () => {
    const o = loweredHexOutline(C, W, H, loweredExcept([neighbourAcrossEdge(C, 4)]), 0);
    expect(o.edges.every((e) => e.pieces === null)).toBe(true);
    expect(o.fill.length).toBeGreaterThan(1);
  });

  it('is not hidden by land behind a sea hex: that land is drawn first', () => {
    const behind = [0, 1, 2].map((e) => neighbourAcrossEdge(C, e));
    const o = loweredHexOutline(C, W, H, loweredExcept(behind), STROKE);
    expect(o.fill).toHaveLength(1);
    expect(areaOf(o.fill)).toBeCloseTo(polygonArea(topOf(C)));
    expect(o.edges.every((e) => e.pieces === null)).toBe(true);
  });
});

describe('pickVisibleHex', () => {
  const drop = seaTopFaceDrop(W);
  // The middle of the bottom edge of C's top face at land level (isoTopPoints spans 0..W, 0..H).
  const grid = isoGridPosition(C, W, H);
  const bottomMid = { x: grid.x + W / 2, y: grid.y + H };
  const topMid = { x: grid.x + W / 2, y: grid.y };
  const allSea = () => true;
  const below = (p: Pt, d: number) => ({ x: p.x, y: p.y + d });

  it("picks the sea hex in the strip its lowered face reaches below the land grid (the bug: it picked the hex in front)", () => {
    expect(pickVisibleHex(below(bottomMid, drop / 2), W, H, allSea)).toEqual(C);
  });

  it('picks the hex behind in the strip a sea hex leaves open at its back', () => {
    const p = below(topMid, drop / 2);
    const behind = pickVisibleHex(p, W, H, allSea);
    expect(behind).not.toEqual(C);
    expect([0, 1, 2].map((e) => neighbourAcrossEdge(C, e))).toContainEqual(behind);
  });

  it('picks land in front over the lowered face of the sea hex behind it', () => {
    const front = neighbourAcrossEdge(C, 4);
    expect(pickVisibleHex(below(bottomMid, drop / 2), W, H, loweredExcept([front]))).toEqual(front);
  });

  it('picks on the land grid where nothing is lowered (world map, inland)', () => {
    expect(pickVisibleHex(below(bottomMid, drop / 2), W, H, () => false)).not.toEqual(C);
    expect(pickVisibleHex(below(topMid, drop / 2), W, H, () => false)).toEqual(C);
  });
});
