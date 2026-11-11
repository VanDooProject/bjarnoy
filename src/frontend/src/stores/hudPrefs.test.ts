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

  it('shows building info by default, and remembers turning it off', () => {
    const backing = stubLocalStorage();
    const prefs = useHudPrefsStore();
    expect(prefs.buildingInfo).toBe(true);
    prefs.setBuildingInfo(false);
    expect(backing.get('bjarnoy.hudBuildingInfo')).toBe('off');
    setActivePinia(createPinia());
    expect(useHudPrefsStore().buildingInfo).toBe(false);
  });

  it('keeps building info on in memory when storage is unavailable', () => {
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
    expect(prefs.buildingInfo).toBe(true);
    expect(() => prefs.setBuildingInfo(false)).not.toThrow();
    expect(prefs.buildingInfo).toBe(false);
  });

  it('toggleBuildingInfo flips the preference and persists it', () => {
    const backing = stubLocalStorage();
    const prefs = useHudPrefsStore();
    prefs.toggleBuildingInfo();
    expect(prefs.buildingInfo).toBe(false);
    expect(backing.get('bjarnoy.hudBuildingInfo')).toBe('off');
    prefs.toggleBuildingInfo();
    expect(prefs.buildingInfo).toBe(true);
  });

  describe('dockable panels', () => {
    it('defaults to every panel open in today\'s corner', () => {
      stubLocalStorage();
      expect(useHudPrefsStore().panels).toEqual({
        construction: { open: true, corner: 'top-left' },
        garrison: { open: true, corner: 'top-right' },
        armies: { open: true, corner: 'bottom-right' },
        quests: { open: true, corner: 'bottom-left' },
      });
    });

    it('togglePanel and setPanelCorner update state and persist under one key, and a new store reads them back', () => {
      const backing = stubLocalStorage();
      const prefs = useHudPrefsStore();
      prefs.togglePanel('quests');
      prefs.setPanelCorner('armies', 'top-left');
      expect(prefs.panels.quests.open).toBe(false);
      expect(prefs.panels.armies.corner).toBe('top-left');
      expect(JSON.parse(backing.get('bjarnoy.hudPanels')!)).toMatchObject({
        quests: { open: false, corner: 'bottom-left' },
        armies: { open: true, corner: 'top-left' },
      });
      setActivePinia(createPinia());
      const again = useHudPrefsStore();
      expect(again.panels.quests.open).toBe(false);
      expect(again.panels.armies.corner).toBe('top-left');
      again.togglePanel('quests');
      expect(again.panels.quests.open).toBe(true);
    });

    it('validates each panel on its own and falls back per panel to its default', () => {
      const backing = stubLocalStorage();
      backing.set(
        'bjarnoy.hudPanels',
        JSON.stringify({
          construction: { open: false, corner: 'middle' },
          garrison: { open: 'yes', corner: 'bottom-left' },
          armies: 7,
        }),
      );
      expect(useHudPrefsStore().panels).toEqual({
        construction: { open: false, corner: 'top-left' },
        garrison: { open: true, corner: 'bottom-left' },
        armies: { open: true, corner: 'bottom-right' },
        quests: { open: true, corner: 'bottom-left' },
      });
    });

    it('falls back to the defaults for corrupt JSON and survives unavailable storage', () => {
      const backing = stubLocalStorage();
      backing.set('bjarnoy.hudPanels', '{nope');
      expect(useHudPrefsStore().panels.garrison).toEqual({ open: true, corner: 'top-right' });
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
        removeItem: () => {},
      });
      setActivePinia(createPinia());
      const prefs = useHudPrefsStore();
      expect(() => prefs.togglePanel('garrison')).not.toThrow();
      expect(prefs.panels.garrison.open).toBe(false);
    });
  });
});
