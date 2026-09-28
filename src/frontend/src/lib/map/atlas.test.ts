import { describe, expect, it } from 'vitest';
import {
  ATLAS_PACKS,
  categorySearchOrder,
  findClipIn,
  findFrameIn,
  loadAtlasPackCategory,
  loadOptionalAtlasCategory,
  pagesForIndex,
  unloadAtlasCategory,
  type AtlasManifest,
  type AtlasPageIndex,
} from './atlas';

// Building a real LoadedAtlas needs Pixi's Assets.load/Spritesheet.parse,
// which need a browser `document` this repo's node-environment vitest config
// doesn't provide (same reason textures.test.ts exercises its pure functions
// directly rather than through loadTileTextures — see its own comment). The
// pack-fallback logic (categorySearchOrder/pagesForIndex/findFrameIn/
// findClipIn) has no Pixi dependency of its own, so it's exercised here
// against synthetic manifests instead of the real (not-yet-pack-split)
// vendored atlas.
function manifest(frames: Record<string, Partial<AtlasManifest['frames'][string]>> = {}, clips: AtlasManifest['clips'] = {}): AtlasManifest {
  const fullFrames: AtlasManifest['frames'] = {};
  for (const [name, frame] of Object.entries(frames)) {
    fullFrames[name] = {
      frame: { x: 0, y: 0, w: 10, h: 10 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 10, h: 10 },
      sourceSize: { w: 10, h: 10 },
      ...frame,
    };
  }
  return {
    frames: fullFrames,
    meta: { image: 'page.webp', size: { w: 100, h: 100 }, scale: '1' },
    clips,
  };
}

function indexOf(pages: Record<string, AtlasManifest>): AtlasPageIndex {
  const webp: Record<string, string> = {};
  for (const path of Object.keys(pages)) {
    webp[path.replace(/\.json$/, '.webp')] = `url:${path}`;
  }
  return { json: pages, webp };
}

describe('ATLAS_PACKS / categorySearchOrder', () => {
  it('lists wasted and frozen', () => {
    expect(ATLAS_PACKS).toEqual(['wasted', 'frozen']);
  });

  it('searches the core category first, then each pack variant', () => {
    expect(categorySearchOrder('terrain')).toEqual(['terrain', 'wasted-terrain', 'frozen-terrain']);
  });

  it('searches buildings-level1 immediately before buildings-static, for the core category and every pack', () => {
    expect(categorySearchOrder('buildings-static')).toEqual([
      'buildings-level1',
      'buildings-static',
      'wasted-buildings-level1',
      'wasted-buildings-static',
      'frozen-buildings-level1',
      'frozen-buildings-static',
    ]);
  });

  it('leaves a non-buildings-static category (e.g. buildings-anim) unaffected by the level1 split', () => {
    expect(categorySearchOrder('buildings-anim')).toEqual(['buildings-anim', 'wasted-buildings-anim', 'frozen-buildings-anim']);
  });
});

describe('pagesForIndex', () => {
  it('does not pick up a pack category page for the core category of the same base name', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({ grasstile_E: {} }),
      '/atlas/wasted-terrain-0.json': manifest({ wasteland_E: {} }),
    });

    const terrainPages = pagesForIndex(index, 'terrain');
    const wastedPages = pagesForIndex(index, 'wasted-terrain');

    expect(terrainPages).toHaveLength(1);
    expect(terrainPages[0].manifest.frames.grasstile_E).toBeDefined();
    expect(terrainPages[0].manifest.frames.wasteland_E).toBeUndefined();

    expect(wastedPages).toHaveLength(1);
    expect(wastedPages[0].manifest.frames.wasteland_E).toBeDefined();
  });

  it('sorts multiple pages of the same category by page number', () => {
    const index = indexOf({
      '/atlas/terrain-1.json': manifest({ b: {} }),
      '/atlas/terrain-0.json': manifest({ a: {} }),
    });

    const pages = pagesForIndex(index, 'terrain');

    expect(pages.map((p) => Object.keys(p.manifest.frames)[0])).toEqual(['a', 'b']);
  });

  it('throws if a manifest has no matching webp page', () => {
    const index: AtlasPageIndex = { json: { '/atlas/terrain-0.json': manifest() }, webp: {} };

    expect(() => pagesForIndex(index, 'terrain')).toThrow(/no matching \.webp page/);
  });
});

describe('findFrameIn', () => {
  it('resolves a frame from the core category without touching any pack', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({ grasstile_E: {} }),
      '/atlas/wasted-terrain-0.json': manifest({ grasstile_E: { frame: { x: 99, y: 99, w: 1, h: 1 } } }),
    });

    const found = findFrameIn(index, 'terrain', 'grasstile_E');

    expect(found?.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('falls back to the wasted pack when the core category has no such frame', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({ grasstile_E: {} }),
      '/atlas/wasted-terrain-0.json': manifest({ wasteland_E: {} }),
    });

    const found = findFrameIn(index, 'terrain', 'wasteland_E');

    expect(found).toBeDefined();
  });

  it('returns undefined when neither the core category nor any pack has the frame', () => {
    const index = indexOf({ '/atlas/terrain-0.json': manifest({ grasstile_E: {} }) });

    expect(findFrameIn(index, 'terrain', 'nope')).toBeUndefined();
  });

  it('never crashes searching a category with no pack variant at all (e.g. showcase)', () => {
    const index = indexOf({ '/atlas/showcase-0.json': manifest({ hut_SE_level000: {} }) });

    expect(findFrameIn(index, 'showcase', 'hut_SE_level000')).toBeDefined();
    expect(findFrameIn(index, 'showcase', 'missing')).toBeUndefined();
  });

  it('also finds a frame parked in buildings-level1 when searching buildings-static (old atlas has no such page at all)', () => {
    const index = indexOf({
      '/atlas/buildings-level1-0.json': manifest({ archerybuilding_SE_level001: { frame: { x: 1, y: 1, w: 1, h: 1 } } }),
      '/atlas/buildings-static-0.json': manifest({ archerybuilding_SE_level000: {} }),
    });

    expect(findFrameIn(index, 'buildings-static', 'archerybuilding_SE_level001')?.frame).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(findFrameIn(index, 'buildings-static', 'archerybuilding_SE_level000')?.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('resolves a bjarnoy.aliases entry to the target frame in the target category', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({ grasstile_E_base: { frame: { x: 7, y: 7, w: 2, h: 2 } } }),
      '/atlas/buildings-level1-0.json': {
        ...manifest({ archerybuilding_SE_base: {} }),
        meta: {
          image: 'page.webp',
          size: { w: 100, h: 100 },
          scale: '1',
          bjarnoy: {
            atlasVersion: 1,
            category: 'buildings-level1',
            sourceHash: 'x',
            tile: { w: 200, h: 300, topFaceY: 140, topFaceH: 92 },
            aliases: {
              archerybuilding_SE_ground_alias: { category: 'terrain', frame: 'grasstile_E_base', family: 'grasstile', layer: 'base' },
            },
          },
        },
      },
    });

    const found = findFrameIn(index, 'buildings-static', 'archerybuilding_SE_ground_alias');

    expect(found?.frame).toEqual({ x: 7, y: 7, w: 2, h: 2 });
  });

  it('returns undefined for an alias whose target frame does not exist', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({ grasstile_E_base: {} }),
      '/atlas/buildings-level1-0.json': {
        ...manifest({}),
        meta: {
          image: 'page.webp',
          size: { w: 100, h: 100 },
          scale: '1',
          bjarnoy: {
            atlasVersion: 1,
            category: 'buildings-level1',
            sourceHash: 'x',
            tile: { w: 200, h: 300, topFaceY: 140, topFaceH: 92 },
            aliases: {
              broken_alias: { category: 'terrain', frame: 'no_such_frame', family: 'grasstile', layer: 'base' },
            },
          },
        },
      },
    });

    expect(findFrameIn(index, 'buildings-static', 'broken_alias')).toBeUndefined();
  });
});

describe('findClipIn', () => {
  const clip = {
    name: 'wasteland_E_level000',
    family: 'wasteland',
    orientation: 'E',
    camera: 'E',
    layer: 'top',
    source_level: null,
    variant: null,
    pass_suffix: '',
    anim_type: 'loop' as const,
    playback: 'loop' as const,
    fps: 6,
    pause: 0,
    frame_count: 1,
    frame_padding: 2,
    frames: ['wasteland_E_level000_f00'],
    parts: [],
  };

  it('falls back to a pack category for a clip, resolving its frames from that same pack page', () => {
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({}),
      '/atlas/wasted-terrain-0.json': manifest(
        { wasteland_E_level000_f00: {} },
        { [clip.name]: clip },
      ),
    });

    const found = findClipIn(index, 'terrain', clip.name);

    expect(found).toBeDefined();
    expect(found?.frameRects).toHaveLength(1);
  });

  it('returns undefined when no category (core or pack) has the clip', () => {
    const index = indexOf({ '/atlas/terrain-0.json': manifest({}) });

    expect(findClipIn(index, 'terrain', clip.name)).toBeUndefined();
  });

  it('resolves an overlay clip\'s rest frame through the same category the clip was found in', () => {
    const overlayClip = {
      ...clip,
      name: 'sawmillriver_SE_level003',
      family: 'sawmillriver',
      frames: ['sawmillriver_SE_level003_f00'],
      overlay: true,
      rest: 'sawmillriver_SE_level003_rest',
    };
    const index = indexOf({
      '/atlas/terrain-0.json': manifest({}),
      '/atlas/wasted-terrain-0.json': manifest(
        {
          sawmillriver_SE_level003_f00: {},
          sawmillriver_SE_level003_rest: { frame: { x: 5, y: 5, w: 1, h: 1 } },
        },
        { [overlayClip.name]: overlayClip },
      ),
    });

    const found = findClipIn(index, 'terrain', overlayClip.name);

    expect(found?.restRect?.frame).toEqual({ x: 5, y: 5, w: 1, h: 1 });
  });

  it('leaves restRect undefined for a clip with no rest field (legacy, non-overlay clip)', () => {
    const index = indexOf({
      '/atlas/wasted-terrain-0.json': manifest({ wasteland_E_level000_f00: {} }, { [clip.name]: clip }),
    });

    const found = findClipIn(index, 'terrain', clip.name);

    expect(found).toBeDefined();
    expect(found?.restRect).toBeUndefined();
  });

  it('leaves restRect undefined when the named rest frame does not itself resolve', () => {
    const overlayClip = {
      ...clip,
      overlay: true,
      rest: 'missing_rest_frame',
    };
    const index = indexOf({
      '/atlas/wasted-terrain-0.json': manifest({ wasteland_E_level000_f00: {} }, { [clip.name]: overlayClip }),
    });

    const found = findClipIn(index, 'terrain', clip.name);

    expect(found?.restRect).toBeUndefined();
  });
});

describe('loadAtlasPackCategory', () => {
  it('resolves to an empty LoadedAtlas, without throwing, when the pack has no vendored pages', async () => {
    // A category no atlas ever ships, so this stays the real "zero pages"
    // code path whatever art is vendored (a real pack page would reach
    // Pixi's Assets.load, which needs a browser) — loadAtlasCategory throws
    // for the same case; loadAtlasPackCategory must not.
    const result = await loadAtlasPackCategory('wasted', 'no-such-category');

    expect(result).toEqual({ textures: {}, frameMeta: {}, clips: {} });
  });
});

describe('loadOptionalAtlasCategory', () => {
  it('resolves to an empty LoadedAtlas, without throwing, for a core category with no vendored pages (e.g. buildings-level1 on the older atlas)', async () => {
    const result = await loadOptionalAtlasCategory('no-such-core-category');

    expect(result).toEqual({ textures: {}, frameMeta: {}, clips: {} });
  });
});

describe('unloadAtlasCategory', () => {
  it('is a no-op for a category that was never loaded', async () => {
    await expect(unloadAtlasCategory('never-loaded-category')).resolves.toBeUndefined();
  });

  it('is a no-op for a loaded-but-empty pack category (no vendored pages, so no real Assets.unload call)', async () => {
    await loadAtlasPackCategory('wasted', 'no-such-category-2');
    await expect(unloadAtlasCategory('wasted-no-such-category-2')).resolves.toBeUndefined();
    // Dropped from the cache regardless — a later load re-resolves rather
    // than replaying a stale reference (verified indirectly: loading again
    // still resolves cleanly rather than throwing on a torn-down promise).
    await expect(loadAtlasPackCategory('wasted', 'no-such-category-2')).resolves.toEqual({
      textures: {},
      frameMeta: {},
      clips: {},
    });
  });
});
