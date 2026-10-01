import { describe, expect, it, vi } from 'vitest';
import { awaitAtlasManifests } from './atlasGuard';

describe('awaitAtlasManifests', () => {
  it('waits for the preload before letting navigation through', async () => {
    let finish!: () => void;
    const preload = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    let settled = false;
    const guard = awaitAtlasManifests(preload).then((r) => {
      settled = true;
      return r;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await expect(guard).resolves.toBe(true);
  });

  it('still lets navigation through (with a warning) when the preload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(awaitAtlasManifests(() => Promise.reject(new Error('offline')))).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
