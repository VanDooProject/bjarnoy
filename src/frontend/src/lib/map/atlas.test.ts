import { describe, expect, it } from 'vitest';
import {
  ATLAS_PACKS,
  categorySearchOrder,
  findClipIn,
  findFrameIn,
  loadAtlasPackCategory,
  pagesForIndex,
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
});

describe('loadAtlasPackCategory', () => {
  it('resolves to an empty LoadedAtlas, without throwing, when the pack has no vendored pages yet', async () => {
    // The currently vendored atlas (src/frontend/vendor/bg_assets_hextile)
    // ships no pack pages at all, so this exercises the real (not
    // synthetic) code path — loadAtlasCategory would throw for the same
    // "zero pages" case; loadAtlasPackCategory must not.
    const result = await loadAtlasPackCategory('wasted', 'terrain');

    expect(result).toEqual({ textures: {}, frameMeta: {}, clips: {} });
  });
});
