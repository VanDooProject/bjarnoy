import { describe, expect, it, vi } from 'vitest';
import { awaitShowcaseManifests, startAtlasManifestLoad } from './atlasGuard';

describe('startAtlasManifestLoad', () => {
  it('starts the preload and lets navigation through without waiting for it', () => {
    const preload = vi.fn(() => new Promise<void>(() => {}));
    expect(startAtlasManifestLoad(preload)).toBe(true);
    expect(preload).toHaveBeenCalledOnce();
  });

  it('warns instead of throwing when the preload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(startAtlasManifestLoad(() => Promise.reject(new Error('offline')))).toBe(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});

describe('awaitShowcaseManifests', () => {
  it('waits for the showcase manifests, then starts the rest without waiting for it', async () => {
    let finish!: () => void;
    const preloadShowcase = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const startRest = vi.fn(() => true as const);
    let settled = false;
    const guard = awaitShowcaseManifests(preloadShowcase, startRest).then((r) => {
      settled = true;
      return r;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(startRest).not.toHaveBeenCalled();
    finish();
    await expect(guard).resolves.toBe(true);
    expect(startRest).toHaveBeenCalledOnce();
  });

  it('still lets navigation through (with a warning) when the showcase manifests fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(awaitShowcaseManifests(() => Promise.reject(new Error('offline')), () => true)).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
