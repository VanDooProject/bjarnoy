import { afterEach, describe, expect, it, vi } from 'vitest';

// atlas.ts's real pages come from `import.meta.glob`-ing the
// VanDooProject/bg_assets_hextile submodule's vendored `atlas/` directory,
// which isn't checked into this repo (see atlas.ts's own module doc
// comment) — so these tests exercise `loadAtlasCategory`/`loadPages`
// against synthetic pages passed in directly, rather than the real vendor
// data, mocking pixi.js's `Assets`/`Spritesheet` instead of touching a
// browser `document` or the network.
const loadMock = vi.fn();
const unloadMock = vi.fn();
const parseMock = vi.fn();

vi.mock('pixi.js', () => ({
  Assets: {
    load: (...args: unknown[]) => loadMock(...args),
    unload: (...args: unknown[]) => unloadMock(...args),
  },
  Spritesheet: vi.fn().mockImplementation(function (
    this: { textures: Record<string, unknown>; parse: () => Promise<void> },
    pageTexture: unknown,
    manifest: { frames: Record<string, unknown> },
  ) {
    this.textures = Object.fromEntries(Object.keys(manifest.frames).map((name) => [name, pageTexture]));
    this.parse = () => parseMock();
  }),
  Texture: {},
}));

function manifestFor(page: string) {
  return {
    frames: {
      [`frame-of-${page}`]: {
        frame: { x: 0, y: 0, w: 1, h: 1 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
        sourceSize: { w: 1, h: 1 },
        bjarnoy: { family: 'testfamily', layer: 'base' as const },
      },
    },
    meta: { image: page, size: { w: 1, h: 1 }, scale: '1' },
  };
}

describe('loadAtlasCategory / loadPages', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests every page of a category in parallel, not one after another', async () => {
    const { loadAtlasCategory } = await import('./atlas');

    // Deferred promises: nothing resolves until we say so, so if the pages
    // were loaded sequentially the second page's Assets.load wouldn't have
    // been called yet at the point we check.
    const resolvers: Record<string, (v: unknown) => void> = {};
    loadMock.mockImplementation((url: string) => {
      return new Promise((resolve) => {
        resolvers[url] = () => resolve(`texture:${url}`);
      });
    });
    parseMock.mockResolvedValue(undefined);

    const pages = [
      { manifest: manifestFor('page-b'), webpUrl: 'page-b.webp' },
      { manifest: manifestFor('page-a'), webpUrl: 'page-a.webp' },
    ];
    const promise = loadAtlasCategory('parallel-test', pages);

    // Give pending microtasks a chance to run without resolving anything.
    await Promise.resolve();
    await Promise.resolve();

    expect(loadMock).toHaveBeenCalledWith('page-b.webp');
    expect(loadMock).toHaveBeenCalledWith('page-a.webp');
    expect(loadMock).toHaveBeenCalledTimes(2);

    resolvers['page-b.webp']?.(undefined);
    resolvers['page-a.webp']?.(undefined);
    const result = await promise;

    // Merged in page order regardless of which one's fetch resolved first —
    // both frames end up present either way, but the merge order itself is
    // asserted in the dedicated "deterministic merge order" test below.
    expect(Object.keys(result.textures).sort()).toEqual(['frame-of-page-a', 'frame-of-page-b']);
  });

  it('merges pages in their given order even when the later page resolves first', async () => {
    const { loadAtlasCategory } = await import('./atlas');

    const resolvers: Record<string, (v: unknown) => void> = {};
    loadMock.mockImplementation((url: string) => {
      return new Promise((resolve) => {
        resolvers[url] = () => resolve(url);
      });
    });
    parseMock.mockResolvedValue(undefined);

    const pages = [
      { manifest: manifestFor('first'), webpUrl: 'first.webp' },
      { manifest: manifestFor('second'), webpUrl: 'second.webp' },
    ];
    const promise = loadAtlasCategory('merge-order-test', pages);

    // Resolve the *second* page well before the first.
    resolvers['second.webp']?.(undefined);
    await Promise.resolve();
    resolvers['first.webp']?.(undefined);

    const result = await promise;
    expect(Object.keys(result.textures)).toEqual(['frame-of-first', 'frame-of-second']);
  });

  it('retries a page once after a failed load and succeeds', async () => {
    const { loadAtlasCategory } = await import('./atlas');

    loadMock.mockRejectedValueOnce(new Error('network blip')).mockResolvedValueOnce('texture:retry.webp');
    unloadMock.mockResolvedValue(undefined);
    parseMock.mockResolvedValue(undefined);

    const pages = [{ manifest: manifestFor('retry'), webpUrl: 'retry.webp' }];
    const result = await loadAtlasCategory('retry-test', pages);

    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(unloadMock).toHaveBeenCalledWith('retry.webp');
    expect(result.textures['frame-of-retry']).toBe('texture:retry.webp');
  });

  it('gives up after a page fails twice in a row', async () => {
    const { loadAtlasCategory } = await import('./atlas');

    loadMock.mockRejectedValue(new Error('still down'));
    unloadMock.mockResolvedValue(undefined);

    const pages = [{ manifest: manifestFor('dead'), webpUrl: 'dead.webp' }];
    await expect(loadAtlasCategory('double-fail-test', pages)).rejects.toThrow('still down');
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('evicts a rejected category from the cache so a later call can retry', async () => {
    const { loadAtlasCategory } = await import('./atlas');

    const failingPages = [{ manifest: manifestFor('x'), webpUrl: 'x.webp' }];
    loadMock.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('still down'));

    await expect(loadAtlasCategory('eviction-test', failingPages)).rejects.toThrow();

    // A second call for the same category, now with pages that succeed,
    // must actually run the load again rather than replaying the same
    // cached rejection.
    loadMock.mockResolvedValue('texture:x.webp');
    parseMock.mockResolvedValue(undefined);
    const succeedingPages = [{ manifest: manifestFor('x'), webpUrl: 'x.webp' }];
    const result = await loadAtlasCategory('eviction-test', succeedingPages);

    expect(result.textures['frame-of-x']).toBe('texture:x.webp');
  });
});
