import { describe, expect, it } from 'vitest';
import { axialToOddQ, hexesInRadius } from '../../hex/coords';
import {
  diagonalNeighboursForInterpolation,
  fogMaskPlacement,
  isHexTexel,
  toHex,
  toTexel,
  worldMaskBounds,
} from './fogMaskLayout';

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

  // The pre-chunking implementation, kept as the oracle for the closed form:
  // it walked every hex of the disc (~48M at radius 4000). Mirrors
  // FogMaskLayoutTests.cs's WorldBounds_closed_form_equals_the_brute_force_hex_walk.
  it.each([0, 1, 2, 3, 7, 16, 31, 60, 101])('closed form equals the brute-force hex walk at radius %i', (radius) => {
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (const hex of hexesInRadius({ q: 0, r: 0 }, radius)) {
      const { u, v } = toTexel(hex);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }

    const bounds = worldMaskBounds(radius);

    expect(bounds.minU).toBe(minU - 1);
    expect(bounds.minV).toBe(minV - 1);
    expect(bounds.maxU).toBe(maxU + 2);
    expect(bounds.maxV).toBe(maxV + 2);
    expect(bounds.width).toBe(bounds.maxU - bounds.minU);
    expect(bounds.height).toBe(bounds.maxV - bounds.minV);
  });

  it('answers radius 4000 at once instead of walking 48M hexes', () => {
    expect(worldMaskBounds(4000)).toEqual({
      minU: -4001,
      minV: -8001,
      maxU: 4002,
      maxV: 8002,
      width: 8003,
      height: 16003,
    });
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

describe('fogMaskPlacement', () => {
  // HexMapRenderer's own tile constants (TILE_W, TILE_W * 92/200) — the
  // placement affine is only ever correct relative to the geometry the
  // terrain is actually drawn with, so the assertions below use the real
  // numbers rather than round test values.
  const TILE_W = 168;
  const TILE_H = (TILE_W * 92) / 200;
  const RADIUS = 12;

  /** isoGridPosition's world point for a hex, plus half a tile — the centre of its top face. */
  function hexCentreWorld(hex: { q: number; r: number }): { x: number; y: number } {
    const { col, row } = axialToOddQ(hex);
    return {
      x: col * TILE_W * 0.75 + TILE_W / 2,
      y: row * TILE_H + (col & 1 ? TILE_H / 2 : 0) + TILE_H / 2,
    };
  }

  function toMaskUV(world: { x: number; y: number }, placement: ReturnType<typeof fogMaskPlacement>) {
    return {
      u: world.x * placement.scale[0] + placement.offset[0],
      v: world.y * placement.scale[1] + placement.offset[1],
    };
  }

  it('samples a hex centre at the centre of its own texel', () => {
    // The regression this exists for: the affine used to map
    // isoGridPosition's *bounding-box top-left* through `texel / size`,
    // which lands a hex's corner on its texel index and then reads half a
    // texel short of the texel's own centre. A hex centre sampled
    // continuous texel (col + 1/6, 2*row + parity + 0.5) instead of
    // (col, 2*row + parity) — about a quarter hex of drift between the fog
    // boundary and the ground under it.
    const bounds = worldMaskBounds(RADIUS);
    const placement = fogMaskPlacement(RADIUS, TILE_W, TILE_H);

    for (const hex of hexesInRadius({ q: 0, r: 0 }, RADIUS)) {
      const texel = toTexel(hex);
      const uv = toMaskUV(hexCentreWorld(hex), placement);

      // A texture samples texel i at (i + 0.5) / size.
      expect(uv.u * bounds.width).toBeCloseTo(texel.u - bounds.minU + 0.5, 10);
      expect(uv.v * bounds.height).toBeCloseTo(texel.v - bounds.minV + 0.5, 10);
    }
  });

  it('maps one hex step to exactly one texel step on each axis', () => {
    // The scale half of the affine, independent of the offset half: a
    // column step is one texel in u, and a row step is two in v (the
    // doubled-row space of §2.1).
    const bounds = worldMaskBounds(RADIUS);
    const placement = fogMaskPlacement(RADIUS, TILE_W, TILE_H);

    const u = (hex: { q: number; r: number }) => toMaskUV(hexCentreWorld(hex), placement).u * bounds.width;
    const v = (hex: { q: number; r: number }) => toMaskUV(hexCentreWorld(hex), placement).v * bounds.height;

    // +q in axial is +1 odd-q column; +r at fixed q is +1 odd-q row.
    expect(u({ q: 1, r: 0 }) - u({ q: 0, r: 0 })).toBeCloseTo(1, 10);
    expect(v({ q: 0, r: 1 }) - v({ q: 0, r: 0 })).toBeCloseTo(2, 10);
  });

  it('places any texel window, not only a whole world: a hex inside a chunk window samples its own texel', () => {
    // The live mask is a chunk window (fogChunks.ts windowBounds), so the
    // same affine has to be right for a rectangle that is nowhere near the
    // world's own bounds.
    const window = { minU: 64, minV: -128, maxU: 192, maxV: 0, width: 128, height: 128 };
    const placement = fogMaskPlacement(window, TILE_W, TILE_H);
    const hex = toHex({ u: 100, v: -50 }); // even parity, inside the window
    const texel = toTexel(hex);
    expect(texel).toEqual({ u: 100, v: -50 });

    const uv = toMaskUV(hexCentreWorld(hex), placement);

    expect(uv.u * window.width).toBeCloseTo(texel.u - window.minU + 0.5, 10);
    expect(uv.v * window.height).toBeCloseTo(texel.v - window.minV + 0.5, 10);
  });

  it('keeps every hex in the radius inside the 0..1 UV box', () => {
    const placement = fogMaskPlacement(RADIUS, TILE_W, TILE_H);

    for (const hex of hexesInRadius({ q: 0, r: 0 }, RADIUS)) {
      const uv = toMaskUV(hexCentreWorld(hex), placement);
      expect(uv.u).toBeGreaterThan(0);
      expect(uv.u).toBeLessThan(1);
      expect(uv.v).toBeGreaterThan(0);
      expect(uv.v).toBeLessThan(1);
    }
  });
});
