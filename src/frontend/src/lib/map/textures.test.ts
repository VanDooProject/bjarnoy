import { describe, expect, it } from 'vitest';
import { classifyFamilyFrames, riverArtFor, type FamilyFrame } from './textures';
import { bendOrientationOf } from './types';
import type { RiverTile } from './types';

// classifyFamilyFrames turns one family's raw atlas frame names into the
// base/baseIndexed/top shape TileTextures needs. Exercised here with plain
// strings as the "texture" value (rather than real Pixi Textures) since the
// function is deliberately generic over that value and has no Pixi
// dependency of its own — see its doc comment in textures.ts.
function frame(name: string, layer: FamilyFrame<string>['layer']): FamilyFrame<string> {
  return { name, layer, value: name };
}

// riverArtFor picks which art family (and rotation) a river tile renders
// with. Exercised directly here (rather than through loadTileTextures/
// riverTexturesFor) because Pixi's Assets.load needs a browser `document`
// this repo's node-environment vitest config doesn't provide — see
// riverArtFor's own export comment.
function riverTile(shape: RiverTile['shape'], inDirection: RiverTile['inDirections'][number] | null, outDirection: RiverTile['outDirection']): RiverTile {
  return { q: 0, r: 0, shape, inDirections: inDirection ? [inDirection] : [], outDirection };
}

describe('riverArtFor', () => {
  it('resolves a Bend60 tile to the bend60 family, oriented the same way a Bend tile would be', () => {
    // bend60 reuses bendOrientationOf (the same in/out-pair anchor logic
    // bend itself uses) — see riverArtFor's doc comment for why: it's a
    // directional bend either way, the vendor pack just shipped a distinct
    // art family for its sharper interior angle.
    const result = riverArtFor(riverTile('bend60', 'E', 'NW'), null);

    expect(result.shape).toBe('bend60');
    expect(result.orientation).toBe(bendOrientationOf('E', 'NW'));
  });

  it('does not resolve a Bend60 tile to the plain bend family', () => {
    const result = riverArtFor(riverTile('bend60', 'E', 'NW'), null);

    expect(result.shape).not.toBe('bend');
  });

  it('still resolves an ordinary Bend tile to the bend family, unaffected by bend60 existing', () => {
    const result = riverArtFor(riverTile('bend', 'NW', 'SW'), null);

    expect(result.shape).toBe('bend');
    expect(result.orientation).toBe(bendOrientationOf('NW', 'SW'));
  });
});

describe('classifyFamilyFrames', () => {
  it('splits a base/top family with a single, level-invariant base into plain base + indexed top', () => {
    const result = classifyFamilyFrames([
      frame('vikinghut_SE_base', 'base'),
      frame('vikinghut_SE_level000', 'top'),
      frame('vikinghut_SE_level001', 'top'),
      frame('vikinghut_NE_base', 'base'),
      frame('vikinghut_NE_level000', 'top'),
      frame('vikinghut_NE_level001', 'top'),
    ]);

    expect(result.base?.SE).toBe('vikinghut_SE_base');
    expect(result.baseIndexed).toBeUndefined();
    expect(result.top?.SE).toEqual(['vikinghut_SE_level000', 'vikinghut_SE_level001']);
    expect(result.top?.NE).toEqual(['vikinghut_NE_level000', 'vikinghut_NE_level001']);
  });

  it('infers an indexed base (no per-family rule needed) once more than one level shows up for an orientation', () => {
    const result = classifyFamilyFrames([
      frame('fisherhut_SE_level000_base', 'base'),
      frame('fisherhut_SE_level001_base', 'base'),
      frame('fisherhut_SE_level000', 'top'),
      frame('fisherhut_SE_level001', 'top'),
    ]);

    expect(result.base).toBeUndefined();
    expect(result.baseIndexed?.SE).toEqual(['fisherhut_SE_level000_base', 'fisherhut_SE_level001_base']);
    expect(result.top?.SE).toEqual(['fisherhut_SE_level000', 'fisherhut_SE_level001']);
  });

  it('treats a "composite" (un-split) family as its base, with no top', () => {
    const result = classifyFamilyFrames([
      frame('sandtile_SE', 'composite'),
      frame('sandtile_NE', 'composite'),
    ]);

    expect(result.base?.SE).toBe('sandtile_SE');
    expect(result.top).toBeUndefined();
  });

  it('orders a terrain variant family as [plain-or-000, variant000, variant001, ...]', () => {
    const result = classifyFamilyFrames([
      frame('grasstile_SE', 'top'),
      frame('grasstile_SE_variant000', 'top'),
      frame('grasstile_SE_variant001', 'top'),
      frame('grasstile_SE_base', 'base'),
    ]);

    expect(result.top?.SE).toEqual(['grasstile_SE', 'grasstile_SE_variant000', 'grasstile_SE_variant001']);
    expect(result.base?.SE).toBe('grasstile_SE_base');
  });

  it('coastal water variants (indexed, composite/base only, no top) become baseIndexed', () => {
    const result = classifyFamilyFrames([
      frame('coastalwatertile_SE', 'composite'),
      frame('coastalwatertile_SE_variant000', 'composite'),
      frame('coastalwatertile_SE_variant001', 'composite'),
    ]);

    expect(result.baseIndexed?.SE).toEqual([
      'coastalwatertile_SE',
      'coastalwatertile_SE_variant000',
      'coastalwatertile_SE_variant001',
    ]);
    expect(result.top).toBeUndefined();
  });

  it('returns an empty result for a family with no frames at all (no art in the pack)', () => {
    const result = classifyFamilyFrames([]);

    expect(result.base).toBeUndefined();
    expect(result.baseIndexed).toBeUndefined();
    expect(result.top).toBeUndefined();
  });

  it('throws if an indexed sequence has a gap (e.g. level000 and level002 but no level001)', () => {
    expect(() =>
      classifyFamilyFrames([
        frame('vikinghut_SE_level000', 'top'),
        frame('vikinghut_SE_level002', 'top'),
      ]),
    ).toThrow(/missing index 1/);
  });
});
