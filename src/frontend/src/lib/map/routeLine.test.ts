import { describe, expect, it } from 'vitest';
import type { AxialCoord } from '../hex/coords';
import { coordKey, hexLine, hexesInRadius } from '../hex/coords';
import type { Point } from '../hex/geometry';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';
import { TILE_H, TILE_W } from './HexMapRenderer';
import { pointInPolygon, routeDisplayPointsOnMap, segmentEntersPolygon } from './routeLine';

const EPS = 1e-6 * TILE_H;
const top = isoTopPoints(TILE_W, TILE_H);
const center = (c: AxialCoord): Point => {
  const g = isoGridPosition(c, TILE_W, TILE_H);
  return { x: g.x + TILE_W / 2, y: g.y + TILE_H / 2 };
};
const polygon = (c: AxialCoord): Point[] => {
  const g = isoGridPosition(c, TILE_W, TILE_H);
  return top.map((p) => ({ x: g.x + p.x, y: g.y + p.y }));
};
const display = (route: AxialCoord[]) => routeDisplayPointsOnMap(route, TILE_W, TILE_H, EPS);

/** Concatenate straight hex lines into one route (no duplicate joints). */
const through = (...corners: AxialCoord[]): AxialCoord[] => {
  const out: AxialCoord[] = [];
  for (let i = 1; i < corners.length; i++) {
    const leg = hexLine(corners[i - 1], corners[i]);
    out.push(...(i === 1 ? leg : leg.slice(1)));
  }
  return out;
};
const c = (q: number, r: number): AxialCoord => ({ q, r });

/** Distinct straight segments: count of direction changes + 1. */
function segmentCount(points: Point[]): number {
  let count = 1;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2];
    const b = points[i - 1];
    const d = points[i];
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(cross) > 1e-6) count++;
  }
  return count;
}

function expectRuleHolds(route: AxialCoord[], points: Point[]) {
  const onRoute = new Set(route.map(coordKey));
  const outsiders = new Map<string, AxialCoord>();
  for (const h of route) for (const n of hexesInRadius(h, 1)) if (!onRoute.has(coordKey(n))) outsiders.set(coordKey(n), n);
  // Collected and asserted once: an expect() per sample makes this test take seconds.
  const violations: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (const [key, o] of outsiders) {
      const poly = polygon(o);
      if (segmentEntersPolygon(a, b, poly, EPS)) violations.push(`segment ${i - 1}-${i} clips into ${key}`);
      // Dense sampling as an independent check: no sample is deeper inside than eps.
      const m = center(o);
      const inner = poly.map((v) => {
        const f = 1 - (2 * EPS) / Math.hypot(v.x - m.x, v.y - m.y);
        return { x: m.x + (v.x - m.x) * f, y: m.y + (v.y - m.y) * f };
      });
      for (let s = 0; s <= 40; s++) {
        const p = { x: a.x + ((b.x - a.x) * s) / 40, y: a.y + ((b.y - a.y) * s) / 40 };
        if (pointInPolygon(p, inner, 0)) violations.push(`segment ${i - 1}-${i} sample ${s} inside ${key}`);
      }
    }
  }
  expect(violations).toEqual([]);
}

const routes: Record<string, AxialCoord[]> = {
  shallow: hexLine(c(0, 0), c(30, -3)),
  meander: [c(0, 0), c(-1, 1), c(-2, 1), c(-2, 0), c(-2, -1), c(-1, -1), c(-1, -2), c(-2, -2), c(-3, -2), c(-2, -3), c(-1, -3), c(0, -4), c(-1, -4)],
  mixed: hexLine(c(0, 0), c(30, -11)),
  axisE: hexLine(c(0, 0), c(12, 0)),
  horizontal: hexLine(c(0, 0), c(20, -10)),
  between1: hexLine(c(0, 0), c(10, -5)),
  between2: hexLine(c(0, 0), c(-5, 10)),
  between3: hexLine(c(0, 0), c(-10, 5)),
  lShape: through(c(0, 0), c(8, 0), c(8, 7)),
  zigzag: [c(0, 0), c(1, 0), c(1, 1), c(2, 1), c(2, 2), c(3, 2), c(3, 3), c(4, 3)],
  corner: through(c(0, 0), c(6, -3), c(6, 3), c(0, 3)),
};

describe('routeDisplayPointsOnMap', () => {
  it('returns one point per hex, with exact centres at both ends', () => {
    for (const route of Object.values(routes)) {
      const pts = display(route);
      expect(pts).toHaveLength(route.length);
      expect(pts[0]).toEqual(center(route[0]));
      expect(pts[pts.length - 1]).toEqual(center(route[route.length - 1]));
    }
  });

  it('straightens a meandering route into fewer segments, each point inside its own hex', () => {
    const route = through(c(0, 0), c(-1, 1), c(-2, 1), c(-2, 0), c(-2, -1), c(-1, -1), c(-1, -2), c(-2, -2), c(-3, -2), c(-2, -3), c(-1, -3), c(0, -4), c(-1, -4));
    const pts = display(route);
    expect(route).toHaveLength(13);
    expect(segmentCount(pts)).toBeLessThan(segmentCount(route.map(center)));
    pts.forEach((p, k) => expect(pointInPolygon(p, polygon(route[k]), EPS)).toBe(true));
    expect(pts.some((p, k) => Math.hypot(p.x - center(route[k]).x, p.y - center(route[k]).y) > 1)).toBe(true);
    expectRuleHolds(route, pts);
  });

  it('keeps a bend per centre where a shortcut would cut into a corner hex', () => {
    // (0,0) -> (2,0) -> (3,-1): the straight cut from the first to the last centre enters the off-route hex (2,-1).
    const route = [c(0, 0), c(1, 0), c(2, 0), c(3, -1)];
    expect(display(route)).toEqual(route.map(center));
  });

  it('never enters a hex that is not on the route', () => {
    for (const [name, route] of Object.entries(routes)) {
      expectRuleHolds(route, display(route));
      expect(name).toBeTruthy();
    }
  });

  it('draws every between-axis direction as one segment running along hex edges', () => {
    for (const name of ['horizontal', 'between1', 'between2', 'between3']) {
      const route = routes[name];
      const pts = display(route);
      expect(segmentCount(pts), name).toBe(1);
      pts.forEach((p, k) => expect(pointInPolygon(p, polygon(route[k]), 1e-6), name).toBe(true));
      expectRuleHolds(route, pts);
    }
  });

  it('straightens the near-horizontal case without entering other hexes', () => {
    const route = routes.mixed;
    const pts = display(route);
    expect(segmentCount(pts)).toBeLessThan(segmentCount(route.map(center)));
    expectRuleHolds(route, pts);
  });

  it('orders the points along each segment', () => {
    for (const route of Object.values(routes)) {
      const pts = display(route);
      let i = 0;
      while (i < pts.length - 1) {
        // Extent of the straight run starting at i.
        let j = i + 1;
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        while (j + 1 < pts.length) {
          const ex = pts[j + 1].x - pts[j].x;
          const ey = pts[j + 1].y - pts[j].y;
          if (Math.abs(dx * ey - dy * ex) > 1e-6 || dx * ex + dy * ey <= 0) break;
          j++;
        }
        for (let k = i + 1; k <= j; k++) {
          const along = (pts[k].x - pts[k - 1].x) * dx + (pts[k].y - pts[k - 1].y) * dy;
          expect(along).toBeGreaterThan(0);
        }
        i = j;
      }
    }
  });
});
