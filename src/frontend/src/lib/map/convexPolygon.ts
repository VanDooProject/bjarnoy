// Small convex-polygon helpers for drawing a stroke with a region cut out (the realm border behind a land hex's top face), as filled
// polygons instead of a stencil mask: Pixi masks cost a render pass each, polygons stay in the one Graphics.

export interface Pt {
  x: number;
  y: number;
}

/** Polygons smaller than this (world px squared) are slivers from rounding, not pieces worth drawing. */
const MIN_AREA = 1e-4;

/** Absolute area of a simple polygon. */
export function polygonArea(poly: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Sutherland-Hodgman against one half-plane: the part of `poly` where `side(p) >= 0`, with `side` linear in `p`. */
function clipHalfPlane(poly: readonly Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const next = poly[(i + 1) % poly.length];
    const sc = side(cur);
    const sn = side(next);
    if (sc >= 0) out.push(cur);
    if ((sc >= 0) !== (sn >= 0)) {
      const t = sc / (sc - sn);
      out.push({ x: cur.x + t * (next.x - cur.x), y: cur.y + t * (next.y - cur.y) });
    }
  }
  return out;
}

/**
 * `subject` minus `clip`, both convex, as disjoint convex pieces (so a translucent fill does not double where they would overlap).
 * Walks `clip`'s edges: the part of the remainder outside an edge is a piece, the part inside carries on to the next edge.
 */
export function subtractConvex(subject: readonly Pt[], clip: readonly Pt[]): Pt[][] {
  const centre = {
    x: clip.reduce((sum, p) => sum + p.x, 0) / clip.length,
    y: clip.reduce((sum, p) => sum + p.y, 0) / clip.length,
  };
  const pieces: Pt[][] = [];
  let rest: Pt[] = [...subject];
  for (let i = 0; i < clip.length && rest.length >= 3; i++) {
    const p = clip[i];
    const q = clip[(i + 1) % clip.length];
    const cross = (x: Pt) => (q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x);
    const inward = cross(centre) >= 0 ? 1 : -1;
    const outside = clipHalfPlane(rest, (x) => -inward * cross(x));
    if (outside.length >= 3 && polygonArea(outside) > MIN_AREA) pieces.push(outside);
    rest = clipHalfPlane(rest, (x) => inward * cross(x));
  }
  return pieces;
}

/** The stadium shape a round-capped stroke of `width` along a to b covers, as a convex polygon (`capSegments` straight pieces per end). */
export function capsulePolygon(a: Pt, b: Pt, width: number, capSegments = 6): Pt[] {
  const r = width / 2;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const poly: Pt[] = [];
  for (let i = 0; i <= capSegments; i++) {
    const t = angle - Math.PI / 2 + (Math.PI * i) / capSegments;
    poly.push({ x: b.x + r * Math.cos(t), y: b.y + r * Math.sin(t) });
  }
  for (let i = 0; i <= capSegments; i++) {
    const t = angle + Math.PI / 2 + (Math.PI * i) / capSegments;
    poly.push({ x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t) });
  }
  return poly;
}

/** A stroke of `width` along a to b with every `clips` polygon cut out, as disjoint convex pieces. */
export function clippedStrokePieces(a: Pt, b: Pt, width: number, clips: readonly (readonly Pt[])[]): Pt[][] {
  let pieces: Pt[][] = [capsulePolygon(a, b, width)];
  for (const clip of clips) pieces = pieces.flatMap((piece) => subtractConvex(piece, clip));
  return pieces;
}
