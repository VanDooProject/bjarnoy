import { describe, expect, it } from 'vitest';
import {
  bendOrientationOf,
  confluenceOrientationOf,
  mouthOrientationOf,
  springOrientationOf,
  straightOrientationOf,
  TILE_ORIENTATIONS,
} from './types';

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

describe('mouthOrientationOf', () => {
  it('renders a bend toward the sea when the sea is 60° off the inflow (a real reported case: Jarlskar mouth at -8,4)', () => {
    // inDirection=NE, actual sea neighbour=SE (island Jarlskar, seed
    // 783131215, world 01a06013-03b3-7632-9ee6-f0f00f0fb164) — the mouth
    // used to render straight-through toward SW (forest, the inflow's
    // geometric opposite) instead of curving toward the sea at SE.
    expect(mouthOrientationOf('NE', 'SE')).toEqual({ shape: 'bend', orientation: 'W' });
  });

  it('renders straight when the sea is directly opposite the inflow', () => {
    expect(mouthOrientationOf('E', 'W')).toEqual({ shape: 'straight', orientation: 'NW' });
  });

  it('falls back to the inflow-opposite straight file when the sea is 120° off the inflow (unrepresentable by either family)', () => {
    expect(mouthOrientationOf('E', 'NE')).toEqual({ shape: 'straight', orientation: 'NW' });
  });

  it('falls back to the inflow-opposite straight file when no sea neighbour was found', () => {
    expect(mouthOrientationOf('E', null)).toEqual({ shape: 'straight', orientation: 'NW' });
  });

  it('picks a bend orientation matching bendOrientationOf for a 60°-apart sea direction, in either handedness', () => {
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const inDirection = TILE_ORIENTATIONS[i];
      const seaDirection = TILE_ORIENTATIONS[(i + 2) % 6];
      expect(mouthOrientationOf(inDirection, seaDirection)).toEqual({
        shape: 'bend',
        orientation: bendOrientationOf(inDirection, seaDirection),
      });
      const seaDirectionReverse = TILE_ORIENTATIONS[(i - 2 + 6) % 6];
      expect(mouthOrientationOf(inDirection, seaDirectionReverse)).toEqual({
        shape: 'bend',
        orientation: bendOrientationOf(inDirection, seaDirectionReverse),
      });
    }
  });
});

describe('confluenceOrientationOf', () => {
  // Pixel-sampled the same way (`is_blue` along each polygon edge, against
  // every rendered `rivertile_y_narrow_*` file): file D touches a fixed
  // opposite pair (the trunk, edges 1+D and 4+D) plus a third edge adjacent
  // to one end (the branch, edge 5+D) — converting through edge(d) = (3-d)
  // mod 6 gives out=(5-D)%6 (the trunk's far/branch-adjacent end, where the
  // merged flow exits), trunkIn=(2-D)%6 (the trunk's other end), and
  // branchIn=(4-D)%6. File 'E' (D=0): out=SE, trunkIn=NW, branchIn=SW.
  it('picks the file whose trunk/branch match a real (in1, in2, out) triple', () => {
    expect(confluenceOrientationOf(['NW', 'SW'], 'SE')).toBe('E');
    // Order of the two inflows shouldn't matter — they're a set, not a pair.
    expect(confluenceOrientationOf(['SW', 'NW'], 'SE')).toBe('E');
  });

  it('rotates consistently for every file, matching the pixel-sampled edge formula', () => {
    for (let d = 0; d < 6; d++) {
      const out = TILE_ORIENTATIONS[(5 - d + 6) % 6]!;
      const trunkIn = TILE_ORIENTATIONS[(2 - d + 6) % 6]!;
      const branchIn = TILE_ORIENTATIONS[(4 - d + 6) % 6]!;
      expect(confluenceOrientationOf([trunkIn, branchIn], out)).toBe(TILE_ORIENTATIONS[d]);
    }
  });

  it('returns null for a triple the asset has no rotation to represent (two independent paths colliding at an angle the fixed trunk/branch shape cannot show)', () => {
    // E and NE are only 1 apart — the trunk is always an *opposite* pair,
    // so no rotation of this asset ever touches two adjacent directions
    // together with any third as its full in/in/out triple.
    expect(confluenceOrientationOf(['E', 'NE'], 'SW')).toBeNull();
  });

  it('falls back to any rotation covering both inflows when there is no outDirection (a confluence that is also the coast)', () => {
    // Same trunk/branch pair as the first case, but with nothing
    // downstream to anchor which end is "out" — still renders coherently
    // rather than picking an arbitrary untransformed file.
    expect(confluenceOrientationOf(['NW', 'SW'], null)).toBe('E');
  });

  it('always finds a covering rotation with no outDirection, unlike the anchored-on-out case', () => {
    // Every one of the 15 possible inflow pairs turns out to be covered by
    // some rotation's 3-direction touched set once "out" isn't fixed — the
    // outDirection-anchored case above is the one that can genuinely fail
    // (E/NE only 1 apart, matching no rotation's fixed *opposite* trunk
    // pair); dropping that anchor gives every pair a third slot to land in.
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      for (let j = i + 1; j < TILE_ORIENTATIONS.length; j++) {
        expect(confluenceOrientationOf([TILE_ORIENTATIONS[i]!, TILE_ORIENTATIONS[j]!], null)).not.toBeNull();
      }
    }
  });
});
