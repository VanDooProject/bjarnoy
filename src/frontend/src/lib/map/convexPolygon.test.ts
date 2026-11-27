import { describe, expect, it } from 'vitest';
import { capsulePolygon, clippedStrokePieces, polygonArea, subtractConvex, type Pt } from './convexPolygon';

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('subtractConvex', () => {
  it('returns the subject whole when the clip is elsewhere', () => {
    const pieces = subtractConvex(square(0, 0, 10, 10), square(20, 20, 30, 30));
    expect(pieces.reduce((sum, p) => sum + polygonArea(p), 0)).toBeCloseTo(100);
  });

  it('returns nothing when the clip covers the subject', () => {
    expect(subtractConvex(square(2, 2, 4, 4), square(0, 0, 10, 10))).toEqual([]);
  });

  it('keeps the area outside the clip: a square with a corner cut out', () => {
    const pieces = subtractConvex(square(0, 0, 10, 10), square(5, 5, 15, 15));
    expect(pieces.reduce((sum, p) => sum + polygonArea(p), 0)).toBeCloseTo(100 - 25);
  });

  it('gives disjoint pieces: their areas add up to the subject minus the overlap', () => {
    const subject = square(0, 0, 10, 10);
    const clip = square(3, 3, 7, 7); // a hole in the middle: four pieces around it
    const pieces = subtractConvex(subject, clip);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.reduce((sum, p) => sum + polygonArea(p), 0)).toBeCloseTo(100 - 16);
  });

  it('does not depend on the winding of the clip', () => {
    const clip = square(5, 5, 15, 15);
    const a = subtractConvex(square(0, 0, 10, 10), clip);
    const b = subtractConvex(square(0, 0, 10, 10), [...clip].reverse());
    expect(b.reduce((s, p) => s + polygonArea(p), 0)).toBeCloseTo(a.reduce((s, p) => s + polygonArea(p), 0));
  });
});

describe('capsulePolygon', () => {
  it('covers about the stadium area: a rectangle plus a circle', () => {
    const capsule = capsulePolygon({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 12);
    expect(polygonArea(capsule)).toBeCloseTo(10 * 4 + Math.PI * 4, 0);
  });

  it('is a circle for a zero-length segment', () => {
    expect(polygonArea(capsulePolygon({ x: 1, y: 1 }, { x: 1, y: 1 }, 2, 12))).toBeCloseTo(Math.PI, 0);
  });
});

describe('clippedStrokePieces', () => {
  it('draws nothing of a stroke wholly under the clip', () => {
    expect(clippedStrokePieces({ x: 2, y: 5 }, { x: 8, y: 5 }, 1, [square(0, 0, 10, 10)])).toEqual([]);
  });

  it('leaves no piece vertex strictly inside the clip', () => {
    const clip = square(0, 0, 10, 10);
    const pieces = clippedStrokePieces({ x: 5, y: 5 }, { x: 30, y: 5 }, 7, [clip]);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces.flat()) expect(p.x > 1e-6 && p.x < 10 - 1e-6 && p.y > 1e-6 && p.y < 10 - 1e-6).toBe(false);
  });
});
