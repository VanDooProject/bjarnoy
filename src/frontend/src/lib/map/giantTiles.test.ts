import { describe, expect, it } from 'vitest';
import { neighbors, type AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints, type Point } from '../hex/geometry';
import {
  classifyGiantClips,
  classifyGiantFrames,
  giantCoverage,
  giantCrop,
  giantFootprintOutline,
  GIANT_NEIGHBOR_PARTS,
  giantTop,
  parseGiantFrameName,
  type GiantFamilyClip,
  type GiantFamilyFrame,
} from './giantTiles';

// GIANT_NEIGHBOR_PARTS claims a fixed screen direction for each of
// neighbors()'s six axial deltas, in the same order. Rather than trust that
// claim, derive the actual screen direction straight from isoGridPosition
// (the renderer's own placement function) for each neighbour and check it
// matches — this is the "verify against isoGridPosition rather than
// trusting this line" the task calls for.
function screenDirectionOf(dx: number, dy: number): 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW' {
  // Same column (dx === 0): a full row directly above/below.
  if (dx === 0) return dy < 0 ? 'N' : 'S';
  // A column over: half a row up or down from the anchor.
  if (dx > 0) return dy < 0 ? 'NE' : 'SE';
  return dy < 0 ? 'NW' : 'SW';
}

describe('GIANT_NEIGHBOR_PARTS', () => {
  it('matches the screen direction isoGridPosition actually places each of neighbors()s six deltas in', () => {
    const w = 200;
    const h = 92; // TILE_ART_TOPFACE_H_FRAC * w, arbitrary — isoGridPosition is linear in both.
    const anchor = { q: 3, r: -2 }; // arbitrary, non-origin, and odd q (col & 1) so both parities are covered by re-running at +1.
    const anchorGrid = isoGridPosition(anchor, w, h);

    const dirs = neighbors(anchor).map((n) => {
      const grid = isoGridPosition(n, w, h);
      return screenDirectionOf(
        Math.sign(Math.round(grid.x - anchorGrid.x)),
        Math.sign(Math.round(grid.y - anchorGrid.y)),
      );
    });

    expect(dirs).toEqual(GIANT_NEIGHBOR_PARTS);
  });

  it('agrees at an even-column anchor too (odd/even columns sit at different screen rows)', () => {
    const w = 200;
    const h = 92;
    const anchor = { q: 0, r: 0 };
    const anchorGrid = isoGridPosition(anchor, w, h);

    const dirs = neighbors(anchor).map((n) => {
      const grid = isoGridPosition(n, w, h);
      return screenDirectionOf(
        Math.sign(Math.round(grid.x - anchorGrid.x)),
        Math.sign(Math.round(grid.y - anchorGrid.y)),
      );
    });

    expect(dirs).toEqual(GIANT_NEIGHBOR_PARTS);
  });
});

describe('giantCoverage', () => {
  it('covers the anchor (part C) plus its six neighbours, in neighbors() order', () => {
    const anchor = { q: 5, r: -1 };
    const coverage = giantCoverage(anchor);

    expect(coverage[0]).toEqual({ coord: anchor, part: 'C' });
    const expectedNeighbours = neighbors(anchor);
    for (let i = 0; i < 6; i++) {
      expect(coverage[i + 1].coord).toEqual(expectedNeighbours[i]);
      expect(coverage[i + 1].part).toBe(GIANT_NEIGHBOR_PARTS[i]);
    }
  });
});

describe('parseGiantFrameName', () => {
  it.each([
    ['giantmountain_SE_level000_partC', 'SE', 'C'],
    ['giantmountain_E_level000_partNE', 'E', 'NE'],
    ['giantmountain_NW_level000_partS', 'NW', 'S'],
  ] as const)('parses %s into orientation %s / part %s', (name, orientation, part) => {
    expect(parseGiantFrameName(name)).toEqual({ orientation, part });
  });

  it('returns null for a name with no giant part suffix', () => {
    expect(parseGiantFrameName('grasstile_SE_variant001')).toBeNull();
  });

  it('returns null for an unrecognised part token', () => {
    expect(parseGiantFrameName('giantmountain_SE_level000_partXX')).toBeNull();
  });
});

describe('classifyGiantFrames / giantTop', () => {
  function frame(name: string): GiantFamilyFrame<string> {
    return { name, value: name };
  }

  it('groups frames by orientation and part, ignoring anything that fails to parse', () => {
    const frames = [
      frame('giantmountain_SE_level000_partC'),
      frame('giantmountain_SE_level000_partN'),
      frame('giantmountain_NE_level000_partC'),
      frame('not_a_giant_frame'),
    ];
    const classified = classifyGiantFrames(frames);

    expect(classified.SE.C).toBe('giantmountain_SE_level000_partC');
    expect(classified.SE.N).toBe('giantmountain_SE_level000_partN');
    expect(classified.NE.C).toBe('giantmountain_NE_level000_partC');
    expect(classified.SE.S).toBeUndefined();
    expect(classified.W).toEqual({});
  });

  it('giantTop resolves through a family/orientation/part lookup, undefined when the art is missing', () => {
    const giants = { giantmountain: classifyGiantFrames([frame('giantmountain_SE_level000_partC')]) };

    expect(giantTop(giants, 'giantmountain', 'SE', 'C')).toBe('giantmountain_SE_level000_partC');
    expect(giantTop(giants, 'giantmountain', 'SE', 'N')).toBeUndefined();
    expect(giantTop(giants, 'giantmountain', 'NE', 'C')).toBeUndefined();
    expect(giantTop(giants, 'unknownfamily', 'SE', 'C')).toBeUndefined();
  });
});

describe('classifyGiantClips', () => {
  function giantClip(overrides: Partial<GiantFamilyClip> & Pick<GiantFamilyClip, 'family' | 'orientation' | 'frames'>): GiantFamilyClip {
    return { fps: 4, playback: 'loop', giant_part: 'C', ...overrides };
  }

  function resolveAll(name: string): string | undefined {
    return name;
  }

  it('resolves a valid giant clip into a map entry with its textures/fps/playback', () => {
    const result = classifyGiantClips(
      [
        giantClip({
          family: 'giantshrine',
          orientation: 'E',
          giant_part: 'C',
          frames: ['giantshrine_E_level000_partC_f00', 'giantshrine_E_level000_partC_f01'],
          fps: 1,
          playback: 'loop',
        }),
      ],
      resolveAll,
    );

    expect(result.E.C).toEqual({
      textures: ['giantshrine_E_level000_partC_f00', 'giantshrine_E_level000_partC_f01'],
      fps: 1,
      playback: 'loop',
    });
  });

  it('drops a clip when any of its frames fails to resolve', () => {
    const result = classifyGiantClips(
      [
        giantClip({
          family: 'giantvolcano',
          orientation: 'NE',
          giant_part: 'S',
          frames: ['giantvolcano_NE_level000_partS_f00', 'missing_frame'],
        }),
      ],
      (name) => (name === 'missing_frame' ? undefined : name),
    );

    expect(result.NE.S).toBeUndefined();
  });

  it('ignores a clip whose giant_part is missing or not a valid GiantPart', () => {
    const noPart = classifyGiantClips(
      [giantClip({ family: 'giantshrine', orientation: 'SE', frames: ['f00'], giant_part: undefined })],
      resolveAll,
    );
    const badPart = classifyGiantClips(
      [giantClip({ family: 'giantshrine', orientation: 'SE', frames: ['f00'], giant_part: 'XX' })],
      resolveAll,
    );

    expect(noPart.SE).toEqual({});
    expect(badPart.SE).toEqual({});
  });

  it('is expected to be pre-filtered by family by the caller — classifyGiantClips itself does not check clip.family', () => {
    // Mirrors classifyFamilyClips (textures.ts): the caller (buildTileTextures)
    // filters `animAtlas.clips` to one family before calling this, the same
    // way it filters before calling classifyFamilyClips. Passing an
    // unfiltered mix here would wrongly merge both families' parts, so
    // callers must never skip that filter — this test documents the
    // contract rather than re-implementing the filter itself.
    const result = classifyGiantClips(
      [
        giantClip({ family: 'giantshrine', orientation: 'E', giant_part: 'C', frames: ['a'] }),
        giantClip({ family: 'giantvolcano', orientation: 'E', giant_part: 'N', frames: ['b'] }),
      ],
      resolveAll,
    );

    // Both land in the result since nothing here filters by family —
    // proving the responsibility sits with the caller.
    expect(result.E.C).toBeDefined();
    expect(result.E.N).toBeDefined();
  });
});

describe('giantFootprintOutline', () => {
  const w = 200;
  const h = 92;

  function key(p: Point): string {
    return `${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}`;
  }

  /** All 7 covered hexes' own top-face polygons, in world coords — the same construction giantFootprintOutline itself uses, kept independent here as the ground truth the outline is checked against. */
  function hexPolygons(anchor: AxialCoord): Point[][] {
    return giantCoverage(anchor).map(({ coord }) => {
      const grid = isoGridPosition(coord, w, h);
      return isoTopPoints(w, h).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
    });
  }

  function directedEdges(polygons: Point[][]): Set<string> {
    const edges = new Set<string>();
    for (const poly of polygons) {
      for (let i = 0; i < poly.length; i++) {
        edges.add(`${key(poly[i])}->${key(poly[(i + 1) % poly.length])}`);
      }
    }
    return edges;
  }

  // Run the whole suite for both an even- and an odd-column anchor —
  // isoGridPosition treats the two parities differently (odd columns sit
  // half a row lower), so the shared/interior edges a giant footprint has
  // to drop are computed from different neighbour placements in each case.
  it.each([
    ['even-column anchor', { q: 4, r: -2 }],
    ['odd-column anchor', { q: 3, r: -2 }],
  ])('for %s, returns the 18-edge union outline with no interior edges and every vertex a real hex vertex', (_label, anchor) => {
    const polygons = hexPolygons(anchor);
    const allVertexKeys = new Set(polygons.flat().map(key));
    const allDirected = directedEdges(polygons);

    const outline = giantFootprintOutline(anchor, w, h);

    // 18 edges (7 hexes * 6 edges = 42 half-edges; 12 shared edges each
    // remove one from each of the two polygons sharing it, i.e. 24 of the
    // 42 — see giantFootprintOutline's own doc comment).
    expect(outline).toHaveLength(18);

    // Every vertex really is a vertex of one of the 7 hex polygons — not
    // some interpolated or mis-derived point.
    for (const p of outline) {
      expect(allVertexKeys.has(key(p))).toBe(true);
    }

    // A single closed loop: walking consecutive outline points traces a
    // real directed edge of one of the 7 polygons each time, and it comes
    // back to the start.
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      expect(allDirected.has(`${key(a)}->${key(b)}`)).toBe(true);
    }

    // No interior (shared) edge survived: none of the outline's directed
    // edges has its reverse also present among the 7 polygons' own edges
    // (a shared edge is walked in both directions, once by each of the two
    // hexes that share it).
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      expect(allDirected.has(`${key(b)}->${key(a)}`)).toBe(false);
    }

    // No duplicate vertices — 18 distinct points, matching the 18 edges.
    expect(new Set(outline.map(key)).size).toBe(18);
  });
});

describe('giantCrop', () => {
  it('places a taller-than-300 texture so its bottom edge lines up with a normal 300-tall canvas', () => {
    // nativeY = 300 - H: negative for any H > 300, which is what pushes the
    // sprite's draw position up (see syncSpriteLayer's cropOffsetY math).
    expect(giantCrop(450)).toEqual({ nativeY: -150, nativeH: 450 });
    expect(giantCrop(300)).toEqual({ nativeY: 0, nativeH: 300 });
    expect(giantCrop(600)).toEqual({ nativeY: -300, nativeH: 600 });
  });
});
