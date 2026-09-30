import { describe, expect, it } from 'vitest';
import {
  bend60OrientationOf,
  bendOrientationOf,
  confluenceKind,
  confluenceOrientationOf,
  confluenceWideOrientationOf,
  tributaryOrientationOf,
  deltaOrientationOf,
  mouthOrientationOf,
  mouthSeaDirection,
  widenStraightOrientationOf,
  springOrientationOf,
  straightOrientationOf,
  TILE_ORIENTATIONS,
  type TileOrientation,
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

describe('bend60OrientationOf', () => {
  // Pixel-measured from the vendored atlas (rivertile_bend60_<D>_base, and
  // identically rivertile_bend60_loop): the polygon edges (isoTopPoints order)
  // each file's water actually touches. Kept as literal data so this test
  // checks the function against the art, not against its own formula.
  const MEASURED_EDGES: Record<TileOrientation, [number, number]> = {
    E: [0, 1],
    NE: [1, 2],
    NW: [2, 3],
    W: [3, 4],
    SW: [4, 5],
    SE: [5, 0],
  };
  // Direction d's shared border is polygon edge (3 - d) mod 6 — self-inverse.
  const directionOfEdge = (edge: number): TileOrientation => TILE_ORIENTATIONS[(3 - edge + 6) % 6];

  it('picks, for every adjacent in/out pair in both flow directions, the file whose measured edges are exactly that pair', () => {
    for (let d = 0; d < 6; d++) {
      const a = TILE_ORIENTATIONS[d];
      const b = TILE_ORIENTATIONS[(d + 1) % 6];
      for (const [inDir, outDir] of [
        [a, b],
        [b, a],
      ] as const) {
        const file = bend60OrientationOf(inDir, outDir);
        const touched = MEASURED_EDGES[file].map(directionOfEdge).sort();
        expect(touched).toEqual([inDir, outDir].sort());
      }
    }
  });

  it('regression: NE -> NW resolves to file NE (it used to fall back to E and dead-end)', () => {
    expect(bend60OrientationOf('NE', 'NW')).toBe('NE');
    expect(bend60OrientationOf('NW', 'NE')).toBe('NE');
  });
});

describe('springOrientationOf', () => {
  // Pixel-measured from the vendored atlas: the one polygon edge
  // (isoTopPoints order) each spring file's outflow touches — identical for
  // mountaintile_corrie_spring, _saddleback_spring, _glacier_spring and
  // mountaintile_volcano_lavaspring(_flows). Literal data, so this checks the
  // function against the art rather than against its own formula.
  const MEASURED_OUTFLOW_EDGE: Record<TileOrientation, number> = { E: 1, NE: 2, NW: 3, W: 4, SW: 5, SE: 0 };
  const directionOfEdge = (edge: number): TileOrientation => TILE_ORIENTATIONS[(3 - edge + 6) % 6];

  it('picks, for every outflow direction, the file whose measured outflow edge is that direction', () => {
    for (const out of TILE_ORIENTATIONS) {
      expect(directionOfEdge(MEASURED_OUTFLOW_EDGE[springOrientationOf(out)])).toBe(out);
    }
  });

  it('regression: a spring draining SW uses file SW (it used to pick E and drain NW)', () => {
    expect(springOrientationOf('SW')).toBe('SW');
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

/** Pixel-measured: direction index `d`'s shared polygon edge is `(3 - d) mod 6` (self-inverse). */
const edgeOf = (d: number) => (3 - d + 6) % 6;
const dir = (i: number): TileOrientation => TILE_ORIENTATIONS[((i % 6) + 6) % 6]!;

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

  it('renders the hairpin (bend60) when the sea is 120° off straight ahead, in either handedness', () => {
    for (let i = 0; i < 6; i++) {
      for (const sea of [dir(i + 1), dir(i - 1)]) {
        expect(mouthOrientationOf(dir(i), sea)).toEqual({
          shape: 'bend60',
          orientation: bend60OrientationOf(dir(i), sea),
        });
      }
    }
  });

  it('falls back to the inflow-opposite straight file when no sea neighbour was found', () => {
    expect(mouthOrientationOf('E', null)).toEqual({ shape: 'straight', orientation: 'NW' });
  });

  it('picks a bend orientation matching bendOrientationOf for a 60°-apart sea direction, in either handedness', () => {
    for (let i = 0; i < TILE_ORIENTATIONS.length; i++) {
      const inDirection = TILE_ORIENTATIONS[i]!;
      for (const sea of [dir(i + 2), dir(i - 2)]) {
        expect(mouthOrientationOf(inDirection, sea)).toEqual({
          shape: 'bend',
          orientation: bendOrientationOf(inDirection, sea),
        });
      }
    }
  });
});

describe('mouthSeaDirection', () => {
  const seaAt = (...ds: number[]) => [0, 1, 2, 3, 4, 5].map((d) => ds.includes(d));

  it('prefers the sea straight ahead over a bend over the hairpin', () => {
    expect(mouthSeaDirection('E', seaAt(1, 2, 3))).toBe('W');
    expect(mouthSeaDirection('E', seaAt(1, 2))).toBe('NW');
    expect(mouthSeaDirection('E', seaAt(1))).toBe('NE');
  });

  it('is null with no sea neighbour', () => {
    expect(mouthSeaDirection('E', seaAt())).toBeNull();
  });
});

// The measured rotation tables: for file D the water touches these polygon edges (pixel-sampled on
// every `*_base` frame of the family; see docs/design/river-generation.md).
describe('widenStraightOrientationOf / deltaOrientationOf', () => {
  it('put the stream (smallwide straight) / river (delta) end on polygon edge D+1 and the river / sea end on D+4', () => {
    for (let inIndex = 0; inIndex < 6; inIndex++) {
      const inDirection = dir(inIndex);
      for (const fn of [widenStraightOrientationOf, deltaOrientationOf]) {
        const file = TILE_ORIENTATIONS.indexOf(fn(inDirection));
        expect(edgeOf(inIndex)).toBe((file + 1) % 6);
        expect(edgeOf(inIndex + 3)).toBe((file + 4) % 6);
      }
    }
  });
});

describe('confluenceKind', () => {
  it('draws a narrow Y with inflows at out+2 and out+3, a wide Y at out+2 and out+4, and no mirror image', () => {
    expect(confluenceKind(2, 3, 0)).toBe('narrow');
    expect(confluenceKind(3, 2, 0)).toBe('narrow');
    expect(confluenceKind(2, 4, 0)).toBe('wide');
    expect(confluenceKind(3, 4, 0)).toBeNull();
    expect(confluenceKind(1, 2, 0)).toBeNull();
    expect(confluenceKind(0, 2, 0)).toBeNull();
  });
});

describe('confluenceOrientationOf', () => {
  // Pixel-measured on `rivertile_smallwide_y_narrow_*`: file D touches edges 1+D (river width - the
  // outflow), 4+D and 5+D (stream width - the two tributaries, 60° apart). Through
  // edge(d) = (3-d) mod 6: out=(2-D), ins=(5-D) and (4-D). File 'E' (D=0): out=NW, ins=SE and SW.
  it('picks the file whose out and inflows match the measured edges', () => {
    expect(confluenceOrientationOf(['SE', 'SW'], 'NW')).toBe('E');
    expect(confluenceOrientationOf(['SW', 'SE'], 'NW')).toBe('E');
  });

  it('rotates consistently for every file, matching the pixel-sampled edge formula', () => {
    for (let d = 0; d < 6; d++) {
      const riverEdge = (1 + d) % 6;
      const streamEdges = [(4 + d) % 6, (5 + d) % 6];
      const out = dir(edgeOf(riverEdge));
      const ins = streamEdges.map((e) => dir(edgeOf(e)));
      expect(confluenceOrientationOf(ins, out)).toBe(TILE_ORIENTATIONS[d]);
    }
  });

  it('returns null for a triple the asset cannot draw (the mirror image)', () => {
    expect(confluenceOrientationOf(['E', 'NE'], 'NW')).toBeNull();
    expect(confluenceOrientationOf(['SE', 'E'], 'NW')).toBeNull();
  });

  it('with no outDirection (an old row) accepts any rotation that draws both inflows', () => {
    expect(confluenceOrientationOf(['SE', 'SW'], null)).not.toBeNull();
    expect(confluenceOrientationOf(['E', 'NE'], null)).not.toBeNull();
  });
});

describe('tributaryOrientationOf', () => {
  // Pixel-measured edge sets of rivertile_smallwide_bend120_tributary (polygon edges, stream first):
  // file E: stream 3, river 1/5; NE: 4, 0/2; NW: 5, 1/3; W: 0, 2/4; SW: 1, 3/5; SE: 2, 4/0.
  const EDGE_OF = (d: number) => (3 - d + 6) % 6;
  it.each(TILE_ORIENTATIONS.map((o, s) => [o, s] as const))('stream from %s', (streamIn, s) => {
    const file = TILE_ORIENTATIONS.indexOf(tributaryOrientationOf(streamIn));
    expect((file + 3) % 6).toBe(EDGE_OF(s));
    const riverEdges = [(file + 1) % 6, (file + 5) % 6].sort();
    expect(riverEdges).toEqual([EDGE_OF((s + 2) % 6), EDGE_OF((s + 4) % 6)].sort());
  });
});

describe('confluenceWideOrientationOf', () => {
  // `rivertile_smallwide_ywide_*`: file D touches 1+D (river - the outflow), 3+D and 5+D (streams).
  it('rotates consistently for every file, matching the pixel-sampled edge formula', () => {
    for (let d = 0; d < 6; d++) {
      const out = dir(edgeOf((1 + d) % 6));
      const ins = [(3 + d) % 6, (5 + d) % 6].map((e) => dir(edgeOf(e)));
      expect(confluenceWideOrientationOf(ins, out)).toBe(TILE_ORIENTATIONS[d]);
      expect(confluenceWideOrientationOf([...ins].reverse(), out)).toBe(TILE_ORIENTATIONS[d]);
    }
  });

  it('does not match the narrow Y triples', () => {
    expect(confluenceWideOrientationOf(['SE', 'SW'], 'NW')).toBeNull();
    expect(confluenceWideOrientationOf(['E', 'NE'], 'SW')).toBeNull();
  });

  it('needs two inflows', () => {
    expect(confluenceWideOrientationOf(['NW'], null)).toBeNull();
    expect(confluenceWideOrientationOf([], null)).toBeNull();
  });
});
