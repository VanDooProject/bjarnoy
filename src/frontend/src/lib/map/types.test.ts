import { describe, expect, it } from 'vitest';
import { bendOrientationOf, TILE_ORIENTATIONS } from './types';

describe('bendOrientationOf', () => {
  it('picks outDirection when outDirection + 2 === inDirection', () => {
    // Indices: E=0, NE=1, NW=2, W=3, SW=4, SE=5. E(0) + 2 = NW(2) mod 6 —
    // the empirically-measured rivertile_bend_E pairing (see
    // docs/design/river-generation.md's "Art pack orientation convention").
    // Today's pre-fix behaviour (`outDirection` always) happens to already
    // be correct for this ordering.
    expect(bendOrientationOf('NW', 'E')).toBe('E');
  });

  it('picks inDirection when inDirection + 2 === outDirection (the previously-broken ordering)', () => {
    // The mirror image of the case above: same pair {E, NW}, but this time
    // E arrives as inDirection and NW as outDirection. Using `outDirection`
    // here (as the old code always did) would pick 'NW', whose asset pairs
    // NW with E — not with itself — so the wrong edges would light up. The
    // correct orientation is still 'E', now picked via inDirection.
    expect(bendOrientationOf('E', 'NW')).toBe('E');
  });

  it('is consistent across every orientation index for both handedness cases', () => {
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const d = TILE_ORIENTATIONS[i];
      const dPlus2 = TILE_ORIENTATIONS[(i + 2) % 6];

      // For the unordered pair {d, d+2}, the asset's own orientation is
      // always `d` (the element whose +2 lands on the other) — regardless
      // of which one is passed as inDirection vs outDirection.
      // out = in + 2: today's pre-fix "always use outDirection" happens to
      // be wrong here (it would return d+2), so this is the case the fix
      // corrects.
      expect(bendOrientationOf(d, dPlus2)).toBe(d);
      // in = out + 2: "always use outDirection" already returns `d` here,
      // so this ordering was already correct pre-fix.
      expect(bendOrientationOf(dPlus2, d)).toBe(d);
    }
  });

  it('falls back to outDirection for a pair the asset cannot represent, rather than throwing', () => {
    // A 120°-off-straight pair (e.g. adjacent directions) — RiverGenerator
    // no longer produces these, but the function should degrade gracefully
    // for any pre-existing persisted world that still has one.
    expect(bendOrientationOf('E', 'NE')).toBe('NE');
  });
});
