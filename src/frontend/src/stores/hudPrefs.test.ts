import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHudPrefsStore } from './hudPrefs';

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

describe('hudPrefs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults to top when nothing is stored', () => {
    stubLocalStorage();
    const prefs = useHudPrefsStore();
    expect(prefs.barPosition).toBe('top');
  });

  it('falls back to top for an unrecognised stored value', () => {
    const backing = stubLocalStorage();
    backing.set('bjarnoy.hudBarPosition', 'sideways');
    const prefs = useHudPrefsStore();
    expect(prefs.barPosition).toBe('top');
  });

  it('reads a previously persisted position', () => {
    const backing = stubLocalStorage();
    backing.set('bjarnoy.hudBarPosition', 'bottom');
    const prefs = useHudPrefsStore();
    expect(prefs.barPosition).toBe('bottom');
  });

  it('setBarPosition updates state and persists', () => {
    const backing = stubLocalStorage();
    const prefs = useHudPrefsStore();
    prefs.setBarPosition('bottom');
    expect(prefs.barPosition).toBe('bottom');
    expect(backing.get('bjarnoy.hudBarPosition')).toBe('bottom');
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {},
    });
    const prefs = useHudPrefsStore();
    expect(prefs.barPosition).toBe('top');
    expect(() => prefs.setBarPosition('bottom')).not.toThrow();
    expect(prefs.barPosition).toBe('bottom');
  });
});
