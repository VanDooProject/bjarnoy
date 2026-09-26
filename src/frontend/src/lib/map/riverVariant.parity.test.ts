// Locks riverVariantAt to the backend's mirroring TerrainSampler.RiverVariantAt
// (src/backend/src/Bjarnoy.Domain/World/TerrainSampler.cs), the same way
// worldGenerator.parity.test.ts locks generateTile to its own reference
// functions. The expected variants below were confirmed by running both
// implementations side by side over this same fixture set and diffing their
// output — they agreed on every case before this test existed. Regenerate
// them from the C# (never from this code) if either implementation's salt
// or weights are intentionally changed.
import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION, riverVariantAt, type RiverVariant } from './worldGenerator';
import type { RiverTileShape } from './types';

const CASES: [seed: number, q: number, r: number, shape: RiverTileShape, expected: RiverVariant][] = [
  [1, 0, 0, 'straight', 'plain'],
  [1, 3, -2, 'straight', 'island'],
  [1, -5, 4, 'bend', 'meander'],
  [1, 10, 10, 'bend60', 'plain'],
  [12345, 0, 0, 'straight', 'plain'],
  [12345, 7, -3, 'bend', 'meander'],
  [12345, -8, 2, 'bend60', 'plain'],
  [12345, 100, -50, 'straight', 'meander'],
  [777, 1, 1, 'straight', 'meander'],
  [777, 2, -2, 'bend', 'plain'],
  [777, -3, 3, 'bend60', 'plain'],
  [777, 20, 20, 'bend60', 'plain'],
  [777, -20, -20, 'bend', 'meander'],
  [999999, 0, 0, 'straight', 'plain'],
  [999999, 5, 5, 'bend', 'meander'],
  [999999, -5, -5, 'bend60', 'loop'],
  [1, 0, 0, 'spring', 'plain'],
  [1, 0, 0, 'confluence', 'plain'],
  [1, 0, 0, 'mouth', 'plain'],
];

describe('riverVariantAt parity with the backend TerrainSampler.RiverVariantAt', () => {
  for (const [seed, q, r, shape, expected] of CASES) {
    it(`(${seed}, ${q}, ${r}, ${shape}) -> ${expected}`, () => {
      expect(riverVariantAt(q, r, { seed, generation: DEFAULT_GENERATION }, shape)).toBe(expected);
    });
  }
});

describe('riverVariantAt weights, over many hexes (statistical sanity, loose bounds)', () => {
  it('straight/bend land close to 40/40/20 plain/meander/island', () => {
    const world = { seed: 2026, generation: DEFAULT_GENERATION };
    const counts: Record<RiverVariant, number> = { plain: 0, meander: 0, island: 0, loop: 0 };
    let total = 0;
    for (let q = -120; q <= 120; q++) {
      for (let r = -120; r <= 120; r++) {
        counts[riverVariantAt(q, r, world, 'straight')]++;
        total++;
      }
    }
    expect(counts.plain / total).toBeGreaterThan(0.35);
    expect(counts.plain / total).toBeLessThan(0.45);
    expect(counts.meander / total).toBeGreaterThan(0.35);
    expect(counts.meander / total).toBeLessThan(0.45);
    expect(counts.island / total).toBeGreaterThan(0.15);
    expect(counts.island / total).toBeLessThan(0.25);
  });

  it('bend60 lands close to 85/15 plain/loop', () => {
    const world = { seed: 2026, generation: DEFAULT_GENERATION };
    const counts: Record<RiverVariant, number> = { plain: 0, meander: 0, island: 0, loop: 0 };
    let total = 0;
    for (let q = -120; q <= 120; q++) {
      for (let r = -120; r <= 120; r++) {
        counts[riverVariantAt(q, r, world, 'bend60')]++;
        total++;
      }
    }
    expect(counts.plain / total).toBeGreaterThan(0.8);
    expect(counts.plain / total).toBeLessThan(0.9);
    expect(counts.loop / total).toBeGreaterThan(0.1);
    expect(counts.loop / total).toBeLessThan(0.2);
  });

  it('every other shape is always plain', () => {
    const world = { seed: 555, generation: DEFAULT_GENERATION };
    for (const shape of ['spring', 'confluence', 'mouth'] as const) {
      for (let q = -20; q <= 20; q++) {
        for (let r = -20; r <= 20; r++) {
          expect(riverVariantAt(q, r, world, shape)).toBe('plain');
        }
      }
    }
  });
});
