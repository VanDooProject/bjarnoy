import { describe, expect, it } from 'vitest';
import { classifyFamilyClips, classifyFamilyFrames, renumberTopVariants, riverArtFor, textureKeyFor, type FamilyFrame } from './textures';
import { bendOrientationOf } from './types';
import type { RiverTile, Tile } from './types';
import type { AtlasClip } from './atlas';

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

// classifyFamilyClips turns one family's buildings-anim clips into a
// per-orientation, per-level lookup. Exercised with plain strings as the
// resolved frame value (via `resolveFrame`) for the same reason
// classifyFamilyFrames is above — no Pixi dependency of its own.
function clip(overrides: Partial<AtlasClip> & Pick<AtlasClip, 'name' | 'orientation' | 'frames'>): AtlasClip {
  return {
    family: 'sawmillriver',
    camera: overrides.orientation,
    layer: 'top',
    source_level: null,
    variant: null,
    pass_suffix: '',
    anim_type: 'loop',
    playback: 'loop',
    fps: 6,
    pause: 0,
    frame_count: overrides.frames.length,
    frame_padding: 2,
    parts: [],
    ...overrides,
  };
}

function resolveAll(name: string): string | undefined {
  return name;
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

describe('classifyFamilyClips', () => {
  it('keys a clip by its exact level and orientation', () => {
    const result = classifyFamilyClips(
      [clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00', 'f01'] })],
      resolveAll,
    );

    expect(result.SE.get(3)).toEqual({ textures: ['f00', 'f01'], fps: 6, playback: 'loop' });
    expect(result.SE.get(4)).toBeUndefined();
    expect(result.NE.size).toBe(0);
  });

  it('sparse — only the levels/orientations a clip exists for get an entry, everything else stays absent', () => {
    const result = classifyFamilyClips(
      [
        clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00'] }),
        clip({ name: 'sawmillriver_SE_level004', orientation: 'SE', frames: ['f00'] }),
      ],
      resolveAll,
    );

    expect(result.SE.get(0)).toBeUndefined();
    expect(result.SE.get(1)).toBeUndefined();
    expect(result.SE.get(2)).toBeUndefined();
    expect(result.SE.get(3)).toBeDefined();
    expect(result.SE.get(4)).toBeDefined();
  });

  it('drops a lettered alternate pass (e.g. level004a) rather than colliding it with the plain level004', () => {
    const result = classifyFamilyClips(
      [
        clip({ name: 'cropmill_E_level004', orientation: 'E', frames: ['plain'] }),
        clip({ name: 'cropmill_E_level004a', orientation: 'E', frames: ['alt'] }),
      ],
      resolveAll,
    );

    expect(result.E.get(4)?.textures).toEqual(['plain']);
  });

  it('drops a clip whose frames do not all resolve (e.g. a page that failed to parse)', () => {
    const result = classifyFamilyClips(
      [clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00', 'missing'] })],
      (name) => (name === 'missing' ? undefined : name),
    );

    expect(result.SE.get(3)).toBeUndefined();
  });

  it('returns an all-empty result for no clips at all (no animation for this family)', () => {
    const result = classifyFamilyClips([], resolveAll);

    for (const orientation of ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const) {
      expect(result[orientation].size).toBe(0);
    }
  });

  it('never matches a giant clip name (its own classifyGiantClips path handles those, not this one)', () => {
    // A giant clip's name always ends in `_part<DIR>` after the level
    // digits (e.g. `giantshrine_E_level000_partC`), so ANIM_LEVEL_RE's
    // end-anchored `_level(\d{3})$` never matches it — this is the actual
    // mechanism (checked directly, not just asserted) that keeps giant
    // clips from leaking into the regular per-TextureKey animTop map built
    // in buildTileTextures (see TileTextures.giantAnims's own doc comment).
    const result = classifyFamilyClips(
      [clip({ name: 'giantshrine_E_level000_partC', orientation: 'E', frames: ['f00'], family: 'giantshrine' })],
      resolveAll,
    );

    expect(result.E.get(0)).toBeUndefined();
    for (const orientation of ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const) {
      expect(result[orientation].size).toBe(0);
    }
  });
});

// renumberTopVariants fixes a genuine gap in the vendored art pack: wasteland/
// deadforest/blacksand's top variants are numbered starting at _variant001
// with no _variant000 at all, which classifyFamilyFrames would otherwise
// reject outright (see GAPPY_VARIANT_FAMILIES' own doc comment, and the
// "throws on a real gap" test above that this deliberately doesn't disturb).
describe('renumberTopVariants', () => {
  it('closes a plain+variant001 gap into contiguous 0/1 indices', () => {
    const frames = [frame('wasteland_E', 'top'), frame('wasteland_E_variant001', 'top')];

    const classified = classifyFamilyFrames(renumberTopVariants(frames));

    expect(classified.top?.E).toEqual(['wasteland_E', 'wasteland_E_variant001']);
  });

  it('closes a wider gap (plain + variant001..005) into 0..5', () => {
    const frames = [
      frame('wasteland_E', 'top'),
      frame('wasteland_E_variant001', 'top'),
      frame('wasteland_E_variant002', 'top'),
      frame('wasteland_E_variant003', 'top'),
      frame('wasteland_E_variant004', 'top'),
      frame('wasteland_E_variant005', 'top'),
    ];

    const classified = classifyFamilyFrames(renumberTopVariants(frames));

    expect(classified.top?.E.length).toBe(6);
  });

  it('leaves base/composite frames untouched, only renumbering top', () => {
    const frames = [frame('wasteland_E_base', 'base'), frame('wasteland_E', 'top'), frame('wasteland_E_variant001', 'top')];

    const classified = classifyFamilyFrames(renumberTopVariants(frames));

    expect(classified.base?.E).toBe('wasteland_E_base');
    expect(classified.top?.E).toEqual(['wasteland_E', 'wasteland_E_variant001']);
  });

  it('is a no-op for an already-contiguous family (does not disturb the real-gap-detection test above)', () => {
    const frames = [frame('grasstile_E', 'top'), frame('grasstile_E_variant000', 'top'), frame('grasstile_E_variant001', 'top')];

    const classified = classifyFamilyFrames(renumberTopVariants(frames));

    expect(classified.top?.E).toEqual(['grasstile_E', 'grasstile_E_variant000', 'grasstile_E_variant001']);
  });
});

describe('textureKeyFor wasted-island mapping', () => {
  function wastedTile(terrain: Tile['terrain'], wasted = true): Tile {
    return { q: 0, r: 0, terrain, wasted };
  }

  it('maps grass/forest/sand to their wasted art families', () => {
    expect(textureKeyFor(wastedTile('grass'))).toBe('wasteland');
    expect(textureKeyFor(wastedTile('forest'))).toBe('deadforest');
    expect(textureKeyFor(wastedTile('sand'))).toBe('blacksand');
  });

  it('keeps mountain and (non-coastal) sea on their plain families even when wasted', () => {
    expect(textureKeyFor(wastedTile('mountain'))).toBe('mountain');
    expect(textureKeyFor(wastedTile('sea'))).toBe('sea');
  });

  it('does not remap an unwasted tile', () => {
    expect(textureKeyFor(wastedTile('grass', false))).toBe('grass');
  });

  it('a building on a tile still takes priority over the wasted mapping', () => {
    const tile: Tile = { q: 0, r: 0, terrain: 'grass', wasted: true, buildingType: 'hut' };
    expect(textureKeyFor(tile)).toBe('hut');
  });
});
