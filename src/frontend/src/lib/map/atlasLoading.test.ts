import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pixi's Assets.load/Spritesheet need a browser; stand in for them so the
// page-by-page loading logic (loadPages and the lazy manifest store around
// it) runs for real against the vendored manifests.
vi.mock('pixi.js', () => {
  class Spritesheet {
    textures: Record<string, { frameName: string }> = {};
    manifest: { frames: Record<string, unknown> };
    constructor(_page: unknown, manifest: { frames: Record<string, unknown> }) {
      this.manifest = manifest;
    }
    async parse() {
      for (const name of Object.keys(this.manifest.frames)) this.textures[name] = { frameName: name };
    }
  }
  return { Assets: { load: vi.fn(async (url: string) => ({ url })), unload: vi.fn(async () => {}) }, Spritesheet, Texture: {} };
});

import {
  atlasManifestVersion,
  categorySearchOrder,
  findAtlasFrame,
  findFrameIn,
  loadAtlasCategory,
  loadAtlasManifests,
  prefetchAtlasPages,
  preloadAtlasManifests,
  preloadDocsAtlasManifests,
  startBackgroundAtlasLoad,
  type AtlasManifest,
  type AtlasPageIndex,
} from './atlas';
import {
  MANIFESTS,
  discoveredPages,
  registerAtlasManifestsForTests,
  unregisterAtlasManifestsForTests,
} from './atlasManifests';

const flush = () => new Promise((r) => setTimeout(r, 0));

function pageNumber(url: string): number {
  return Number(/-(\d+)\.(?:json|webp)/.exec(url)![1]);
}

describe('lazy manifest store', () => {
  let removed: Record<string, AtlasManifest>;
  beforeEach(() => {
    removed = unregisterAtlasManifestsForTests('terrain');
  });
  afterEach(() => {
    registerAtlasManifestsForTests(removed);
    vi.unstubAllGlobals();
  });

  it('finds nothing before the category loads, finds it after, and bumps the version once per batch', async () => {
    const frameName = Object.keys(removed['terrain-0.json'].frames)[0];
    expect(findAtlasFrame('terrain', frameName)).toBeUndefined();

    const byUrl = new Map(discoveredPages('terrain').map((p) => [p.jsonUrl, removed[p.path.split('/').pop()!]]));
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        return { ok: true, json: async () => byUrl.get(url) };
      }),
    );

    const before = atlasManifestVersion.value;
    await loadAtlasManifests('terrain');
    expect(fetched.sort()).toEqual([...byUrl.keys()].sort());
    expect(atlasManifestVersion.value).toBe(before + 1);
    expect(findAtlasFrame('terrain', frameName)).toBeDefined();

    // Cached: a second call neither fetches nor bumps.
    await loadAtlasManifests('terrain');
    expect(fetched).toHaveLength(byUrl.size);
    expect(atlasManifestVersion.value).toBe(before + 1);
  });

  it('evicts a failed load so a retry fetches again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(loadAtlasManifests('terrain')).rejects.toThrow('503');

    const byUrl = new Map(discoveredPages('terrain').map((p) => [p.jsonUrl, removed[p.path.split('/').pop()!]]));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => byUrl.get(url) })));
    await expect(loadAtlasManifests('terrain')).resolves.toBeUndefined();
  });

  it('resolves immediately for a category with no pages', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await loadAtlasManifests('does-not-exist');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('showcase search across <group>-showcase categories', () => {
  function frameManifest(name: string): AtlasManifest {
    return {
      frames: {
        [name]: {
          frame: { x: 1, y: 2, w: 10, h: 10 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 10, h: 10 },
          sourceSize: { w: 10, h: 10 },
        },
      },
      meta: { image: 'p.webp', size: { w: 100, h: 100 }, scale: '1' },
    };
  }
  const index: AtlasPageIndex = {
    json: {
      '/atlas/showcase-0.json': frameManifest('plain'),
      '/atlas/bog-showcase-0.json': frameManifest('bogonly'),
      '/atlas/camps-showcase-200.json': frameManifest('campsonly'),
      '/atlas/terrain-0.json': frameManifest('terrainonly'),
    },
    webp: {
      '/atlas/showcase-0.webp': 'u:showcase',
      '/atlas/bog-showcase-0.webp': 'u:bog',
      '/atlas/camps-showcase-200.webp': 'u:camps',
      '/atlas/terrain-0.webp': 'u:terrain',
    },
  };

  it('lists showcase first, then every *-showcase category in sorted order', () => {
    expect(categorySearchOrder('showcase', index)).toEqual([
      'showcase',
      'bog-showcase',
      'camps-showcase',
      'frozen-showcase',
      'wasted-showcase',
    ]);
  });

  it('finds frames in the group categories, but never in unrelated ones', () => {
    expect(findFrameIn(index, 'showcase', 'plain')?.webpUrl).toBe('u:showcase');
    expect(findFrameIn(index, 'showcase', 'bogonly')?.webpUrl).toBe('u:bog');
    expect(findFrameIn(index, 'showcase', 'campsonly')?.webpUrl).toBe('u:camps');
    expect(findFrameIn(index, 'showcase', 'terrainonly')).toBeUndefined();
  });
});

describe('loadAtlasCategory onPartial', () => {
  it('reports a growing snapshot after every page but the last, then the full atlas', async () => {
    const pages = discoveredPages('buildings-level1');
    expect(pages.length).toBeGreaterThan(2);

    const partials: string[][] = [];
    const progress: number[] = [];
    const final = await loadAtlasCategory(
      'buildings-level1',
      (loaded) => progress.push(loaded),
      (partial) => partials.push(Object.keys(partial.textures)),
    );

    expect(partials).toHaveLength(pages.length - 1);
    expect(progress).toEqual(pages.map((_, i) => i + 1));
    // Monotonic: each snapshot is a strict superset of the previous one and a subset of the final.
    for (let i = 1; i < partials.length; i++) {
      expect(partials[i].length).toBeGreaterThan(partials[i - 1].length);
      expect(partials[i - 1].every((n) => partials[i].includes(n))).toBe(true);
    }
    const finalNames = Object.keys(final.textures);
    expect(finalNames.length).toBeGreaterThan(partials.at(-1)!.length);
    // Pages arrive in ascending page order: the first snapshot holds the first page's frames (plus resolved aliases), not the last page's.
    const framesOfPage = (i: number) => Object.keys(MANIFESTS[pages[i].path].frames);
    expect(framesOfPage(0).every((n) => partials[0].includes(n))).toBe(true);
    expect(framesOfPage(pages.length - 1).some((n) => partials[0].includes(n))).toBe(false);
    expect(framesOfPage(pages.length - 1).every((n) => finalNames.includes(n))).toBe(true);
  });

  it('does not replay onPartial for an already-cached category', async () => {
    await loadAtlasCategory('buildings-level1');
    const onPartial = vi.fn();
    await loadAtlasCategory('buildings-level1', undefined, onPartial);
    expect(onPartial).not.toHaveBeenCalled();
  });
});

describe('preloadAtlasManifests', () => {
  let removed: Record<string, AtlasManifest> = {};
  const all = ['terrain', 'buildings-level1', 'buildings-static', 'buildings-anim', 'wasted-terrain', 'frozen-terrain', 'showcase'];
  beforeEach(() => {
    removed = {};
    for (const c of all) Object.assign(removed, unregisterAtlasManifestsForTests(c));
  });
  afterEach(() => {
    registerAtlasManifestsForTests(removed);
    vi.unstubAllGlobals();
  });

  it('preloadDocsAtlasManifests resolves before the animation manifests are in, then loads them too', async () => {
    const byUrl = new Map<string, AtlasManifest>();
    const categoryOfUrl = new Map<string, string>();
    for (const c of all) {
      for (const p of discoveredPages(c)) {
        byUrl.set(p.jsonUrl, removed[p.path.split('/').pop()!]);
        categoryOfUrl.set(p.jsonUrl, c);
      }
    }
    let releaseAnim!: () => void;
    const animGate = new Promise<void>((resolve) => (releaseAnim = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (categoryOfUrl.get(url) === 'buildings-anim') await animGate;
        return { ok: true, json: async () => byUrl.get(url) };
      }),
    );

    await preloadDocsAtlasManifests();
    expect(findAtlasFrame('showcase', Object.keys(removed[discoveredPages('showcase')[0]!.path.split('/').pop()!]!.frames)[0]!)).toBeDefined();
    const animFrame = Object.keys(removed[discoveredPages('buildings-anim')[0]!.path.split('/').pop()!]!.frames)[0]!;
    expect(findAtlasFrame('buildings-anim', animFrame)).toBeUndefined();

    releaseAnim();
    await vi.waitFor(() => expect(findAtlasFrame('buildings-anim', animFrame)).toBeDefined());
  });

  it('fetches terrain, level1, static, showcase, anim, then packs — one category at a time', async () => {
    const byUrl = new Map<string, AtlasManifest>();
    const categoryOfUrl = new Map<string, string>();
    for (const c of all) {
      for (const p of discoveredPages(c)) {
        byUrl.set(p.jsonUrl, removed[p.path.split('/').pop()!]);
        categoryOfUrl.set(p.jsonUrl, c);
      }
    }
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const c = categoryOfUrl.get(url)!;
        order.push(c);
        await flush();
        return { ok: true, json: async () => byUrl.get(url) };
      }),
    );

    await preloadAtlasManifests([...all].reverse());
    // Collapse consecutive duplicates: a category's pages are fetched together, never interleaved with the next.
    const collapsed = order.filter((c, i) => c !== order[i - 1]);
    expect(collapsed).toEqual([
      'terrain',
      'buildings-level1',
      'buildings-static',
      'showcase',
      'buildings-anim',
      'frozen-terrain',
      'wasted-terrain',
    ]);
  });

  it('still loads the remaining categories when one fails, then rethrows', async () => {
    const byUrl = new Map<string, AtlasManifest>();
    for (const c of all) for (const p of discoveredPages(c)) byUrl.set(p.jsonUrl, removed[p.path.split('/').pop()!]);
    const failing = discoveredPages('terrain').map((p) => p.jsonUrl);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        failing.includes(url) ? { ok: false, status: 500 } : { ok: true, json: async () => byUrl.get(url) },
      ),
    );
    await expect(preloadAtlasManifests(['terrain', 'buildings-level1'])).rejects.toThrow('500');
    expect(findAtlasFrame('buildings-level1', Object.keys(removed['buildings-level1-0.json'].frames)[0])).toBeDefined();
  });
});

describe('prefetchAtlasPages', () => {
  const fetchedUrls: string[] = [];
  const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) => {
    fetchedUrls.push(url);
    return { ok: true, blob: async () => new Blob() };
  });
  beforeEach(() => {
    fetchedUrls.length = 0;
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches every page of a category at low priority in ascending numeric page order, and never twice', async () => {
    await prefetchAtlasPages(['buildings-anim']);
    const pages = discoveredPages('buildings-anim');
    expect(fetchedUrls).toHaveLength(pages.length);
    expect(fetchedUrls.map(pageNumber)).toEqual(pages.map((p) => p.page));
    expect(fetchedUrls.map(pageNumber)).toEqual([...fetchedUrls.map(pageNumber)].sort((a, b) => a - b));
    expect(fetchSpy.mock.calls.every(([, init]) => (init as { priority?: string }).priority === 'low')).toBe(true);

    await prefetchAtlasPages(['buildings-anim']);
    expect(fetchedUrls).toHaveLength(pages.length);
  });

  it('skips a category already loaded via loadAtlasCategory', async () => {
    await loadAtlasCategory('terrain');
    await prefetchAtlasPages(['terrain', 'frozen-terrain']);
    expect(fetchedUrls.length).toBeGreaterThan(0);
    expect(fetchedUrls.every((u) => /frozen-terrain-\d+\.webp/.test(u))).toBe(true);
  });

  it('does nothing when the connection asks for data saving', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    await prefetchAtlasPages(['wasted-terrain']);
    expect(fetchedUrls).toEqual([]);
  });

  it('stops when the signal is aborted and survives a failing fetch', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const controller = new AbortController();
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    fetchSpy.mockImplementationOnce(async (url: string) => {
      fetchedUrls.push(url);
      controller.abort();
      return { ok: true, blob: async () => new Blob() } as Response;
    });
    await prefetchAtlasPages(['wasted-buildings-anim'], controller.signal);
    expect(debug).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    debug.mockRestore();
  });
});

describe('startBackgroundAtlasLoad', () => {
  it('waits for buildings-static, then prefetches the not-yet-loaded categories in priority order', async () => {
    const fetchedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        return { ok: true, blob: async () => new Blob() };
      }),
    );
    let done = false;
    const background = startBackgroundAtlasLoad().then(() => {
      done = true;
    });
    expect(startBackgroundAtlasLoad()).toBe(startBackgroundAtlasLoad());
    await flush();
    expect(done).toBe(false);
    expect(fetchedUrls).toEqual([]);

    await loadAtlasCategory('buildings-static');
    await background;

    const category = (u: string) => /\/([a-z0-9-]+)-\d+\.webp/.exec(u)![1];
    expect(fetchedUrls.length).toBeGreaterThan(0);
    // buildings-static/level1/terrain were loaded for real above; everything else was already
    // prefetched by earlier tests or is fetched now — and never a loaded category.
    expect(fetchedUrls.map(category)).not.toContain('buildings-static');
    expect(fetchedUrls.map(category)).not.toContain('buildings-level1');
    const firstShowcase = fetchedUrls.findIndex((u) => category(u).endsWith('showcase'));
    const lastNonShowcase = fetchedUrls.map((u) => category(u).endsWith('showcase')).lastIndexOf(false);
    expect(firstShowcase).toBeGreaterThan(lastNonShowcase);
    vi.unstubAllGlobals();
  });
});
