// Pixel geometry for two hex renderings sharing one lattice:
//  - flat 2D hexes for the world map (zip 7: "no images (yet)" on a sea background)
//  - isometric plates for the settlement view (matches prototypes/village_view
//    geometry: flat-top, odd-column offset, top face + a thin skirt)

import type { AxialCoord } from './coords';
import { axialToOddQ } from './coords';

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** Flat-top axial -> pixel, world-map (top-down) projection. */
export function flatTopPixel(c: AxialCoord, size: number): Point {
  return {
    x: size * (1.5 * c.q),
    y: size * ((SQRT3 / 2) * c.q + SQRT3 * c.r),
  };
}

/** Corner offsets (relative to hex center) for a flat-top hex of the given size. */
export function flatTopCorners(size: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return pts;
}

/**
 * Isometric "plate" geometry, generalised from the fixed 200x100/200x92
 * constants documented in the prototypes READMEs. `w` is the tile box width;
 * `h` is the top-face height (100 for the wide world variant, 92 for the
 * settlement-board variant); `depth` is the skirt height.
 */
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

export function isoSidePoints(w: number, h: number, depth: number): Point[] {
  const half = h / 2;
  return [
    { x: 0, y: 0 },
    { x: w / 4, y: half },
    { x: (3 * w) / 4, y: half },
    { x: w, y: 0 },
    { x: w, y: depth },
    { x: (3 * w) / 4, y: half + depth },
    { x: w / 4, y: half + depth },
    { x: 0, y: depth },
  ];
}

/** Grid position (top-left of the tile box) for the isometric renderer. */
export function isoGridPosition(c: AxialCoord, w: number, h: number): Point {
  const { col, row } = axialToOddQ(c);
  const colPitch = w * 0.75;
  const x = col * colPitch;
  const y = row * h + (col & 1 ? h / 2 : 0);
  return { x, y };
}

/** Draw-order key so overlapping isometric plates stack correctly. */
export function isoDepthKey(c: AxialCoord): number {
  const { col, row } = axialToOddQ(c);
  return Math.round(row * 10 + col);
}
