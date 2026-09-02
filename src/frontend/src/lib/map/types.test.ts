import { describe, expect, it } from 'vitest';
import { bendOrientationOf, springOrientationOf, straightOrientationOf, TILE_ORIENTATIONS } from './types';

// All three functions below were derived from a from-scratch re-verification
// of the art pack against this renderer's own isoTopPoints/isoGridPosition
// placement math (see docs/design/river-generation.md's "Art pack
// orientation convention"): a direction index's own screen edge is `(3 -
// index) mod 6`, not the index itself, and every rivertile_*.png was
// pixel-sampled against that corrected mapping. The values here are the
// verified result, not restated assumptions.

describe('bendOrientationOf', () => {
  it('picks the file whose two touched directions are {E, NW} for that pair, either ordering', () => {
    // E(0) and NW(2) are 2 apart (E+2=NW) — pixel-verified together: the
    // pair {E, NW} is rendered by file index NW (bendFileIndexFor(E) = 2).
    expect(bendOrientationOf('E', 'NW')).toBe('NW');
    expect(bendOrientationOf('NW', 'E')).toBe('NW');
  });

  it('picks the file whose two touched directions are {NW, SW} for that pair, either ordering', () => {
    // NW(2) and SW(4) are 2 apart (NW+2=SW) — rendered by file index E
    // (bendFileIndexFor(NW) = 0), not by 'NW' or 'SW' themselves.
    expect(bendOrientationOf('NW', 'SW')).toBe('E');
    expect(bendOrientationOf('SW', 'NW')).toBe('E');
  });

  it('is consistent across every orientation index for both handedness cases', () => {
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const d = TILE_ORIENTATIONS[i];
      const dPlus2 = TILE_ORIENTATIONS[(i + 2) % 6];
      const expected = TILE_ORIENTATIONS[(2 - i + 6) % 6];

      // Same unordered pair {d, d+2} either way round — the file to render
      // with only depends on the pair, not on which one arrived as
      // inDirection vs outDirection.
      expect(bendOrientationOf(d, dPlus2)).toBe(expected);
      expect(bendOrientationOf(dPlus2, d)).toBe(expected);
    }
  });

  it('falls back to outDirection for a pair the asset cannot represent, rather than throwing', () => {
    // A 120°-off-straight pair (e.g. adjacent directions) — RiverGenerator
    // no longer produces these, but the function should degrade gracefully
    // for any pre-existing persisted world that still has one.
    expect(bendOrientationOf('E', 'NE')).toBe('NE');
  });
});

describe('springOrientationOf', () => {
  it('matches the pixel-measured rivertile_spring_E pairing (outDirection E -> file SW)', () => {
    expect(springOrientationOf('E')).toBe('SW');
  });

  it('is consistent across every orientation index', () => {
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const out = TILE_ORIENTATIONS[i];
      const expected = TILE_ORIENTATIONS[(4 - i + 6) % 6];
      expect(springOrientationOf(out)).toBe(expected);
    }
  });
});

describe('straightOrientationOf', () => {
  it('matches the pixel-measured rivertile_E pairing (direction NW -> file E)', () => {
    expect(straightOrientationOf('NW')).toBe('E');
  });

  it('gives a file whose touched pair contains the input direction, for every orientation index', () => {
    // touched(D) = {(2-D) mod 6, (5-D) mod 6}; straightOrientationOf solves
    // (2-D) mod 6 = direction, so touched(result) must contain `direction`.
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const direction = TILE_ORIENTATIONS[i];
      const resultIndex = TILE_ORIENTATIONS.indexOf(straightOrientationOf(direction));
      const touched = [(2 - resultIndex + 6) % 6, (5 - resultIndex + 6) % 6];
      expect(touched).toContain(i);
    }
  });

  it('gives an equally valid (though not necessarily identical) file for either end of an opposite pair', () => {
    // Opposite-pair symmetry: file D and file D+3 touch the same edge pair,
    // so resolving from either end of a straight/mouth tile's flow must
    // still land on a file that touches the same {direction, direction+3}
    // set — even if the two calls don't return the exact same orientation
    // string.
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const a = TILE_ORIENTATIONS[i];
      const b = TILE_ORIENTATIONS[(i + 3) % 6];
      const resultA = TILE_ORIENTATIONS.indexOf(straightOrientationOf(a));
      const resultB = TILE_ORIENTATIONS.indexOf(straightOrientationOf(b));
      const touchedOf = (d: number) => [(2 - d + 6) % 6, (5 - d + 6) % 6].sort();
      expect(touchedOf(resultA)).toEqual(touchedOf(resultB));
    }
  });
});
