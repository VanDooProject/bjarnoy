import { describe, expect, it } from 'vitest';
import { hexDistance, hexEuclideanDistance, hexesInRadius } from './coords';

describe('hexEuclideanDistance', () => {
  // The whole point of this metric over hexDistance is the *shape* of its
  // contours: a hexDistance disk is a hexagon, and a fog ramp built on one
  // shows six corners once the edge shading is soft enough to see the shape
  // of. These pin the two properties the fog mask depends on — that the
  // metric actually distinguishes directions hexDistance conflates, and that
  // it stays within the bounds the generators' enumeration prunes assume.

  it('separates corner from between-corner directions that hexDistance conflates', () => {
    // Both are four steps away. (4, 0) points straight down an axis, (2, 2)
    // between two — in world space the second is visibly nearer, and only
    // the euclidean metric says so.
    expect(hexDistance({ q: 0, r: 0 }, { q: 4, r: 0 })).toBe(4);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);

    expect(hexEuclideanDistance({ q: 0, r: 0 }, { q: 4, r: 0 })).toBeCloseTo(4, 10);
    expect(hexEuclideanDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBeCloseTo(4 * (Math.sqrt(3) / 2), 10);
  });

  it('puts every immediate neighbour exactly one unit away', () => {
    // Unit centre spacing is what makes a euclidean distance directly
    // comparable with a radius counted in hexes, which is how both mask
    // generators mix the two.
    for (const neighbour of [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]) {
      expect(hexEuclideanDistance({ q: 0, r: 0 }, neighbour)).toBeCloseTo(1, 10);
    }
  });

  it('stays between sqrt(3)/2 and 1 times the step count', () => {
    // Both bounds are load-bearing. The upper one is why a ring of hexes is
    // still entirely inside its own radius under this metric, so the mask's
    // fully-revealed contour never clips a hex the player has explored; the
    // lower one is why enumerating candidates by step count and widening by
    // 2/sqrt(3) cannot miss one (FogMaskGenerator's MultiSourceDistance).
    const origin = { q: 0, r: 0 };
    for (const hex of hexesInRadius(origin, 12)) {
      const steps = hexDistance(origin, hex);
      const euclidean = hexEuclideanDistance(origin, hex);
      expect(euclidean).toBeLessThanOrEqual(steps + 1e-9);
      expect(euclidean).toBeGreaterThanOrEqual(steps * (Math.sqrt(3) / 2) - 1e-9);
    }
  });

  it('is symmetric and zero only at the same hex', () => {
    expect(hexEuclideanDistance({ q: 3, r: -2 }, { q: 3, r: -2 })).toBe(0);
    expect(hexEuclideanDistance({ q: 3, r: -2 }, { q: -1, r: 4 })).toBeCloseTo(
      hexEuclideanDistance({ q: -1, r: 4 }, { q: 3, r: -2 }),
      10,
    );
  });
});
