import { describe, expect, it } from 'vitest';
import { hash01, texelLump, valueNoise } from './fogLump';

/** Shared with `FogMaskGeneratorTests.TexelLump_matches_the_golden_table` (C#): the same texels, the same bytes. */
const GOLDEN_LUMPS: ReadonlyArray<readonly [u: number, v: number, lump: number]> = [
  [0, 0, 53],
  [1, 1, 89],
  [-7, 13, 183],
  [23, -40, 97],
  [-31, -18, 98],
  [100, 257, 148],
  [5, -2, 71],
];

describe('fogLump', () => {
  it('matches the golden table the backend port is pinned to', () => {
    for (const [u, v, lump] of GOLDEN_LUMPS) expect(texelLump(u, v), `texel (${u}, ${v})`).toBe(lump);
  });

  it('hashes into [0, 1) and is stable per input', () => {
    for (const [x, y] of [[0, 0], [-5, 9], [123456, -98765]]) {
      const h = hash01(x, y, 11);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(hash01(x, y, 11)).toBe(h);
    }
    expect(hash01(1, 2, 11)).not.toBe(hash01(1, 2, 7));
  });

  it('is smooth: value noise at a lattice point equals its hash, and neighbouring texels differ little', () => {
    expect(valueNoise(3, -4, 7)).toBeCloseTo(hash01(3, -4, 7), 12);
    for (let u = -6; u < 6; u++) {
      expect(Math.abs(texelLump(u + 1, 20) - texelLump(u, 20))).toBeLessThan(80);
    }
  });
});
