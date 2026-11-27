// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolutionLevels } from './resolutionPreference';

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

async function load(dpr: number, stored?: string) {
  vi.resetModules();
  const store = stubLocalStorage();
  if (stored !== undefined) store.set('bjarnoy.resolution', stored);
  vi.stubGlobal('devicePixelRatio', dpr);
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  const mod = await import('./resolutionPreference');
  return { ...mod, store };
}

describe('resolutionLevels', () => {
  it.each([
    [0.5, [0.5]],
    [1, [1]],
    [1.25, [1, 1.25]],
    [1.5, [1, 1.5]],
    [1.75, [1, 1.5, 1.75]],
    [2, [1, 1.5, 2]],
    [3, [1, 1.5, 2]],
    [0, [1]],
  ])('dpr %s gives %j', (dpr, expected) => {
    expect(resolutionLevels(dpr)).toEqual(expected);
  });
});

describe('resolutionPreference singleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to auto at the lowest level', async () => {
    const { resolutionPreference } = await load(2);
    expect(resolutionPreference.setting).toBe('auto');
    expect(resolutionPreference.levels).toEqual([1, 1.5, 2]);
    expect(resolutionPreference.effective).toBe(1);
    expect(resolutionPreference.reason).toBe('measuring');
  });

  it('falls back to auto for an unknown stored value', async () => {
    const { resolutionPreference } = await load(2, 'sideways');
    expect(resolutionPreference.setting).toBe('auto');
  });

  it('persists an explicit setting and reads it back', async () => {
    const { resolutionPreference, store } = await load(2);
    resolutionPreference.setting = '1.5';
    expect(store.get('bjarnoy.resolution')).toBe('1.5');
    expect(resolutionPreference.effective).toBe(1.5);
    expect(resolutionPreference.reason).toBe('forced');
  });

  it('restores a stored explicit setting', async () => {
    const { resolutionPreference } = await load(2, '1.5');
    expect(resolutionPreference.setting).toBe('1.5');
  });

  it('clamps a stored value above the screen to its highest level', async () => {
    const { resolutionPreference } = await load(1, '2');
    expect(resolutionPreference.effective).toBe(1);
    const second = await load(1.75, '2');
    expect(second.resolutionPreference.effective).toBe(1.75);
  });

  it('reports device-max when the screen offers one level', async () => {
    const { resolutionPreference } = await load(1);
    expect(resolutionPreference.reason).toBe('device-max');
    expect(resolutionPreference.effective).toBe(1);
  });

  it('does not throw when localStorage is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const { resolutionPreference } = await import('./resolutionPreference');
    expect(resolutionPreference.setting).toBe('auto');
    expect(() => {
      resolutionPreference.setting = '2';
    }).not.toThrow();
    expect(resolutionPreference.effective).toBe(2);
  });

  it('follows the governor in auto and reports its reasons', async () => {
    const { resolutionPreference, resolutionGovernor, refreshResolutionState } = await load(2);
    const open = { up: true, down: true };
    const feed = (fps: number, seconds: number) => {
      for (let i = 0; i < fps * seconds; i++) resolutionGovernor.sample(1000 / fps, open);
      refreshResolutionState();
    };
    feed(128, 10);
    expect(resolutionPreference.effective).toBe(1.5);
    expect(resolutionPreference.reason).toBe('measuring');
    feed(128, 10);
    expect(resolutionPreference.effective).toBe(2);
    expect(resolutionPreference.reason).toBe('auto-max');
    feed(20, 5);
    expect(resolutionPreference.effective).toBe(1.5);
    expect(resolutionPreference.reason).toBe('auto-down');
  });
});
