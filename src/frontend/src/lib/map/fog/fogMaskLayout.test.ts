import { describe, expect, it } from 'vitest';
import { hexesInRadius } from '../../hex/coords';
import { diagonalNeighboursForInterpolation, isHexTexel, toHex, toTexel, worldMaskBounds } from './fogMaskLayout';

function contains(bounds: ReturnType<typeof worldMaskBounds>, u: number, v: number): boolean {
  return u >= bounds.minU && u < bounds.maxU && v >= bounds.minV && v < bounds.maxV;
}

describe('worldMaskBounds', () => {
  it('covers every hex in the radius plus its interpolation neighbours', () => {
    // Mirrors FogMaskLayoutTests.cs's WorldBounds_covers_every_hex_in_the_radius_plus_its_interpolation_neighbours
    // — same property, same radius — so a divergence between the two ports shows up here.
    const radius = 12;
    const bounds = worldMaskBounds(radius);

    for (const hex of hexesInRadius({ q: 0, r: 0 }, radius)) {
      const { u, v } = toTexel(hex);
      expect(contains(bounds, u, v)).toBe(true);

      for (const [du, dv] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        expect(contains(bounds, u + du, v + dv)).toBe(true);
      }
    }
  });

  it('rejects a negative radius', () => {
    expect(() => worldMaskBounds(-1)).toThrow(RangeError);
  });

  it('matches the half-open range at radius 0', () => {
    // A single hex at the origin: odd-q col=0,row=0 -> texel (0,0), padded by
    // one texel on every side.
    const bounds = worldMaskBounds(0);

    expect(bounds).toEqual({ minU: -1, minV: -1, maxU: 2, maxV: 2, width: 3, height: 3 });
  });
});

describe('toTexel / toHex / isHexTexel', () => {
  // Mirrors FogMaskLayoutTests.cs's matching Fact names — same properties,
  // same radius — so a divergence between the two ports shows up here.
  it('lands every hex on an even-parity texel', () => {
    for (const hex of hexesInRadius({ q: 0, r: 0 }, 15)) {
      expect(isHexTexel(toTexel(hex))).toBe(true);
    }
  });

  it('round-trips through toHex', () => {
    for (const hex of hexesInRadius({ q: 0, r: 0 }, 15)) {
      expect(toHex(toTexel(hex))).toEqual(hex);
    }
  });

  it('never lands two adjacent hexes on the same texel', () => {
    const seen = new Set<string>();
    for (const hex of hexesInRadius({ q: 0, r: 0 }, 10)) {
      const { u, v } = toTexel(hex);
      const key = `${u},${v}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('diagonalNeighboursForInterpolation', () => {
  it('returns four distinct even-parity texels for an odd-parity texel', () => {
    const oddTexel = { u: 1, v: 0 };
    expect(isHexTexel(oddTexel)).toBe(false);

    const neighbours = diagonalNeighboursForInterpolation(oddTexel);

    expect(neighbours).toHaveLength(4);
    expect(new Set(neighbours.map((n) => `${n.u},${n.v}`)).size).toBe(4);
    for (const n of neighbours) expect(isHexTexel(n)).toBe(true);
  });
});
