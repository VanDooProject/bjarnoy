// Pins `isoPixelToAxial`'s hand-inlined fast path against the straightforward
// implementation it replaced.
//
// geometry.test.ts already checks the *property* the function exists for — the
// point it returns is inside the hex it names — but a property test cannot see
// the one thing an inlining can quietly change: which hex a point exactly on a
// shared edge or vertex resolves to. That is decided by the crossing test's
// own conventions and the order the seven candidates are tried in, and the
// renderer leans on it being stable (a hover highlight that flickers between
// two hexes as the pointer traces an edge is the visible failure). So the
// reference version is kept here, in the test, and the two are required to
// agree exactly — over dense off-lattice sweeps and over every vertex, edge
// midpoint and centre of a patch of hexes, at four different tile geometries.
import { describe, it, expect } from 'vitest';
import { isoPixelToAxial, isoGridPosition, isoTopPoints, type Point } from './geometry';
import { neighbors, oddQToAxial, type AxialCoord } from './coords';

// Verbatim copy of the pre-optimisation implementation.
function pointInPolygonOld(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > pt.y !== b.y > pt.y;
    if (crosses && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function oldIsoPixelToAxial(world: Point, w: number, h: number): AxialCoord {
  const colPitch = w * 0.75;
  const col = Math.round((world.x - w / 2) / colPitch);
  const row = Math.round((world.y - h / 2 - (col & 1 ? h / 2 : 0)) / h);
  const estimate = oddQToAxial({ col, row });
  for (const c of [estimate, ...neighbors(estimate)]) {
    const grid = isoGridPosition(c, w, h);
    const poly = isoTopPoints(w, h).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
    if (pointInPolygonOld(world, poly)) return c;
  }
  return estimate;
}

const norm = (c: AxialCoord) => ({ q: c.q === 0 ? 0 : c.q, r: c.r === 0 ? 0 : c.r });

describe('isoPixelToAxial parity with the pre-optimisation implementation', () => {
  for (const [w, h] of [[168, 92], [200, 92], [64, 30], [37, 17.5]] as const) {
    it(`agrees everywhere for w=${w} h=${h}`, () => {
      let n = 0;
      // Dense irrational-ish sweep, deliberately not aligned to the lattice.
      for (let x = -3 * w; x <= 3 * w; x += w / 37.3) {
        for (let y = -3 * h; y <= 3 * h; y += h / 23.7) {
          const pt = { x, y };
          expect(norm(isoPixelToAxial(pt, w, h))).toEqual(norm(oldIsoPixelToAxial(pt, w, h)));
          n++;
        }
      }
      expect(n).toBeGreaterThan(10000);
    });

    it(`agrees on exact vertices, edge midpoints and centres for w=${w} h=${h}`, () => {
      for (let q = -4; q <= 4; q++) {
        for (let r = -4; r <= 4; r++) {
          const grid = isoGridPosition({ q, r }, w, h);
          const poly = isoTopPoints(w, h);
          const pts: Point[] = [{ x: grid.x + w / 2, y: grid.y + h / 2 }];
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            pts.push({ x: grid.x + a.x, y: grid.y + a.y });
            pts.push({ x: grid.x + (a.x + b.x) / 2, y: grid.y + (a.y + b.y) / 2 });
          }
          for (const pt of pts) {
            expect(norm(isoPixelToAxial(pt, w, h))).toEqual(norm(oldIsoPixelToAxial(pt, w, h)));
          }
        }
      }
    });
  }
});
