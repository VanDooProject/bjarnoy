import { describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import {
  baseTextureFor,
  BOG_TEXTURE_KEYS,
  bogOrientationFor,
  bogTextureKey,
  campArtFor,
  classifyFamilyClips,
  classifyFamilyFrames,
  collapseLetteredLevels,
  giantArtFamilyFor,
  renumberTopVariants,
  riverArtFor,
  riverBuildingArtFor,
  riverTexturesFor,
  mergeTileTextures,
  normalizeBogFrames,
  textureKeyFor,
  topAnimFor,
  topAnimTextures,
  topTextureFor,
  RIVER_FAMILY,
  KEY_FAMILY,
  type FamilyFrame,
  type TileTextures,
} from './textures';
import { bend60OrientationOf, bendOrientationOf, TILE_ORIENTATIONS } from './types';
import type { BogTile, RiverTile, Tile } from './types';
import type { AtlasClip } from './atlas';

/** A plain-string-keyed stand-in for `OrientationMap<T[]>` (`wastedCoastalBase`'s shape), for tests that don't otherwise need real Textures. */
function emptyOrientationArrayMap(): Record<string, unknown[]> {
  return Object.fromEntries(TILE_ORIENTATIONS.map((o) => [o, []]));
}

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
  it('resolves a Bend60 tile (adjacent edges) to the bend60 family through bend60OrientationOf, the same file for either flow direction', () => {
    const forward = riverArtFor(riverTile('bend60', 'NE', 'NW'), null);
    const backward = riverArtFor(riverTile('bend60', 'NW', 'NE'), null);

    expect(forward).toEqual({ shape: 'bend60', orientation: bend60OrientationOf('NE', 'NW') });
    expect(backward.orientation).toBe(forward.orientation);
  });

  it('does not resolve a Bend60 tile to the plain bend family', () => {
    const result = riverArtFor(riverTile('bend60', 'NE', 'NW'), null);

    expect(result.shape).not.toBe('bend');
  });

  it('still resolves an ordinary Bend tile to the bend family, unaffected by bend60 existing', () => {
    const result = riverArtFor(riverTile('bend', 'NW', 'SW'), null);

    expect(result.shape).toBe('bend');
    expect(result.orientation).toBe(bendOrientationOf('NW', 'SW'));
  });

  it('resolves a representable Confluence tile through confluenceOrientationOf (y_narrow), not the untransformed fallback', () => {
    const tile: RiverTile = { q: 0, r: 0, shape: 'confluence', inDirections: ['SE', 'SW'], outDirection: 'NW' };
    const result = riverArtFor(tile, null);

    expect(result.shape).toBe('confluencenarrow');
    expect(result.orientation).toBe('E');
    // The untransformed fallback this used to always return.
    expect(result.orientation).not.toBe('NW');
  });

  it('draws two streams joining as the smallwide Y (narrow or wide) with the same rotation as the river Y', () => {
    const narrow: RiverTile = { q: 0, r: 0, shape: 'confluence', inDirections: ['SE', 'SW'], outDirection: 'NW', width: 'widen' };
    expect(riverArtFor(narrow, null)).toEqual({ shape: 'widen_yn', orientation: 'E' });
    const wide: RiverTile = { q: 0, r: 0, shape: 'confluence', inDirections: ['NW', 'SW'], outDirection: 'E', width: 'widen' };
    expect(riverArtFor(wide, null).shape).toBe('widen_yw');
  });

  it('picks the stream families for stream tiles, with the river tile rotation', () => {
    const straight = riverTile('straight', 'E', 'W');
    expect(riverArtFor({ ...straight, width: 'stream' }, null)).toEqual({
      shape: 'small_straight',
      orientation: riverArtFor(straight, null).orientation,
    });
    const bend = riverTile('bend', 'NW', 'SW');
    expect(riverArtFor({ ...bend, width: 'stream' }, null).shape).toBe('small_bend');
    const bend60 = riverTile('bend60', 'NE', 'NW');
    expect(riverArtFor({ ...bend60, width: 'stream' }, null).shape).toBe('small_bend60');
  });

  it('draws a widening straight from its stream (inflow) end and a widening mouth toward the sea', () => {
    const widen = { ...riverTile('straight', 'E', 'W'), width: 'widen' as const };
    expect(riverArtFor(widen, null)).toEqual({ shape: 'widen_straight', orientation: 'NW' });
    const mouth: RiverTile = { q: 0, r: 0, shape: 'mouth', inDirections: ['E'], outDirection: null, width: 'widen' };
    expect(riverArtFor(mouth, 'W')).toEqual({ shape: 'widen_straight', orientation: 'NW' });
  });

  it('draws a river meeting the sea head-on as a delta, but a bent mouth and a lava mouth as before', () => {
    const mouth: RiverTile = { q: 0, r: 0, shape: 'mouth', inDirections: ['E'], outDirection: null };
    expect(riverArtFor(mouth, 'W')).toEqual({ shape: 'delta', orientation: 'NW' });
    expect(riverArtFor(mouth, 'NW').shape).toBe('bend');
    expect(riverArtFor({ ...mouth, wasted: true }, 'W').shape).toBe('straight');
  });

  it('resolves a Confluence tile matching the wide junction (ywide), not the narrow one', () => {
    // E, NW, SW are mutually 120° apart — unrepresentable by y_narrow's
    // opposite-pair-plus-branch shape, but exactly ywide's own pattern.
    const tile: RiverTile = { q: 0, r: 0, shape: 'confluence', inDirections: ['NW', 'SW'], outDirection: 'E' };
    const result = riverArtFor(tile, null);

    expect(result.shape).toBe('confluencewide');
    expect(result.orientation).toBe('NW');
  });

  it('falls back to the untransformed outDirection for a Confluence angle neither asset can represent', () => {
    const tile: RiverTile = { q: 0, r: 0, shape: 'confluence', inDirections: ['E', 'NE'], outDirection: 'SW' };
    const result = riverArtFor(tile, null);

    expect(result.shape).toBe('confluencenarrow');
    expect(result.orientation).toBe('SW');
  });

  it('points Spring at a mountain-spring family, not the old flat rivertile_spring placeholder', () => {
    // Regression coverage for a bug where the live map rendered every
    // Spring river tile with a flat, undecorated pond-on-grass composite —
    // a placeholder from before the pack had proper mountain-spring art
    // (a spring bursting from a corrie/saddleback rock formation, matching
    // the lore: a spring rises on a mountain cluster). See buildingArt.ts's
    // matching docs-page fix for the same family swap.
    expect(RIVER_FAMILY.springcorrie).toBe('mountaintile_corrie_spring');
    expect(RIVER_FAMILY.springsaddleback).toBe('mountaintile_saddleback_spring');
    expect(Object.values(RIVER_FAMILY)).not.toContain('rivertile_spring');
  });

  it('resolves a Spring tile to whichever of the two spring-capable mountain shapes the caller asks for', () => {
    // Both art families actually get used, keyed on the caller's own
    // per-coordinate lookup (WorldModel.springShapeAt) — not one hardcoded
    // shape for every spring on the map.
    const tile = riverTile('spring', null, 'SW');

    expect(riverArtFor(tile, null, 'corrie').shape).toBe('springcorrie');
    expect(riverArtFor(tile, null, 'saddleback').shape).toBe('springsaddleback');
    // Defaults to corrie when the caller doesn't pass one.
    expect(riverArtFor(tile, null).shape).toBe('springcorrie');
  });
});

describe('KEY_FAMILY dedicated shrine, archery range and lumberjack art', () => {
  it('maps each building to its own dedicated family rather than a placeholder or legacy one', () => {
    expect(KEY_FAMILY.shrineofthor).toBe('torshrine');
    expect(KEY_FAMILY.shrineofullr).toBe('ullrshrine');
    expect(KEY_FAMILY.shrineofnjord).toBe('njordshrine');
    expect(KEY_FAMILY.archeryrange).toBe('archeryrange');
    expect(KEY_FAMILY.lumberjack).toBe('lumberjack');
  });
});

describe('KEY_FAMILY new building families (map fix #1)', () => {
  // These families' art already existed in the vendored pack and were
  // already wired into buildingArt.ts's docs-page previews — only the
  // world-map renderer's own lookup table was missing them, which drew
  // every one of these buildings as bare terrain on the settlement map.
  it('maps every land building added by this fix to its own art family', () => {
    expect(KEY_FAMILY.meadery).toBe('meadery');
    expect(KEY_FAMILY.townsquare).toBe('townsquare');
    expect(KEY_FAMILY.cropmill).toBe('cropmill');
    expect(KEY_FAMILY.smithy).toBe('smithy');
    expect(KEY_FAMILY.druidhut).toBe('druidhut');
    expect(KEY_FAMILY.cartworkshop).toBe('cartworkshop');
    expect(KEY_FAMILY.claybrickworks).toBe('claybrickworks');
  });

  it('quarry is deliberately left unmapped — its art depends on the mountain shape it is carved into', () => {
    expect(KEY_FAMILY.quarry).toBeUndefined();
  });

  it('maps the new Bend60 sawmill composite to its own family', () => {
    expect(KEY_FAMILY.sawmillbend60).toBe('sawmillbend60');
  });

  it('never maps the grass/inland sawmill family — see textureKeyFor/riverBuildingArtFor\'s "never grass" guard', () => {
    expect(KEY_FAMILY.sawmill).toBeUndefined();
    expect(Object.values(KEY_FAMILY)).not.toContain('sawmill');
  });
});

describe('textureKeyFor: a Sawmill never resolves to the grass family', () => {
  it('falls back to sawmillriver when no riverArt override is given at all', () => {
    const tile: Tile = { q: 0, r: 0, terrain: 'grass', buildingType: 'sawmill' };
    expect(textureKeyFor(tile)).toBe('sawmillriver');
  });

  it('uses whatever key a riverArt override supplies', () => {
    const tile: Tile = { q: 0, r: 0, terrain: 'grass', buildingType: 'sawmill' };
    expect(textureKeyFor(tile, { key: 'sawmillbend60', orientation: 'NE' })).toBe('sawmillbend60');
  });
});

describe('riverBuildingArtFor on streams', () => {
  it('has no building art on a stream or widening tile', () => {
    const straight = { ...riverTile('straight', 'E', 'W') };
    expect(riverBuildingArtFor('sawmill', straight)).toBeDefined();
    expect(riverBuildingArtFor('sawmill', { ...straight, width: 'stream' })).toBeUndefined();
    expect(riverBuildingArtFor('cropmill', { ...straight, width: 'widen' })).toBeUndefined();
  });
});

describe('riverBuildingArtFor', () => {
  it('resolves a Sawmill on a straight river tile to sawmillriver, at the river art\'s own orientation', () => {
    const river = riverTile('straight', 'W', null);
    const result = riverBuildingArtFor('sawmill', river);
    const expected = riverArtFor(river, null);

    expect(result).toEqual({ key: 'sawmillriver', orientation: expected.orientation });
  });

  it('resolves a Sawmill on a (gentle) bend river tile to sawmillbend', () => {
    const river = riverTile('bend', 'NW', 'SW');
    const result = riverBuildingArtFor('sawmill', river);
    const expected = riverArtFor(river, null);

    expect(result).toEqual({ key: 'sawmillbend', orientation: expected.orientation });
  });

  it('resolves a Sawmill on a tight (bend60) river tile to sawmillbend60', () => {
    const river = riverTile('bend60', 'NE', 'NW');
    const result = riverBuildingArtFor('sawmill', river);
    const expected = riverArtFor(river, null);

    expect(result).toEqual({ key: 'sawmillbend60', orientation: expected.orientation });
  });

  it('is independent of the tile\'s own random orientation hash — it never takes a Tile at all, only the RiverTile', () => {
    // The whole point of this fix: a river building's channel is decided by
    // the river tile it stands on (in/out directions), not
    // worldGenerator.ts's per-hex orientationAt hash — riverBuildingArtFor's
    // signature enforces that structurally (no Tile parameter to read
    // .orientation off in the first place).
    const river = riverTile('straight', 'W', null);
    const result = riverBuildingArtFor('sawmill', river);
    expect(result?.orientation).toBe(riverArtFor(river, null).orientation);
  });

  it('resolves a Crop Mill on a straight river tile to cropmill', () => {
    const river = riverTile('straight', 'E', null);
    const result = riverBuildingArtFor('cropmill', river);
    const expected = riverArtFor(river, null);

    expect(result).toEqual({ key: 'cropmill', orientation: expected.orientation });
  });

  it('refuses a Crop Mill on a bend river tile — its art has no bend composite (riverBuildingAllowedHere already keeps this from being placed)', () => {
    const river = riverTile('bend', 'NW', 'SW');
    expect(riverBuildingArtFor('cropmill', river)).toBeUndefined();
  });

  it('refuses a Sawmill on a shape with no matching art (spring/confluence/mouth)', () => {
    for (const shape of ['spring', 'confluence', 'mouth'] as const) {
      const river = riverTile(shape, 'E', 'W');
      expect(riverBuildingArtFor('sawmill', river)).toBeUndefined();
    }
  });

  it('is a no-op for every other building type', () => {
    const river = riverTile('straight', 'E', null);
    expect(riverBuildingArtFor('hut', river)).toBeUndefined();
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

  // `sparse: true` is the buildings-level1/buildings-static split's own
  // opt-in — a family's frames are genuinely incomplete while only one of
  // the two atlases has loaded (see buildTileTextures's own `sparse`
  // parameter), which is not the same thing as a broken render pass.
  describe('sparse mode', () => {
    it('does not throw when only a single, non-zero index is present (the buildings-level1-only case)', () => {
      const result = classifyFamilyFrames([frame('vikinghut_SE_level001', 'top')], { sparse: true });

      expect(result.top?.SE).toEqual([undefined, 'vikinghut_SE_level001']);
    });

    it('does not throw for a genuine middle gap either, leaving a hole instead (the buildings-static-only case, missing level1)', () => {
      const result = classifyFamilyFrames(
        [
          frame('vikinghut_SE_level000', 'top'),
          frame('vikinghut_SE_level002', 'top'),
          frame('vikinghut_SE_level003', 'top'),
        ],
        { sparse: true },
      );

      expect(result.top?.SE).toEqual(['vikinghut_SE_level000', undefined, 'vikinghut_SE_level002', 'vikinghut_SE_level003']);
    });

    it('defaults to strict (throwing) when the option is omitted, unchanged from before sparse mode existed', () => {
      expect(() => classifyFamilyFrames([frame('vikinghut_SE_level001', 'top')])).toThrow(/missing index 0/);
    });

    it('still returns a fully dense array unchanged when the input has no gap at all', () => {
      const result = classifyFamilyFrames(
        [frame('vikinghut_SE_level000', 'top'), frame('vikinghut_SE_level001', 'top')],
        { sparse: true },
      );

      expect(result.top?.SE).toEqual(['vikinghut_SE_level000', 'vikinghut_SE_level001']);
    });
  });
});

describe('classifyFamilyClips', () => {
  it('keys a clip by its exact level and orientation', () => {
    const result = classifyFamilyClips(
      [clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00', 'f01'] })],
      resolveAll,
    );

    expect(result.SE.get(3)).toEqual({ textures: ['f00', 'f01'], fps: 6, playback: 'loop', pause: 0 });
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

  // 3D_assets PR #92: an overlay clip's frames carry only the moving parts —
  // it must resolve its own `rest` image alongside its frames, or the whole
  // clip is dropped (same "unresolved frame" degrade the plain-frame case
  // already had), never drawn parts-only with no rest underneath it.
  it('attaches the resolved rest texture for an overlay clip', () => {
    const result = classifyFamilyClips(
      [
        clip({
          name: 'sawmillriver_SE_level003',
          orientation: 'SE',
          frames: ['f00', 'f01'],
          overlay: true,
          rest: 'sawmillriver_SE_level003_rest',
        }),
      ],
      resolveAll,
    );

    expect(result.SE.get(3)).toEqual({
      textures: ['f00', 'f01'],
      fps: 6,
      playback: 'loop',
      pause: 0,
      rest: 'sawmillriver_SE_level003_rest',
    });
  });

  it("carries the clip's pause through to the map clip, so the map can hold its last frame", () => {
    const result = classifyFamilyClips(
      [clip({ name: 'torshrine_SE_level003', orientation: 'SE', frames: ['f00', 'f01'], fps: 12, pause: 8 })],
      resolveAll,
    );

    expect(result.SE.get(3)?.pause).toBe(8);
  });

  it('drops an overlay clip whose rest frame does not resolve', () => {
    const result = classifyFamilyClips(
      [
        clip({
          name: 'sawmillriver_SE_level003',
          orientation: 'SE',
          frames: ['f00'],
          overlay: true,
          rest: 'missing_rest',
        }),
      ],
      (name) => (name === 'missing_rest' ? undefined : name),
    );

    expect(result.SE.get(3)).toBeUndefined();
  });

  it('drops an overlay clip that names no rest frame at all', () => {
    const result = classifyFamilyClips(
      [clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00'], overlay: true })],
      resolveAll,
    );

    expect(result.SE.get(3)).toBeUndefined();
  });

  it('leaves a non-overlay clip unchanged — no rest field, unaffected by overlay support existing', () => {
    const result = classifyFamilyClips(
      [clip({ name: 'sawmillriver_SE_level003', orientation: 'SE', frames: ['f00', 'f01'] })],
      resolveAll,
    );

    expect(result.SE.get(3)).toEqual({ textures: ['f00', 'f01'], fps: 6, playback: 'loop', pause: 0 });
    expect(result.SE.get(3)?.rest).toBeUndefined();
  });
});

// topAnimTextures is the pure decision HexMapRenderer.ts's pooled
// base/overlay-sprite bookkeeping is built on (see its own doc comment) —
// exercised directly here with plain strings, no Pixi/sprite pool involved.
describe('topAnimTextures', () => {
  it('puts the rest image on base and the current frame on overlay for an overlay clip', () => {
    expect(topAnimTextures({ textures: ['f0', 'f1', 'f2'], rest: 'rest' }, 1)).toEqual({
      base: 'rest',
      overlay: 'f1',
    });
  });

  it('puts the current frame straight on base, with no overlay, for a legacy clip (no rest)', () => {
    expect(topAnimTextures({ textures: ['f0', 'f1', 'f2'] }, 1)).toEqual({ base: 'f1' });
    expect(topAnimTextures({ textures: ['f0', 'f1', 'f2'] }, 1).overlay).toBeUndefined();
  });

  it("base never changes across frames for an overlay clip — only overlay does", () => {
    const clipWithRest = { textures: ['f0', 'f1', 'f2'], rest: 'rest' };
    expect(topAnimTextures(clipWithRest, 0).base).toBe('rest');
    expect(topAnimTextures(clipWithRest, 2).base).toBe('rest');
    expect(topAnimTextures(clipWithRest, 0).overlay).toBe('f0');
    expect(topAnimTextures(clipWithRest, 2).overlay).toBe('f2');
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

describe('collapseLetteredLevels', () => {
  it('drops a lettered alternate pass when the level also has a plain frame (cropmill_E_level004/level004a)', () => {
    const frames = [
      frame('cropmill_E_level004', 'top'),
      frame('cropmill_E_level004a', 'top'),
      frame('cropmill_E_level004_base', 'base'),
      frame('cropmill_E_level004a_base', 'base'),
    ];

    const collapsed = collapseLetteredLevels(frames);

    expect(collapsed.map((f) => f.name).sort()).toEqual(['cropmill_E_level004', 'cropmill_E_level004_base'].sort());
  });

  it('stands the last lettered pass in for a level with no plain frame at all (townsquare_E_level000a/000b)', () => {
    const frames = [frame('townsquare_E_level000a', 'top'), frame('townsquare_E_level000b', 'top'), frame('townsquare_E_level001', 'top')];

    const collapsed = collapseLetteredLevels(frames);
    const classified = classifyFamilyFrames(collapsed);

    // townsquare_E_level000b (the later, more-finished construction stage)
    // wins over 000a, standing in for the level's plain frame.
    expect(collapsed.find((f) => f.name === 'townsquare_E_level000')?.value).toBe('townsquare_E_level000b');
    expect(classified.top?.E.length).toBe(2); // levels 000, 001 — contiguous, no missing-index throw
  });

  it('leaves ordinary frames (no level suffix at all) untouched', () => {
    const frames = [frame('grasstile_E', 'top'), frame('grasstile_E_variant000', 'top')];

    expect(collapseLetteredLevels(frames)).toEqual(frames);
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

  it('maps a wasted mountain to the jagged ash mountain and wasted open sea to taintedwater', () => {
    expect(textureKeyFor(wastedTile('mountain'))).toBe('wastedmountain');
    // WorldModel.getTile never actually produces this combination (it only
    // ever sets Tile.wasted on wasted land, or on coastal water bordering
    // it — see WASTED_TEXTURE_KEY's own doc comment); the docs page's
    // StaticWorldModel (buildIslandTiles) is the one real caller that does.
    expect(textureKeyFor(wastedTile('sea'))).toBe('taintedwater');
  });

  it('does not remap an unwasted tile', () => {
    expect(textureKeyFor(wastedTile('grass', false))).toBe('grass');
  });

  it('a building on a tile still takes priority over the wasted mapping', () => {
    const tile: Tile = { q: 0, r: 0, terrain: 'grass', wasted: true, buildingType: 'hut' };
    expect(textureKeyFor(tile)).toBe('hut');
  });
});

// baseTextureFor's wasted-mountain/giant base swap — a minimal, hand-rolled
// TileTextures fixture (plain strings standing in for real Pixi Textures,
// same reasoning riverTexturesFor's own fixture above uses).
describe('baseTextureFor wasted mountain/giant base', () => {
  const ORIENTATIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
  function orientationMap<T>(value: T) {
    return Object.fromEntries(ORIENTATIONS.map((o) => [o, value])) as Record<(typeof ORIENTATIONS)[number], T>;
  }

  function fixture(): TileTextures {
    return {
      base: {
        mountain: orientationMap('green-mountain-base' as unknown as never),
        grass: orientationMap('green-grass-base' as unknown as never),
        wasteland: orientationMap('wasteland-base' as unknown as never),
        wastedmountain: orientationMap('jagged-mountain-base' as unknown as never),
        sea: orientationMap('green-sea-base' as unknown as never),
        taintedwater: orientationMap('taintedwater-base' as unknown as never),
      },
      coastalBase: orientationMap([]),
      wastedCoastalBase: orientationMap([]),
      baseIndexed: {},
      top: {},
      animTop: {},
      riverBase: {
        straight: orientationMap('r' as unknown as never),
        straight_meander: orientationMap('r' as unknown as never),
        straight_island: orientationMap('r' as unknown as never),
        bend: orientationMap('r' as unknown as never),
        bend_meander: orientationMap('r' as unknown as never),
        bend_island: orientationMap('r' as unknown as never),
        bend60: orientationMap('r' as unknown as never),
        bend60_loop: orientationMap('r' as unknown as never),
        springcorrie: orientationMap('r' as unknown as never),
        springsaddleback: orientationMap('r' as unknown as never),
        confluencenarrow: orientationMap('r' as unknown as never),
        confluencewide: orientationMap('r' as unknown as never),
        small_straight: orientationMap('r' as unknown as never),
        small_straight_meander: orientationMap('r' as unknown as never),
        small_bend: orientationMap('r' as unknown as never),
        small_bend_meander: orientationMap('r' as unknown as never),
        small_bend60: orientationMap('r' as unknown as never),
        small_bend60_loop: orientationMap('r' as unknown as never),
        widen_straight: orientationMap('r' as unknown as never),
        widen_yn: orientationMap('r' as unknown as never),
        widen_yw: orientationMap('r' as unknown as never),
        riverstream: orientationMap('r' as unknown as never),
        delta: orientationMap('r' as unknown as never),
      },
      riverTop: {
        straight: orientationMap('r' as unknown as never),
        straight_meander: orientationMap('r' as unknown as never),
        straight_island: orientationMap('r' as unknown as never),
        bend: orientationMap('r' as unknown as never),
        bend_meander: orientationMap('r' as unknown as never),
        bend_island: orientationMap('r' as unknown as never),
        bend60: orientationMap('r' as unknown as never),
        bend60_loop: orientationMap('r' as unknown as never),
        springcorrie: orientationMap('r' as unknown as never),
        springsaddleback: orientationMap('r' as unknown as never),
        confluencenarrow: orientationMap('r' as unknown as never),
        confluencewide: orientationMap('r' as unknown as never),
        small_straight: orientationMap('r' as unknown as never),
        small_straight_meander: orientationMap('r' as unknown as never),
        small_bend: orientationMap('r' as unknown as never),
        small_bend_meander: orientationMap('r' as unknown as never),
        small_bend60: orientationMap('r' as unknown as never),
        small_bend60_loop: orientationMap('r' as unknown as never),
        widen_straight: orientationMap('r' as unknown as never),
        widen_yn: orientationMap('r' as unknown as never),
        widen_yw: orientationMap('r' as unknown as never),
        riverstream: orientationMap('r' as unknown as never),
        delta: orientationMap('r' as unknown as never),
      },
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    };
  }

  it('uses the jagged ash mountain base for a wasted mountain tile', () => {
    const textures = fixture();
    const tile: Tile = { q: 0, r: 0, terrain: 'mountain', wasted: true, orientation: 'NE' };

    expect(baseTextureFor(textures, tile)).toBe('jagged-mountain-base');
  });

  it('keeps the plain green mountain base for an unwasted mountain tile', () => {
    const textures = fixture();
    const tile: Tile = { q: 0, r: 0, terrain: 'mountain', wasted: false, orientation: 'NE' };

    expect(baseTextureFor(textures, tile)).toBe('green-mountain-base');
  });

  it('uses the wasteland base for any wasted tile carrying a giant, mountain or not', () => {
    const textures = fixture();
    const giant = { family: 'giantvolcano' as const, anchor: { q: 0, r: 0 }, part: 'C' as const, orientation: 'E' as const };
    const mountainWithGiant: Tile = { q: 0, r: 0, terrain: 'mountain', wasted: true, orientation: 'E', giant };
    const grassWithGiant: Tile = { q: 1, r: 0, terrain: 'grass', wasted: true, orientation: 'E', giant };

    expect(baseTextureFor(textures, mountainWithGiant)).toBe('wasteland-base');
    expect(baseTextureFor(textures, grassWithGiant)).toBe('wasteland-base');
  });

  it('keeps the plain green base for a giant on an unwasted island', () => {
    const textures = fixture();
    const giant = { family: 'giantmountain' as const, anchor: { q: 0, r: 0 }, part: 'C' as const, orientation: 'E' as const };
    const tile: Tile = { q: 0, r: 0, terrain: 'mountain', wasted: false, orientation: 'E', giant };

    expect(baseTextureFor(textures, tile)).toBe('green-mountain-base');
  });

  it('falls back to the plain mountain base when the wasteland family has no frames loaded', () => {
    const textures = fixture();
    textures.base = { mountain: textures.base.mountain };
    const tile: Tile = { q: 0, r: 0, terrain: 'mountain', wasted: true, orientation: 'E' };

    expect(baseTextureFor(textures, tile)).toBe('green-mountain-base');
  });

  // WASTED_TEXTURE_KEY.sea's own doc comment: WorldModel.getTile never
  // actually produces a wasted, non-coastal sea tile — this exercises the
  // one real caller that does, the docs page's StaticWorldModel
  // (wastedIsland.ts's buildIslandTiles).
  it('uses the taintedwater base for a wasted, non-coastal open sea tile', () => {
    const textures = fixture();
    const tile: Tile = { q: 0, r: 0, terrain: 'sea', wasted: true, orientation: 'NE' };

    expect(baseTextureFor(textures, tile)).toBe('taintedwater-base');
  });

  it('keeps the plain sea base for an unwasted open sea tile', () => {
    const textures = fixture();
    const tile: Tile = { q: 0, r: 0, terrain: 'sea', wasted: false, orientation: 'NE' };

    expect(baseTextureFor(textures, tile)).toBe('green-sea-base');
  });
});

describe('giantArtFamilyFor', () => {
  it('swaps giantvolcano for its wasted art variant on a wasted tile', () => {
    expect(giantArtFamilyFor('giantvolcano', true)).toBe('giantvolcano_wasted');
  });

  it('keeps giantvolcano plain on an unwasted tile', () => {
    expect(giantArtFamilyFor('giantvolcano', false)).toBe('giantvolcano');
  });

  it('leaves a family with no dedicated wasted variant unchanged even when wasted', () => {
    expect(giantArtFamilyFor('giantmountain', true)).toBe('giantmountain');
    expect(giantArtFamilyFor('giantutgard', true)).toBe('giantutgard');
    expect(giantArtFamilyFor('giantshrine', true)).toBe('giantshrine');
  });
});

// riverTexturesFor's lava-shape swap — built against a minimal, hand-rolled
// TileTextures fixture (plain strings standing in for real Pixi Textures,
// same reasoning classifyFamilyFrames's own tests use) rather than the real
// asset pipeline, which needs a browser `document` this repo's vitest
// config doesn't provide.
describe('riverTexturesFor lava-island shapes', () => {
  const ORIENTATIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
  function orientationMap<T>(value: T) {
    return Object.fromEntries(ORIENTATIONS.map((o) => [o, value])) as Record<(typeof ORIENTATIONS)[number], T>;
  }

  function fixture(): TileTextures {
    return {
      base: {},
      coastalBase: orientationMap([]),
      wastedCoastalBase: orientationMap([]),
      baseIndexed: {},
      top: {},
      animTop: {},
      riverBase: {
        straight: orientationMap('plain-river-base' as unknown as never),
        straight_meander: orientationMap('plain-river-base' as unknown as never),
        straight_island: orientationMap('plain-river-base' as unknown as never),
        bend: orientationMap('plain-river-base' as unknown as never),
        bend_meander: orientationMap('plain-river-base' as unknown as never),
        bend_island: orientationMap('plain-river-base' as unknown as never),
        bend60: orientationMap('plain-river-base' as unknown as never),
        bend60_loop: orientationMap('plain-river-base' as unknown as never),
        springcorrie: orientationMap('plain-spring-base' as unknown as never),
        springsaddleback: orientationMap('plain-spring-base' as unknown as never),
        confluencenarrow: orientationMap('plain-river-base' as unknown as never),
        confluencewide: orientationMap('plain-river-base' as unknown as never),
        small_straight: orientationMap('plain-river-base' as unknown as never),
        small_straight_meander: orientationMap('plain-river-base' as unknown as never),
        small_bend: orientationMap('plain-river-base' as unknown as never),
        small_bend_meander: orientationMap('plain-river-base' as unknown as never),
        small_bend60: orientationMap('plain-river-base' as unknown as never),
        small_bend60_loop: orientationMap('plain-river-base' as unknown as never),
        widen_straight: orientationMap('plain-river-base' as unknown as never),
        widen_yn: orientationMap('plain-river-base' as unknown as never),
        widen_yw: orientationMap('plain-river-base' as unknown as never),
        riverstream: orientationMap('plain-river-base' as unknown as never),
        delta: orientationMap('plain-river-base' as unknown as never),
      },
      riverTop: {
        straight: orientationMap('plain-river-top' as unknown as never),
        straight_meander: orientationMap('plain-river-top' as unknown as never),
        straight_island: orientationMap('plain-river-top' as unknown as never),
        bend: orientationMap('plain-river-top' as unknown as never),
        bend_meander: orientationMap('plain-river-top' as unknown as never),
        bend_island: orientationMap('plain-river-top' as unknown as never),
        bend60: orientationMap('plain-river-top' as unknown as never),
        bend60_loop: orientationMap('plain-river-top' as unknown as never),
        springcorrie: orientationMap('plain-spring-top' as unknown as never),
        springsaddleback: orientationMap('plain-spring-top' as unknown as never),
        confluencenarrow: orientationMap('plain-river-top' as unknown as never),
        confluencewide: orientationMap('plain-river-top' as unknown as never),
        small_straight: orientationMap('plain-river-top' as unknown as never),
        small_straight_meander: orientationMap('plain-river-top' as unknown as never),
        small_bend: orientationMap('plain-river-top' as unknown as never),
        small_bend_meander: orientationMap('plain-river-top' as unknown as never),
        small_bend60: orientationMap('plain-river-top' as unknown as never),
        small_bend60_loop: orientationMap('plain-river-top' as unknown as never),
        widen_straight: orientationMap('plain-river-top' as unknown as never),
        widen_yn: orientationMap('plain-river-top' as unknown as never),
        widen_yw: orientationMap('plain-river-top' as unknown as never),
        riverstream: orientationMap('plain-river-top' as unknown as never),
        delta: orientationMap('plain-river-top' as unknown as never),
      },
      lavaRiverBase: {
        straight: orientationMap('lava-base' as unknown as never),
        springcorrie: orientationMap('lava-spring-base' as unknown as never),
      },
      lavaRiverTop: {
        straight: orientationMap('lava-top' as unknown as never),
        springcorrie: orientationMap('lava-spring-top' as unknown as never),
      },
      giants: {},
      giantAnims: {},
    };
  }

  it('uses the lava family for a wasted straight tile', () => {
    const textures = fixture();
    const river = { q: 0, r: 0, shape: 'straight' as const, inDirections: ['W' as const], outDirection: 'E' as const, wasted: true };

    const result = riverTexturesFor(textures, river);

    expect(result.base).toBe('lava-base');
    expect(result.top).toBe('lava-top');
  });

  it('uses the plain river family for an unwasted straight tile', () => {
    const textures = fixture();
    const river = { q: 0, r: 0, shape: 'straight' as const, inDirections: ['W' as const], outDirection: 'E' as const, wasted: false };

    const result = riverTexturesFor(textures, river);

    expect(result.base).toBe('plain-river-base');
    expect(result.top).toBe('plain-river-top');
  });

  it('uses the lava-spring family (mountaintile_volcano_lavaspring_flows) for a wasted spring tile', () => {
    const textures = fixture();
    const river = { q: 0, r: 0, shape: 'spring' as const, inDirections: [], outDirection: 'E' as const, wasted: true };

    const result = riverTexturesFor(textures, river);

    expect(result.base).toBe('lava-spring-base');
    expect(result.top).toBe('lava-spring-top');
  });

  it('falls back to the plain family when the lava variant has no frames loaded for that shape', () => {
    const textures = fixture();
    // 'bend' has no lavaRiverBase/Top entry in this fixture.
    const river = { q: 0, r: 0, shape: 'bend' as const, inDirections: ['W' as const], outDirection: 'NE' as const, wasted: true };

    const result = riverTexturesFor(textures, river);

    expect(result.base).toBe('plain-river-base');
    expect(result.top).toBe('plain-river-top');
  });

  it('confluence never checks the lava family even when wasted (lava never confluences)', () => {
    const textures = fixture();
    const river = {
      q: 0,
      r: 0,
      shape: 'confluence' as const,
      inDirections: ['W' as const, 'E' as const],
      outDirection: null,
      wasted: true,
    };

    const result = riverTexturesFor(textures, river);

    expect(result.base).toBe('plain-river-base');
  });
});

// riverTexturesFor's river-art variant dressing (meander/island/loop) —
// same hand-rolled TileTextures fixture pattern as the lava-island describe
// above, but real Texture.EMPTY sentinels so the "no frames loaded" fallback
// path can be exercised for real (a plain placeholder string would never
// compare equal to it).
describe('riverTexturesFor river-art variants', () => {
  const ORIENTATIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
  function orientationMap<T>(value: T) {
    return Object.fromEntries(ORIENTATIONS.map((o) => [o, value])) as Record<(typeof ORIENTATIONS)[number], T>;
  }

  function fixture(): TileTextures {
    return {
      base: {},
      coastalBase: orientationMap([]),
      wastedCoastalBase: orientationMap([]),
      baseIndexed: {},
      top: {},
      animTop: {},
      riverBase: {
        straight: orientationMap('plain-base' as unknown as never),
        straight_meander: orientationMap('meander-base' as unknown as never),
        straight_island: orientationMap('island-base' as unknown as never),
        bend: orientationMap('plain-bend-base' as unknown as never),
        bend_meander: orientationMap('bend-meander-base' as unknown as never),
        bend_island: orientationMap(Texture.EMPTY as unknown as never), // never loaded — falls back
        bend60: orientationMap('plain-bend60-base' as unknown as never),
        bend60_loop: orientationMap('loop-base' as unknown as never),
        springcorrie: orientationMap('r' as unknown as never),
        springsaddleback: orientationMap('r' as unknown as never),
        confluencenarrow: orientationMap('r' as unknown as never),
        confluencewide: orientationMap('r' as unknown as never),
        small_straight: orientationMap('r' as unknown as never),
        small_straight_meander: orientationMap('r' as unknown as never),
        small_bend: orientationMap('r' as unknown as never),
        small_bend_meander: orientationMap('r' as unknown as never),
        small_bend60: orientationMap('r' as unknown as never),
        small_bend60_loop: orientationMap('r' as unknown as never),
        widen_straight: orientationMap('r' as unknown as never),
        widen_yn: orientationMap('r' as unknown as never),
        widen_yw: orientationMap('r' as unknown as never),
        riverstream: orientationMap('r' as unknown as never),
        delta: orientationMap('r' as unknown as never),
      },
      riverTop: {
        straight: orientationMap('plain-top' as unknown as never),
        straight_meander: orientationMap('meander-top' as unknown as never),
        straight_island: orientationMap('island-top' as unknown as never),
        bend: orientationMap('plain-bend-top' as unknown as never),
        bend_meander: orientationMap('bend-meander-top' as unknown as never),
        bend_island: orientationMap(Texture.EMPTY as unknown as never),
        bend60: orientationMap('plain-bend60-top' as unknown as never),
        bend60_loop: orientationMap('loop-top' as unknown as never),
        springcorrie: orientationMap('r' as unknown as never),
        springsaddleback: orientationMap('r' as unknown as never),
        confluencenarrow: orientationMap('r' as unknown as never),
        confluencewide: orientationMap('r' as unknown as never),
        small_straight: orientationMap('r' as unknown as never),
        small_straight_meander: orientationMap('r' as unknown as never),
        small_bend: orientationMap('r' as unknown as never),
        small_bend_meander: orientationMap('r' as unknown as never),
        small_bend60: orientationMap('r' as unknown as never),
        small_bend60_loop: orientationMap('r' as unknown as never),
        widen_straight: orientationMap('r' as unknown as never),
        widen_yn: orientationMap('r' as unknown as never),
        widen_yw: orientationMap('r' as unknown as never),
        riverstream: orientationMap('r' as unknown as never),
        delta: orientationMap('r' as unknown as never),
      },
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    };
  }

  const straight = { q: 0, r: 0, shape: 'straight' as const, inDirections: ['W' as const], outDirection: 'E' as const };
  const bend = { q: 0, r: 0, shape: 'bend' as const, inDirections: ['W' as const], outDirection: 'NE' as const };
  const bend60 = { q: 0, r: 0, shape: 'bend60' as const, inDirections: ['W' as const], outDirection: 'SW' as const };

  it('draws the plain family when the variant is plain', () => {
    const result = riverTexturesFor(fixture(), straight, null, 'corrie', 'plain');
    expect(result.base).toBe('plain-base');
    expect(result.top).toBe('plain-top');
  });

  it('draws the meander family for a straight tile', () => {
    const result = riverTexturesFor(fixture(), straight, null, 'corrie', 'meander');
    expect(result.base).toBe('meander-base');
    expect(result.top).toBe('meander-top');
  });

  it('draws the island family for a straight tile', () => {
    const result = riverTexturesFor(fixture(), straight, null, 'corrie', 'island');
    expect(result.base).toBe('island-base');
    expect(result.top).toBe('island-top');
  });

  it('draws the meander family for a bend tile', () => {
    const result = riverTexturesFor(fixture(), bend, null, 'corrie', 'meander');
    expect(result.base).toBe('bend-meander-base');
    expect(result.top).toBe('bend-meander-top');
  });

  it('falls back to the plain bend family when the island variant has no frames loaded', () => {
    const result = riverTexturesFor(fixture(), bend, null, 'corrie', 'island');
    expect(result.base).toBe('plain-bend-base');
    expect(result.top).toBe('plain-bend-top');
  });

  it('draws the loop family for a bend60 tile', () => {
    const result = riverTexturesFor(fixture(), bend60, null, 'corrie', 'loop');
    expect(result.base).toBe('loop-base');
    expect(result.top).toBe('loop-top');
  });

  it('bend60 has no meander/island variant, so an unexpected variant value falls back to plain', () => {
    const result = riverTexturesFor(fixture(), bend60, null, 'corrie', 'meander');
    expect(result.base).toBe('plain-bend60-base');
    expect(result.top).toBe('plain-bend60-top');
  });

  it('never applies a variant to a wasted river tile, even when one is passed', () => {
    const result = riverTexturesFor(fixture(), { ...straight, wasted: true }, null, 'corrie', 'meander');
    expect(result.base).toBe('plain-base');
    expect(result.top).toBe('plain-top');
  });
});

describe('mergeTileTextures terrain ownership', () => {
  // bg_assets_hextile 24f0644 left a few stale wasteland frames in
  // buildings-static; merged over the terrain load they used to replace the
  // whole family, so every wasteland tile of one orientation drew the same
  // single frame.
  it('keeps the terrain load\'s terrain families when a later load carries a partial copy', () => {
    const full = { E: ['plain', 'rocks', 'spikes'] } as unknown as never;
    const stale = { E: ['rocks'] } as unknown as never;
    const emptyWastedCoastalBase = emptyOrientationArrayMap();
    const a = {
      base: {},
      baseIndexed: {},
      top: { wasteland: full },
      animTop: {},
      wastedCoastalBase: emptyWastedCoastalBase,
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    } as unknown as TileTextures;
    const b = {
      base: {},
      baseIndexed: {},
      top: { wasteland: stale, hut: stale },
      animTop: {},
      wastedCoastalBase: emptyWastedCoastalBase,
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    } as unknown as TileTextures;

    const merged = mergeTileTextures(a, b);

    expect(merged.top.wasteland).toBe(full);
    expect(merged.top.hut).toBe(stale);
  });

  // With atlas packs, the wasted-only fields (wastedCoastalBase,
  // lavaRiverBase/lavaRiverTop) no longer always resolve as part of `a` (the
  // core terrain load) the way they did before packs existed — the wasted
  // pack loads separately, later, once the world reveals it (see
  // loadPackAtlases). mergeTileTextures has to keep `a`'s copy where it has
  // one (an already-revealed world reloading textures) and otherwise fall
  // back to `b`'s (the wasted pack merged in after the fact).
  it('keeps a\'s wasted fields when present, and falls back to b\'s when a has none yet', () => {
    const baseFixture = () =>
      ({ base: {}, baseIndexed: {}, top: {}, animTop: {}, giants: {}, giantAnims: {} }) as unknown as TileTextures;

    const populatedWastedCoastal = { ...emptyOrientationArrayMap(), E: ['blacksandcoast_E'] };
    const a = {
      ...baseFixture(),
      wastedCoastalBase: emptyOrientationArrayMap(),
      lavaRiverBase: {},
      lavaRiverTop: {},
    } as unknown as TileTextures;
    const b = {
      ...baseFixture(),
      wastedCoastalBase: populatedWastedCoastal,
      lavaRiverBase: { straight: 'lava-base' },
      lavaRiverTop: { straight: 'lava-top' },
    } as unknown as TileTextures;

    const merged = mergeTileTextures(a, b);

    // a had nothing yet -> falls back to b's.
    expect(merged.wastedCoastalBase.E).toEqual(['blacksandcoast_E']);
    expect(merged.lavaRiverBase.straight).toBe('lava-base');
    expect(merged.lavaRiverTop.straight).toBe('lava-top');

    // Once a itself carries the wasted pack's data (e.g. after a later
    // reload once both are loaded), a's own copy wins over b's.
    const aWithWasted = {
      ...baseFixture(),
      wastedCoastalBase: { ...emptyOrientationArrayMap(), E: ['from-a'] },
      lavaRiverBase: { straight: 'a-lava-base' },
      lavaRiverTop: { straight: 'a-lava-top' },
    } as unknown as TileTextures;
    const merged2 = mergeTileTextures(aWithWasted, b);
    expect(merged2.wastedCoastalBase.E).toEqual(['from-a']);
    expect(merged2.lavaRiverBase.straight).toBe('a-lava-base');
    expect(merged2.lavaRiverTop.straight).toBe('a-lava-top');
  });
});

// The buildings-level1/buildings-static split (see HexMapRenderer's staged
// merge and textures.ts's loadLevel1Atlases/loadBuildingAtlases): while only
// buildings-level1 has loaded, a building's `top`/`baseIndexed` arrays are
// sparse (holes left by classifyFamilyFrames' `sparse` mode) — topTextureFor/
// baseTextureFor/topAnimFor have to walk across those holes via
// pickIndexed(Entry) rather than assume a dense array, same as
// mergeTileTextures merging two such sparse builds back together
// element-wise (mergeIndexedArray/mergeKeyedArrays) rather than one whole
// array replacing the other.
describe('level-1-first loading: sparse top/baseIndexed arrays', () => {
  const ORIENTATIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
  function orientationMap<T>(value: T) {
    return Object.fromEntries(ORIENTATIONS.map((o) => [o, value])) as Record<(typeof ORIENTATIONS)[number], T>;
  }

  function emptyTileTextures(): TileTextures {
    return {
      base: {},
      baseIndexed: {},
      top: {},
      animTop: {},
      coastalBase: orientationMap([]),
      wastedCoastalBase: orientationMap([]),
      riverBase: {} as TileTextures['riverBase'],
      riverTop: {} as TileTextures['riverTop'],
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    } as unknown as TileTextures;
  }

  function huntTile(level: number): Tile {
    return { q: 0, r: 0, terrain: 'grass', orientation: 'SE', buildingType: 'hut', buildingLevel: level };
  }

  it('resolves to level-1 art for every requested level while only level 1 is loaded', () => {
    const textures = emptyTileTextures();
    // Only index 1 loaded — a hole at 0, nothing past 1 either (the shape
    // classifyFamilyFrames({sparse: true}) produces from a buildings-level1-
    // only atlas — see its own "sparse mode" tests above).
    textures.top.hut = orientationMap([undefined, 'hut-level1-top'] as unknown as never);

    expect(topTextureFor(textures, huntTile(0))).toBe('hut-level1-top');
    expect(topTextureFor(textures, huntTile(1))).toBe('hut-level1-top');
    expect(topTextureFor(textures, huntTile(3))).toBe('hut-level1-top');
  });

  it('resolves exact levels once buildings-static has merged in (dense array)', () => {
    const textures = emptyTileTextures();
    textures.top.hut = orientationMap(['hut-level0', 'hut-level1', 'hut-level2', 'hut-level3'] as unknown as never);

    expect(topTextureFor(textures, huntTile(0))).toBe('hut-level0');
    expect(topTextureFor(textures, huntTile(1))).toBe('hut-level1');
    expect(topTextureFor(textures, huntTile(2))).toBe('hut-level2');
    expect(topTextureFor(textures, huntTile(3))).toBe('hut-level3');
  });

  it('still walks down to the richest known rung for a level past the family\'s authored max', () => {
    const textures = emptyTileTextures();
    textures.top.hut = orientationMap(['hut-level0', 'hut-level1', 'hut-level2', 'hut-level3'] as unknown as never);

    expect(topTextureFor(textures, huntTile(10))).toBe('hut-level3');
  });

  it('merging a level-1-only build with a static-only build fills the holes without losing level 1', () => {
    const level1Only = emptyTileTextures();
    level1Only.top.hut = orientationMap([undefined, 'hut-level1'] as unknown as never);

    const staticOnly = emptyTileTextures();
    // buildings-static alone is missing level 1 by design (it lives in
    // buildings-level1 instead) — a real gap in the middle, tolerated by
    // sparse mode, not the fully-dense shape a non-split atlas produces.
    staticOnly.top.hut = orientationMap(['hut-level0', undefined, 'hut-level2', 'hut-level3'] as unknown as never);

    const merged = mergeTileTextures(level1Only, staticOnly);

    expect(merged.top.hut?.SE).toEqual(['hut-level0', 'hut-level1', 'hut-level2', 'hut-level3']);
    // And the merged, now-dense array resolves every level exactly.
    expect(topTextureFor(merged, huntTile(0))).toBe('hut-level0');
    expect(topTextureFor(merged, huntTile(1))).toBe('hut-level1');
    expect(topTextureFor(merged, huntTile(2))).toBe('hut-level2');
    expect(topTextureFor(merged, huntTile(3))).toBe('hut-level3');
  });

  it('merging the other way round (static loaded first) still keeps level 1', () => {
    const staticOnly = emptyTileTextures();
    staticOnly.top.hut = orientationMap(['hut-level0', undefined, 'hut-level2'] as unknown as never);
    const level1Only = emptyTileTextures();
    level1Only.top.hut = orientationMap([undefined, 'hut-level1'] as unknown as never);

    const merged = mergeTileTextures(staticOnly, level1Only);

    expect(merged.top.hut?.SE).toEqual(['hut-level0', 'hut-level1', 'hut-level2']);
  });

  it('baseIndexed resolves the same way (a leveled base, e.g. fishinghut)', () => {
    const textures = emptyTileTextures();
    textures.baseIndexed.fishinghut = orientationMap([undefined, 'fishinghut-base-1'] as unknown as never);
    const tile: Tile = { q: 0, r: 0, terrain: 'sea', orientation: 'SE', buildingType: 'fishinghut', buildingLevel: 3 };

    expect(baseTextureFor(textures, tile)).toBe('fishinghut-base-1');
  });

  it('topAnimFor resolves the same rung topTextureFor picked, not a plain clamp', () => {
    const textures = emptyTileTextures();
    textures.top.hut = orientationMap([undefined, 'hut-level1-top'] as unknown as never);
    textures.animTop.hut = orientationMap([undefined, { textures: ['f0'], fps: 6, playback: 'loop' }] as unknown as never);

    // Requesting level 0 (a hole) resolves to index 1's texture — topAnimFor
    // must read animTop's index 1 too, not animTop[0] (undefined) or throw.
    expect(topTextureFor(textures, huntTile(0))).toBe('hut-level1-top');
    expect(topAnimFor(textures, huntTile(0))).toEqual({ textures: ['f0'], fps: 6, playback: 'loop' });
  });
});

// Wildlife camps: an animated topping at art level 1 (guarded). The guarded art only ships
// the rotations that show the animals best (wolfden: SW and SE; bearrapids: E, NE and SE), and
// campArtFor maps the tile's own orientation onto them, reading the kept ones off the frames.
describe('wildlife camps', () => {
  const ORIENTATIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;

  function emptyTileTextures(): TileTextures {
    const orientationMap = <T,>(value: T) => Object.fromEntries(ORIENTATIONS.map((o) => [o, value])) as Record<(typeof ORIENTATIONS)[number], T>;
    return {
      base: {},
      baseIndexed: {},
      top: {},
      animTop: {},
      coastalBase: orientationMap([]),
      wastedCoastalBase: orientationMap([]),
      riverBase: {},
      riverTop: {},
      lavaRiverBase: {},
      lavaRiverTop: {},
      giants: {},
      giantAnims: {},
    } as unknown as TileTextures;
  }

  /** `family` with a cleared frame in every orientation and a guarded frame (and clip) only in `kept`. */
  function withCamp(textures: TileTextures, family: string, kept: readonly string[]) {
    const top: Record<string, unknown[]> = {};
    const anim: Record<string, unknown[]> = {};
    for (const o of ORIENTATIONS) {
      top[o] = kept.includes(o) ? [`${family}-${o}-cleared`, `${family}-${o}-guarded`] : [`${family}-${o}-cleared`];
      anim[o] = kept.includes(o) ? [undefined, { textures: [`${family}-${o}-f0`], fps: 6, playback: 'loop' }] : [undefined];
    }
    (textures.top as Record<string, unknown>)[family] = top;
    (textures.animTop as Record<string, unknown>)[family] = anim;
  }

  function campTile(family: string, orientation: Tile['orientation'], terrain: Tile['terrain'] = 'grass'): Tile {
    return { q: 0, r: 0, terrain, orientation, camp: { family, level: 3, orientation: orientation!, strong: true, guardRange: 5 } };
  }

  it('maps the tile orientation onto the guarded rotations by modulo, in TILE_ORIENTATIONS order', () => {
    const textures = emptyTileTextures();
    withCamp(textures, 'wolfden', ['SE', 'SW']);
    // kept in TILE_ORIENTATIONS order: [SW, SE]; index % 2 picks SW for E/NW/SW, SE for NE/W/SE.
    const mapped = ORIENTATIONS.map((o) => campArtFor(textures, campTile('wolfden', o), undefined)?.orientation);
    expect(mapped).toEqual(['SW', 'SE', 'SW', 'SE', 'SW', 'SE']);
  });

  it('a camp with one kept rotation always takes it; with no art loaded yet it keeps its own', () => {
    const textures = emptyTileTextures();
    withCamp(textures, 'eagleeyrie', ['SW']);
    for (const o of ORIENTATIONS) expect(campArtFor(textures, campTile('eagleeyrie', o, 'mountain'), undefined)?.orientation).toBe('SW');
    expect(campArtFor(emptyTileTextures(), campTile('wolfden', 'NW'), undefined)?.orientation).toBe('NW');
  });

  it('renders the camp family at the guarded level, and its clip', () => {
    const textures = emptyTileTextures();
    withCamp(textures, 'wolfden', ['SE', 'SW']);
    const tile = { ...campTile('wolfden', 'SW'), variant: 2 };
    expect(topTextureFor(textures, tile)).toBe('wolfden-SW-guarded');
    expect(topAnimFor(textures, tile)).toEqual({ textures: ['wolfden-SW-f0'], fps: 6, playback: 'loop' });
  });

  it('a tile without a camp is untouched by the camp lookup', () => {
    const textures = emptyTileTextures();
    withCamp(textures, 'wolfden', ['SE']);
    expect(campArtFor(textures, { q: 0, r: 0, terrain: 'grass', orientation: 'SE' }, undefined)).toBeUndefined();
    expect(topTextureFor(textures, { q: 0, r: 0, terrain: 'grass', orientation: 'SE' })).toBeUndefined();
  });

  describe('bearrapids on a river', () => {
    const straight = (inDirection: Tile['orientation'], outDirection: Tile['orientation']): RiverTile => ({
      q: 0,
      r: 0,
      shape: 'straight',
      inDirections: [inDirection!],
      outDirection: outDirection!,
    });

    it('keeps its channel: the kept rotation with the river\'s own index mod 3 (a straight channel is symmetric)', () => {
      const textures = emptyTileTextures();
      withCamp(textures, 'bearrapids', ['E', 'NE', 'SE']);
      // The plain straight art for a river flowing E<->W is orientation `straightOrientationOf(E)` = NW, whose
      // channel (index 2, mod 3 = 2) is SE's (index 5, mod 3 = 2).
      const art = campArtFor(textures, campTile('bearrapids', 'E', 'grass'), straight('W', 'E'));
      expect(art?.orientation).toBe('SE');
      expect(art?.riverArt).toEqual({ key: 'bearrapids', orientation: 'SE' });
      // Every straight river maps to one of the three kept rotations, and opposite flows agree.
      for (const flow of [
        ['E', 'W'],
        ['NE', 'SW'],
        ['NW', 'SE'],
      ] as const) {
        const forward = campArtFor(textures, campTile('bearrapids', 'E'), straight(flow[0], flow[1]));
        const backward = campArtFor(textures, campTile('bearrapids', 'E'), straight(flow[1], flow[0]));
        expect(forward?.orientation).toBe(backward?.orientation);
        expect(['E', 'NE', 'SE']).toContain(forward?.orientation);
      }
    });

    it('is drawn as plain river off a straight river tile (or a lava one)', () => {
      const textures = emptyTileTextures();
      withCamp(textures, 'bearrapids', ['E', 'NE', 'SE']);
      const tile = campTile('bearrapids', 'E');
      expect(campArtFor(textures, tile, undefined)).toBeUndefined();
      expect(campArtFor(textures, tile, { ...straight('W', 'E'), shape: 'bend' })).toBeUndefined();
      expect(campArtFor(textures, tile, { ...straight('W', 'E'), wasted: true })).toBeUndefined();
    });

    it('uses its own river base and top at the guarded level', () => {
      const textures = emptyTileTextures();
      withCamp(textures, 'bearrapids', ['E', 'NE', 'SE']);
      const bases = Object.fromEntries(ORIENTATIONS.map((o) => [o, [`base-${o}-0`, `base-${o}-1`]]));
      (textures.baseIndexed as Record<string, unknown>).bearrapids = bases;
      const tile = campTile('bearrapids', 'E');
      const art = campArtFor(textures, tile, straight('W', 'E'))!;
      const drawn = { ...tile, orientation: art.orientation };
      expect(baseTextureFor(textures, drawn, art.riverArt)).toBe('base-SE-1');
      expect(topTextureFor(textures, drawn, art.riverArt)).toBe('bearrapids-SE-guarded');
    });
  });
});

// The bog set (3D_assets docs/bog-tiles.md): nine families, each a plain frame plus `variantNNN` frames numbered from 001
// (no variant000), the plain lake's `variant004` fish weir and the two boat clips' static frames among them.
describe('bog art', () => {
  it('lines every bog family up variant by variant, plain first, dropping what the game does not roll', () => {
    const frames: FamilyFrame<string>[] = [];
    for (const suffix of ['', '_variant001', '_variant002', '_variant003', '_variant004', '_variant005']) {
      frames.push(frame(`boglake_E${suffix}`, 'top'));
      frames.push(frame(`boglake_E${suffix}_base`, 'base'));
    }
    const normalised = normalizeBogFrames(frames, 3);
    // 4 looks x (top + base): the fish weir (004) and the ore boat (005) are gone.
    expect(normalised.map((f) => f.name).sort()).toEqual(
      [
        'boglake_E',
        'boglake_E_base',
        'boglake_E_variant000',
        'boglake_E_variant000_base',
        'boglake_E_variant001',
        'boglake_E_variant001_base',
        'boglake_E_variant002',
        'boglake_E_variant002_base',
      ].sort(),
    );
    // ...and the classifier now sees the contiguous 0..3 numbering it needs (it throws on a gap).
    const classified = classifyFamilyFrames(normalised);
    // (The classified values are the original frames, in order: plain, variant001, 002, 003.)
    expect(classified.top!.E).toEqual(['boglake_E', 'boglake_E_variant001', 'boglake_E_variant002', 'boglake_E_variant003']);
    expect(classified.baseIndexed!.E).toEqual([
      'boglake_E_base',
      'boglake_E_variant001_base',
      'boglake_E_variant002_base',
      'boglake_E_variant003_base',
    ]);
  });

  it('keeps the moss family as one base under eight decorated tops', () => {
    const frames: FamilyFrame<string>[] = [frame('bog_W_base', 'base'), frame('bog_W', 'top')];
    for (let v = 1; v <= 8; v++) frames.push(frame(`bog_W_variant00${v}`, 'top'));
    const classified = classifyFamilyFrames(normalizeBogFrames(frames));
    expect(classified.base!.W).toBe('bog_W_base');
    expect(classified.top!.W).toHaveLength(9);
    expect(classified.top!.W[8]).toBe('bog_W_variant008');
  });

  it('gives every bog family its own key and family, all of them terrain keys', () => {
    for (const key of BOG_TEXTURE_KEYS) expect(KEY_FAMILY[key], key).toBeDefined();
    expect(KEY_FAMILY.bog).toBe('bog');
    expect(KEY_FAMILY.lake).toBe('boglake');
    expect(KEY_FAMILY.lakemouth).toBe('boglake_mouth');
    expect(KEY_FAMILY.bogcreekbend).toBe('bogcreek_bend');
    expect(new Set([...BOG_TEXTURE_KEYS].map((k) => KEY_FAMILY[k])).size).toBe(BOG_TEXTURE_KEYS.size);
  });

  const bogTile = (kind: BogTile['kind'], inDirections: BogTile['inDirections'] = [], outDirection: BogTile['outDirection'] = null, waterEdges: BogTile['waterEdges'] = []): BogTile => ({
    q: 0,
    r: 0,
    kind,
    inDirections,
    outDirection,
    waterEdges,
  });

  it('picks the texture key from the kind: shores by water edges, creeks straight or bend by their directions', () => {
    expect(bogTextureKey(bogTile('bog'))).toBe('bog');
    expect(bogTextureKey(bogTile('lake'))).toBe('lake');
    expect(bogTextureKey(bogTile('inlet', [], null, ['E']))).toBe('lakeinlet');
    expect(bogTextureKey(bogTile('shore', [], null, ['E', 'NE']))).toBe('lakeshore');
    expect(bogTextureKey(bogTile('half', [], null, ['E', 'NE', 'NW']))).toBe('lakehalf');
    expect(bogTextureKey(bogTile('mouth', ['W'], 'E', ['E']))).toBe('lakemouth');
    expect(bogTextureKey(bogTile('creekspring', [], 'E'))).toBe('bogcreekspring');
    // Opposite in/out is the straight crossing; 60 degrees off straight (two indices apart) is the bend.
    expect(bogTextureKey(bogTile('creek', ['W'], 'E'))).toBe('bogcreek');
    expect(bogTextureKey(bogTile('creek', ['E'], 'SW'))).toBe('bogcreekbend');
  });

  it('rotates each family the way its art was measured (see types.test.ts for the measurements)', () => {
    // Water to the SE, shore with SE, E: the run starts at SE and continues to E (5, 0): file (5 - 5) = E.
    expect(bogOrientationFor(bogTile('shore', [], null, ['SE', 'E']), 'NW')).toBe('E');
    // A mouth to the lake in the SE uses the inlet's file for that water direction.
    expect(bogOrientationFor(bogTile('mouth', ['NW'], 'SE', ['SE']), 'W')).toBe('E');
    // The creeks reuse the river conventions.
    expect(bogOrientationFor(bogTile('creek', ['W'], 'E'), 'W')).toBe('SE');
    expect(bogOrientationFor(bogTile('creek', ['E'], 'W'), 'W')).toBe('NW');
    expect(bogOrientationFor(bogTile('creek', ['E'], 'NW'), 'W')).toBe('NW');
    expect(bogOrientationFor(bogTile('creekspring', [], 'E'), 'W')).toBe('NW');
    // Moss and open water have no direction: they keep the tile's own cosmetic rotation.
    expect(bogOrientationFor(bogTile('bog'), 'SW')).toBe('SW');
    expect(bogOrientationFor(bogTile('lake'), 'NE')).toBe('NE');
  });

  it('draws a bog tile with the family of its kind, and a building on it with the building family', () => {
    const shore: Tile = { q: 0, r: 0, terrain: 'bog', orientation: 'SW', variant: 0, bog: bogTile('inlet', [], null, ['E']) };
    expect(textureKeyFor(shore)).toBe('lakeinlet');
    expect(textureKeyFor({ ...shore, buildingType: 'hut' })).toBe('hut');
    expect(textureKeyFor({ q: 0, r: 0, terrain: 'lake' })).toBe('lake');
    expect(textureKeyFor({ q: 0, r: 0, terrain: 'bog' })).toBe('bog');
  });
});
