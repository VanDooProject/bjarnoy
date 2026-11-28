// The visible top face of one hex, for single-hex overlays (hover outline, pinned-hex highlight, dispatch reach wash). In the
// settlement view the sea art's top face sits lower than land's (`TILE_ART_SEA_TOPFACE_DROP_FRAC`), so a sea hex's overlay drops by
// that much, and land in front of it (its top face at land level, drawn after the sea) hides whatever of the dropped outline lies on
// that land's top face. Same rule the realm border follows on coasts (realmBorderWaterline.ts).
import type { AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';
import { capsulePolygon, clippedStrokePieces, polygonArea, subtractConvex, type Pt } from './convexPolygon';
import { neighbourAcrossEdge } from './realmBorders';
import { TILE_ART_SEA_TOPFACE_DROP_FRAC } from './textures';

export interface HexOutline {
  /** How far the top face is drawn below the land-level grid (0 for land). */
  drop: number;
  /** The visible part of the top face: the whole hex as one polygon, or disjoint pieces where land in front hides some of it. */
  fill: Pt[][];
  /** The six edges. `pieces` is null for an edge nothing hides (a plain stroke), else the visible parts of its stroke as polygons.
   *  `strokeWidth` 0 (a fill-only overlay) leaves every edge null. */
  edges: { a: Pt; b: Pt; pieces: Pt[][] | null }[];
}

/** How far a lowered (sea) hex's top face sits below land's, in world px for top faces `tileW` wide. */
export function seaTopFaceDrop(tileW: number): number {
  return tileW * TILE_ART_SEA_TOPFACE_DROP_FRAC;
}

/** Whether two convex polygons share any area: `a` minus `b` leaves less than all of `a`. */
function convexOverlap(a: Pt[], b: Pt[]): boolean {
  const rest = subtractConvex(a, b).reduce((sum, p) => sum + polygonArea(p), 0);
  return rest < polygonArea(a) - 1e-6;
}

/** Edges 3..5 of isoTopPoints() face the hexes in front (drawn later); edges 0..2 face the ones behind. */
const FRONT_EDGES = [3, 4, 5] as const;

/**
 * The outline of `c`'s visible top face for a stroke `strokeWidth` wide. `isLowered` says whether a hex's art is drawn lowered (sea in
 * the settlement view).
 */
export function loweredHexOutline(
  c: AxialCoord,
  tileW: number,
  tileH: number,
  isLowered: (q: number, r: number) => boolean,
  strokeWidth: number,
): HexOutline {
  const topAt = (h: AxialCoord, drop: number): Pt[] => {
    const grid = isoGridPosition(h, tileW, tileH);
    return isoTopPoints(tileW, tileH).map((p) => ({ x: grid.x + p.x, y: grid.y + drop + p.y }));
  };
  const drop = isLowered(c.q, c.r) ? seaTopFaceDrop(tileW) : 0;
  const top = topAt(c, drop);
  const clips =
    drop > 0
      ? FRONT_EDGES.map((e) => neighbourAcrossEdge(c, e))
          .filter((n) => !isLowered(n.q, n.r))
          .map((n) => topAt(n, 0))
      : [];
  const edges = top.map((a, e) => {
    const b = top[(e + 1) % 6];
    if (clips.length === 0 || strokeWidth <= 0) return { a, b, pieces: null };
    // An edge no clip reaches stays a plain stroke: only cut edges are drawn as polygons.
    const capsule = capsulePolygon(a, b, strokeWidth);
    if (clips.every((clip) => !convexOverlap(capsule, clip))) return { a, b, pieces: null };
    return { a, b, pieces: clippedStrokePieces(a, b, strokeWidth, clips) };
  });
  let fill: Pt[][] = [top];
  for (const clip of clips) fill = fill.flatMap((piece) => subtractConvex(piece, clip));
  return { drop, fill, edges };
}
