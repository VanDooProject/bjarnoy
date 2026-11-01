// Regression coverage for the two rendering bugs found and fixed while
// building the map: hover/click hit-testing landing on the wrong hex
// (isoPixelToAxial rounding against the tile's bounding-box origin instead
// of its centre) and isometric plates stacking in the wrong draw order
// (isoDepthKey sorting by row alone, ignoring the half-row offset odd
// columns get from isoGridPosition).
import { describe, expect, it } from 'vitest';
import { isoDepthKey, isoGridPosition, isoPixelToAxial, isoTopPoints, type Point } from './geometry';
import { hexesInRadius, type AxialCoord } from './coords';

const W = 168;
const H = W * (92 / 200);

// Independent of the implementation under test — ray-casting point-in-polygon.
function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > pt.y !== b.y > pt.y;
    if (crosses && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function topPolygon(c: AxialCoord): Point[] {
  const grid = isoGridPosition(c, W, H);
  return isoTopPoints(W, H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
}

function center(c: AxialCoord): Point {
  const grid = isoGridPosition(c, W, H);
  return { x: grid.x + W / 2, y: grid.y + H / 2 };
}

// Math.round on a tiny negative delta can yield -0; -0 !== 0 under the
// strict equality toEqual uses, even though they're the same coordinate.
function normalizeZero(c: AxialCoord): AxialCoord {
  return { q: c.q === 0 ? 0 : c.q, r: c.r === 0 ? 0 : c.r };
}

const sampleCoords = hexesInRadius({ q: 0, r: 0 }, 6);

describe('isoPixelToAxial', () => {
  it('recovers the coordinate from its own hex centre', () => {
    for (const c of sampleCoords) {
      expect(normalizeZero(isoPixelToAxial(center(c), W, H))).toEqual(normalizeZero(c));
    }
  });

  it('recovers the coordinate from points nudged toward each corner (not just dead centre)', () => {
    for (const c of sampleCoords) {
      const grid = isoGridPosition(c, W, H);
      const poly = isoTopPoints(W, H);
      const mid = { x: grid.x + W / 2, y: grid.y + H / 2 };
      for (const corner of poly) {
        // 80% of the way from centre to a corner: still unambiguously inside this hex.
        const pt = {
          x: mid.x + (grid.x + corner.x - mid.x) * 0.8,
          y: mid.y + (grid.y + corner.y - mid.y) * 0.8,
        };
        expect(normalizeZero(isoPixelToAxial(pt, W, H))).toEqual(normalizeZero(c));
      }
    }
  });

  it('resolves to whichever hex the point-in-polygon test says actually contains it', () => {
    // A denser, uncorrelated sweep — catches anything the corner/centre
    // cases above might miss without hand-picking coordinates.
    for (let x = -400; x <= 400; x += 17) {
      for (let y = -300; y <= 300; y += 13) {
        const pt = { x, y };
        const result = isoPixelToAxial(pt, W, H);
        expect(pointInPolygon(pt, topPolygon(result))).toBe(true);
      }
    }
  });
});

describe('isoTopPoints / isoGridPosition tiling', () => {
  it('covers the plane with no gaps and no overlaps', () => {
    // Every sampled point must land in exactly one neighbouring hex's
    // top-face polygon — this is the property the whole isoPixelToAxial
    // candidate search relies on.
    for (let x = -300; x <= 300; x += 11) {
      for (let y = -200; y <= 200; y += 9) {
        const pt = { x, y };
        const near = isoPixelToAxial(pt, W, H);
        const candidates = hexesInRadius(near, 1);
        const containing = candidates.filter((c) => pointInPolygon(pt, topPolygon(c)));
        expect(containing.length).toBe(1);
      }
    }
  });
});

describe('isoDepthKey', () => {
  it('orders hexes by actual on-screen vertical position, not raw offset row', () => {
    // The exact case that produced visible tile overlap: two axial
    // neighbours one column apart sit at different screen heights because
    // of odd-column's half-row offset, so the one further down-screen must
    // get the larger depth key even though a naive `row * k + col` does not
    // reflect that.
    for (const c of sampleCoords) {
      for (const d of [
        { q: 1, r: -1 },
        { q: -1, r: 1 },
      ] as const) {
        const other: AxialCoord = { q: c.q + d.q, r: c.r + d.r };
        const yC = isoGridPosition(c, W, H).y;
        const yOther = isoGridPosition(other, W, H).y;
        if (yC === yOther) continue;
        const lower = yC < yOther ? other : c;
        const higher = yC < yOther ? c : other;
        expect(isoDepthKey(lower)).toBeGreaterThan(isoDepthKey(higher));
      }
    }
  });

  it('never lets a distant column outrank the next row down (regression for the legacy row*10+col formula)', () => {
    const nearRow: AxialCoord = { q: 0, r: 0 };
    const farColumnSameRow: AxialCoord = { q: 50, r: -25 }; // same nominal row, far column
    const nextRowDown: AxialCoord = { q: 0, r: 1 };
    expect(isoDepthKey(nextRowDown)).toBeGreaterThan(isoDepthKey(farColumnSameRow));
    expect(isoDepthKey(farColumnSameRow)).toBeGreaterThan(isoDepthKey(nearRow));
  });
});
