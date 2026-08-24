// Isometric hex-plate geometry: flat-top, odd-column offset, shared by the
// world map and the settlement view (they read as the same lattice at
// different zoom — see docs/design/zip-brainstorms.md's world-map caption
// "Same hex lattice as the settlement view, flattened."). Matches the tile
// art in public/hextiles (200x300, top face 200x92 at y=140), generalised to
// an arbitrary tile width `w` via src/lib/map/textures.ts's fractions.

import type { AxialCoord } from './coords';
import { axialToOddQ, neighbors, oddQToAxial } from './coords';

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
  const estimate = oddQToAxial({ col, row });

  for (const c of [estimate, ...neighbors(estimate)]) {
    const grid = isoGridPosition(c, w, h);
    const poly = isoTopPoints(w, h).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
    if (pointInPolygon(world, poly)) return c;
  }
  return estimate;
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
