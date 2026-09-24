import { describe, expect, it } from 'vitest';
import { neighbors } from '../hex/coords';
import { isoGridPosition } from '../hex/geometry';
import {
  classifyGiantFrames,
  giantCoverage,
  giantCrop,
  GIANT_NEIGHBOR_PARTS,
  giantTop,
  parseGiantFrameName,
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

describe('giantCrop', () => {
  it('places a taller-than-300 texture so its bottom edge lines up with a normal 300-tall canvas', () => {
    // nativeY = 300 - H: negative for any H > 300, which is what pushes the
    // sprite's draw position up (see syncSpriteLayer's cropOffsetY math).
    expect(giantCrop(450)).toEqual({ nativeY: -150, nativeH: 450 });
    expect(giantCrop(300)).toEqual({ nativeY: 0, nativeH: 300 });
    expect(giantCrop(600)).toEqual({ nativeY: -300, nativeH: 600 });
  });
});
