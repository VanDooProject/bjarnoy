// @vitest-environment jsdom
// The singleton import below touches `window.matchMedia` at
// module load (its reduced-motion query), which
// the default 'node' test environment doesn't provide.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAnimationState } from './animationPreference';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

describe('resolveAnimationState', () => {
  const noEnv = { reducedMotion: false, saveData: false };

  it('off always wins', () => {
    expect(resolveAnimationState('off', { reducedMotion: true, saveData: true }, 'on')).toEqual({
      effective: false,
      reason: 'forced-off',
    });
  });

  it('on overrides reduced-motion and save-data', () => {
    expect(resolveAnimationState('on', { reducedMotion: true, saveData: false }, 'measuring')).toEqual({
      effective: true,
      reason: 'forced-on',
    });
    expect(resolveAnimationState('on', { reducedMotion: false, saveData: true }, 'measuring')).toEqual({
      effective: true,
      reason: 'forced-on',
    });
  });

  it('auto respects reduced-motion over the governor', () => {
    expect(resolveAnimationState('auto', { reducedMotion: true, saveData: false }, 'on')).toEqual({
      effective: false,
      reason: 'reduced-motion',
    });
  });

  it('auto respects save-data over the governor', () => {
    expect(resolveAnimationState('auto', { reducedMotion: false, saveData: true }, 'on')).toEqual({
      effective: false,
      reason: 'save-data',
    });
  });

  it('auto follows the governor once environment checks pass', () => {
    expect(resolveAnimationState('auto', noEnv, 'measuring')).toEqual({ effective: false, reason: 'measuring' });
    expect(resolveAnimationState('auto', noEnv, 'on')).toEqual({ effective: true, reason: 'auto-on' });
    expect(resolveAnimationState('auto', noEnv, 'off-slow')).toEqual({ effective: false, reason: 'auto-off-slow' });
  });
});

describe('animationPreference singleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('defaults to auto when nothing is stored', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
  });

  it('falls back to auto for an unrecognised stored value', async () => {
    const backing = stubLocalStorage();
    backing.set('bjarnoy.animations', 'sideways');
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
  });

  it('persists an explicit setting and reads it back', async () => {
    const backing = stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    animationPreference.setting = 'on';
    expect(animationPreference.setting).toBe('on');
    expect(backing.get('bjarnoy.animations')).toBe('on');
  });

  it('does not throw when localStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {},
    });
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
    expect(() => {
      animationPreference.setting = 'off';
    }).not.toThrow();
    expect(animationPreference.setting).toBe('off');
  });

  it('reports forced-off/forced-on reasons for an explicit setting', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    animationPreference.setting = 'off';
    expect(animationPreference.effective).toBe(false);
    expect(animationPreference.reason).toBe('forced-off');
    animationPreference.setting = 'on';
    expect(animationPreference.effective).toBe(true);
    expect(animationPreference.reason).toBe('forced-on');
  });

  it('starts auto in measuring, off', async () => {
    stubLocalStorage();
    const { animationPreference } = await import('./animationPreference');
    expect(animationPreference.setting).toBe('auto');
    expect(animationPreference.effective).toBe(false);
    expect(animationPreference.reason).toBe('measuring');
  });

  it('maps the governor levels: measuring, on, off-slow with a retry', async () => {
    stubLocalStorage();
    const { animationPreference, animationGovernor, refreshAnimationState } = await import('./animationPreference');
    const open = { up: true, down: true };
    const feed = (fps: number, seconds: number) => {
      for (let i = 0; i < fps * seconds; i++) animationGovernor.sample(1000 / fps, open);
      refreshAnimationState();
    };
    expect(animationPreference.reason).toBe('measuring');
    feed(100, 10);
    expect(animationPreference.reason).toBe('auto-on');
    feed(20, 5);
    expect(animationPreference.reason).toBe('auto-off-slow');
    // One retry: 30 s at 60 fps or more.
    feed(100, 30);
    expect(animationPreference.reason).toBe('auto-on');
    // The second drop latches.
    feed(20, 5);
    feed(128, 120);
    expect(animationPreference.reason).toBe('auto-off-slow');
  });

  it('keepLoaded only for an Auto drop, not for Off, reduced motion or save-data', async () => {
    stubLocalStorage();
    const { animationPreference, animationGovernor, refreshAnimationState } = await import('./animationPreference');
    expect(animationPreference.keepLoaded).toBe(false);
    const open = { up: true, down: true };
    for (let i = 0; i < 1000; i++) animationGovernor.sample(10, open);
    for (let i = 0; i < 250; i++) animationGovernor.sample(50, open);
    refreshAnimationState();
    expect(animationPreference.reason).toBe('auto-off-slow');
    expect(animationPreference.keepLoaded).toBe(true);
    animationPreference.setting = 'off';
    expect(animationPreference.keepLoaded).toBe(false);
  });
});
