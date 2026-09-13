// Isometric hex-plate geometry: flat-top, odd-column offset, shared by the
// world map and the settlement view (they read as the same lattice at
// different zoom — see docs/design/zip-brainstorms.md's world-map caption
// "Same hex lattice as the settlement view, flattened."). Matches the tile
// art in public/hextiles (200x300, top face 200x92 at y=140), generalised to
// an arbitrary tile width `w` via src/lib/map/textures.ts's fractions.

import type { AxialCoord } from './coords';
import { axialToOddQ } from './coords';

export interface Point {
  x: number;
  y: number;
}

/** Top-face hexagon, relative to the tile's grid origin (see isoGridPosition). */
export function isoTopPoints(w: number, h: number): Point[] {
  return [
    { x: 0, y: h / 2 },
    { x: w / 4, y: 0 },
    { x: (3 * w) / 4, y: 0 },
    { x: w, y: h / 2 },
    { x: (3 * w) / 4, y: h },
    { x: w / 4, y: h },
  ];
}

/** Grid position (top-left of the top-face bounding box) for a hex. */
export function isoGridPosition(c: AxialCoord, w: number, h: number): Point {
  const { col, row } = axialToOddQ(c);
  const colPitch = w * 0.75;
  const x = col * colPitch;
  const y = row * h + (col & 1 ? h / 2 : 0);
  return { x, y };
}

/**
 * Inverse of isoGridPosition: which hex contains this world point.
 *
 * isoGridPosition places a hex by the top-left of its bounding box, not by
 * its centre — so naively rounding `world.x / colPitch` (as if hex centres
 * sat at multiples of colPitch) is off by half a hex's worth of pixels; the
 * true centre of column C sits at `C * colPitch + w / 2`, not `C * colPitch`.
 * That's what actually caused the hover highlight (and, less visibly,
 * click/tap hit-testing) to land on the wrong hex.
 *
 * Correcting for that gets the right answer almost always, but rather than
 * trust a second hand-derived formula, this tiling's own isoTopPoints
 * hexagon — which abuts its neighbours with no gaps or overlaps by
 * construction — is used to verify it: check the estimate and its six
 * neighbours with a real point-in-polygon test and return whichever one
 * actually contains the point.
 */
export function isoPixelToAxial(world: Point, w: number, h: number): AxialCoord {
  const colPitch = w * 0.75;
  const col = Math.round((world.x - w / 2) / colPitch);
  const row = Math.round((world.y - h / 2 - (col & 1 ? h / 2 : 0)) / h);
  const estQ = col;
  const estR = row - (col - (col & 1)) / 2;

  // Hand-inlined rather than written with oddQToAxial/neighbors/isoTopPoints/
  // pointInPolygon, which is what this used to be. Read as prose that version
  // allocates about fifteen objects per call — a coord for the estimate, an
  // array of six more for its neighbours, and a fresh six-point polygon per
  // candidate — and this is not a call that happens once per click.
  // `bakeWaterMask` runs it once per texel, 670k times for a single
  // zoomed-out world map: at 0.55us that was ~370ms of a ~600ms bake, nearly
  // all of it allocation and the GC behind it.
  //
  // The geometry is unchanged, deliberately: same candidate order (the
  // estimate, then its six neighbours in NEIGHBOR_DIRS order), the same
  // crossing test, the same fallback to the estimate. A point exactly on a
  // shared edge still resolves to exactly the hex it resolved to before.
  for (let i = -1; i < 6; i++) {
    const q = i < 0 ? estQ : estQ + NEIGHBOR_DQ[i];
    const r = i < 0 ? estR : estR + NEIGHBOR_DR[i];
    // isoGridPosition, inlined.
    const grow = r + (q - (q & 1)) / 2;
    const ox = q * colPitch;
    const oy = grow * h + (q & 1 ? h / 2 : 0);
    if (inTopFace(world.x - ox, world.y - oy, w, h)) return { q, r };
  }
  return { q: estQ, r: estR };
}

// NEIGHBOR_DIRS (coords.ts) as parallel arrays, so the candidate walk above
// reads a direction without building a coord for it.
const NEIGHBOR_DQ = [1, 1, 0, -1, -1, 0];
const NEIGHBOR_DR = [0, -1, -1, 0, 1, 1];

/**
 * `pointInPolygon(pt, isoTopPoints(w, h))` for a point already expressed
 * relative to the hex's grid origin, with the polygon written out.
 *
 * Two things make it exact rather than merely equivalent:
 *
 * - Only four of the six edges can toggle. `isoTopPoints`' edges P1->P2 and
 *   P4->P5 are horizontal, and the crossing test's `a.y > pt.y !== b.y > pt.y`
 *   is false whenever the two endpoints share a y — for every pt, so dropping
 *   them cannot change the parity.
 * - The bounding-box rejection is not a separate approximation of the
 *   polygon. Outside `[0, w] x [0, h]` the remaining four edges always toggle
 *   an even number of times (x below every edge's crossing, or above all of
 *   them), so the walk would return false there anyway.
 *
 * What is left is the same `<` against the same interpolated edge x, in the
 * same order, so boundary points land the same way they did.
 */
function inTopFace(x: number, y: number, w: number, h: number): boolean {
  if (x < 0 || x > w || y < 0 || y > h) return false;
  const x1 = w / 4;
  const x3 = (3 * w) / 4;
  const ym = h / 2;
  let inside = false;
  // P0(0, h/2) <- P5(w/4, h)
  if (ym > y !== h > y && x < (x1 * (y - ym)) / ym) inside = !inside;
  // P1(w/4, 0) <- P0(0, h/2)
  if (0 > y !== ym > y && x < (-x1 * y) / ym + x1) inside = !inside;
  // P3(w, h/2) <- P2(3w/4, 0)
  if (ym > y !== 0 > y && x < ((x3 - w) * (y - ym)) / -ym + w) inside = !inside;
  // P4(3w/4, h) <- P3(w, h/2)
  if (h > y !== ym > y && x < ((w - x3) * (y - h)) / -ym + x3) inside = !inside;
  return inside;
}

/**
 * Draw-order key so overlapping isometric plates stack correctly: primarily
 * by actual screen depth (a tile further down-screen must draw after — on
 * top of — one further up), column only breaking ties within the same
 * depth. Two considerations that are easy to get wrong here, both of which
 * previously produced tiles bleeding through each other at the wrong depth:
 *
 * - Odd columns sit half a row lower on screen than even ones
 *   (isoGridPosition's `col & 1 ? h / 2 : 0`), so two hexes with the same
 *   `row` are *not* at the same visual depth — sorting on `row` alone (as
 *   this did before) put the wrong one in front at every odd/even column
 *   boundary. Doubling the row and adding the column's parity back in
 *   recovers the true half-row interleaving.
 * - The column term's multiplier has to comfortably exceed the widest
 *   column range the map can ever show at once, or a tile many columns
 *   over from an earlier row can outrank one directly below it — which is
 *   exactly what a small multiplier like the legacy prototypes used
 *   (`round(y * 10 + q)`, fine for their single fixed-size board, wrong for
 *   an arbitrarily panned world map) gets wrong.
 */
export function isoDepthKey(c: AxialCoord): number {
  const { col, row } = axialToOddQ(c);
  const effectiveRow = row * 2 + (col & 1 ? 1 : 0);
  return effectiveRow * 100000 + col;
}
