import type { AxialCoord } from '../hex/coords';
import { coordKey, hexLine, neighbors } from '../hex/coords';
import type { Point } from '../hex/geometry';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';

/**
 * Display points for a hex route: one per route hex, so the drawn route can be a few straight segments instead of a
 * line through every hex centre (which shows a half-hex zigzag on a shallow straight hex line).
 *
 * Hard rule: the drawn line never enters the interior of a hex that is not on the route (running along its edge or through a vertex is fine) (`eps` is the boundary tolerance, in the
 * `center`/`polygon` coordinate space). The first and last point are exactly the first and last hex centre.
 *
 * Greedy, like the path smoother: from the segment start, take the farthest route hex the straight segment can reach
 * while staying clear of every non-route hex, still passing the route hexes in order, and still having each hex's
 * projected point inside that hex (so a marker "at" hex k is drawn inside hex k). Each hex's display point is its centre
 * projected onto the chosen segment.
 */
export function routeDisplayPoints(
  route: readonly AxialCoord[],
  center: (c: AxialCoord) => Point,
  polygon: (c: AxialCoord) => Point[],
  eps: number,
): Point[] {
  const n = route.length;
  if (n === 0) return [];
  const centers = route.map(center);
  const display: Point[] = centers.map((p) => ({ x: p.x, y: p.y }));
  if (n < 3) return display;

  const routeKeys = new Set(route.map(coordKey));
  const polygonCache = new Map<string, Point[]>();
  const polygonOf = (c: AxialCoord): Point[] => {
    const k = coordKey(c);
    let p = polygonCache.get(k);
    if (!p) {
      p = polygon(c);
      polygonCache.set(k, p);
    }
    return p;
  };

  const clear = (i: number, j: number): boolean => {
    const a = centers[i];
    const b = centers[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;

    // Order and containment of the route hexes between the two ends.
    let prevT = 0;
    for (let k = i + 1; k < j; k++) {
      const t = ((centers[k].x - a.x) * dx + (centers[k].y - a.y) * dy) / len2;
      if (!(t > prevT) || !(t < 1)) return false;
      prevT = t;
      const p = { x: a.x + dx * t, y: a.y + dy * t };
      if (!pointInPolygon(p, polygonOf(route[k]), eps)) return false;
    }

    // Clearance from every hex near the straight hex line that is not on the route.
    const seen = new Set<string>();
    for (const h of hexLine(route[i], route[j])) {
      for (const c of [h, ...neighbors(h)]) {
        const key = coordKey(c);
        if (routeKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        if (segmentEntersPolygon(a, b, polygonOf(c), eps)) return false;
      }
    }
    return true;
  };

  let i = 0;
  while (i < n - 1) {
    let best = i + 1;
    for (let j = i + 2; j < n; j++) {
      if (clear(i, j)) best = j;
      else break;
    }
    const a = centers[i];
    const b = centers[best];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    for (let k = i + 1; k < best; k++) {
      const t = ((centers[k].x - a.x) * dx + (centers[k].y - a.y) * dy) / len2;
      display[k] = { x: a.x + dx * t, y: a.y + dy * t };
    }
    i = best;
  }
  return display;
}

/**
 * `routeDisplayPoints` on the map's own hex layout (`isoGridPosition`, top faces `tileW` x `tileH`), in world space. The geometry is
 * worked out with the top face stretched back into a regular hexagon, so a hex centre's projection onto a segment comes out the same
 * in every direction of the grid (edges and insides survive the stretch unchanged), and the result is squashed back.
 */
export function routeDisplayPointsOnMap(route: readonly AxialCoord[], tileW: number, tileH: number, eps: number): Point[] {
  const stretch = (tileW * Math.sqrt(3)) / 2 / tileH;
  const top = isoTopPoints(tileW, tileH);
  const centerOf = (c: AxialCoord): Point => {
    const g = isoGridPosition(c, tileW, tileH);
    return { x: g.x + tileW / 2, y: g.y + tileH / 2 };
  };
  const stretched = route.map((c) => {
    const p = centerOf(c);
    return { x: p.x, y: p.y * stretch };
  });
  // The ends of each straight run are hex centres: hand those back exactly, not through the stretch and back.
  return routeDisplayPoints(
    route,
    (c) => {
      const p = centerOf(c);
      return { x: p.x, y: p.y * stretch };
    },
    (c) => {
      const g = isoGridPosition(c, tileW, tileH);
      return top.map((p) => ({ x: g.x + p.x, y: (g.y + p.y) * stretch }));
    },
    eps * stretch,
  ).map((p, k) => (p.x === stretched[k].x && p.y === stretched[k].y ? centerOf(route[k]) : { x: p.x, y: p.y / stretch }));
}

/** Signed distance of `p` inside the convex polygon's edge `i` (positive: inside), given the polygon's winding sign. */
function insideDistance(p: Point, poly: readonly Point[], i: number, sign: number): number {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  return (sign * (ex * (p.y - a.y) - ey * (p.x - a.x))) / Math.hypot(ex, ey);
}

function windingSign(poly: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area >= 0 ? 1 : -1;
}

/** True when `p` lies in the convex polygon, its boundary included (points up to `eps` outside count as inside). */
export function pointInPolygon(p: Point, poly: readonly Point[], eps: number): boolean {
  const sign = windingSign(poly);
  for (let i = 0; i < poly.length; i++) if (insideDistance(p, poly, i, sign) < -eps) return false;
  return true;
}

/**
 * True when segment `a`-`b` enters the interior of the convex polygon: some part of it lies more than `eps` inside every
 * edge. A segment on an edge or touching a vertex does not (Cyrus-Beck clip against the polygon shrunk by `eps`).
 */
export function segmentEntersPolygon(a: Point, b: Point, poly: readonly Point[], eps: number): boolean {
  const sign = windingSign(poly);
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const da = insideDistance(a, poly, i, sign) - eps;
    const db = insideDistance(b, poly, i, sign) - eps;
    if (da <= 0 && db <= 0) return false;
    if (da > 0 && db > 0) continue;
    const t = da / (da - db);
    if (da > 0) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
    if (t1 - t0 <= 0) return false;
  }
  return t1 - t0 > 0;
}
