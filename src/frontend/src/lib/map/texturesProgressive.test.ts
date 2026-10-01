import { describe, expect, it, vi } from 'vitest';

// Same Pixi stand-in as atlasLoading.test.ts: opaque textures per frame name.
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
  return { Assets: { load: vi.fn(async (url: string) => ({ url })), unload: vi.fn(async () => {}) }, Spritesheet, Texture: { EMPTY: {} } };
});

import { loadAnimAtlases, loadBuildingAtlases, mergeTileTextures, type TileTextures } from './textures';

function count(t: TileTextures): { top: number; anim: number } {
  let top = 0;
  for (const byOrientation of Object.values(t.top)) for (const arr of Object.values(byOrientation ?? {})) top += (arr as unknown[]).filter(Boolean).length;
  let anim = 0;
  for (const byOrientation of Object.values(t.animTop)) for (const arr of Object.values(byOrientation ?? {})) anim += (arr as unknown[]).filter(Boolean).length;
  return { top, anim };
}

describe('progressive building art', () => {
  it('loadBuildingAtlases hands out growing TileTextures before the final one resolves', async () => {
    const partials: TileTextures[] = [];
    const final = await loadBuildingAtlases(undefined, (t) => partials.push(t));
    expect(partials.length).toBeGreaterThan(0);
    const counts = partials.map((p) => count(p).top);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts.every((c, i) => i === 0 || c >= counts[i - 1])).toBe(true);
    expect(count(final).top).toBeGreaterThanOrEqual(counts.at(-1)!);
    expect(count(final).top).toBeGreaterThan(counts[0]);
    // Merging a partial into an empty-ish base and then the final loses nothing.
    expect(count(mergeTileTextures(partials.at(-1)!, final)).top).toBe(count(final).top);
  });

  it('loadAnimAtlases only ever hands out complete clips, growing page by page', async () => {
    const partials: TileTextures[] = [];
    const final = await loadAnimAtlases((t) => partials.push(t));
    await new Promise((r) => setTimeout(r, 0)); // partial callbacks are detached microtasks
    expect(partials.length).toBeGreaterThan(0);
    const counts = partials.map((p) => count(p).anim);
    expect(counts.every((c, i) => i === 0 || c >= counts[i - 1])).toBe(true);
    expect(count(final).anim).toBeGreaterThanOrEqual(counts.at(-1)!);
    expect(count(final).anim).toBeGreaterThan(0);
  });
});
