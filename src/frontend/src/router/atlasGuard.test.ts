import { describe, expect, it, vi } from 'vitest';
import { startAtlasManifestLoad } from './atlasGuard';

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
