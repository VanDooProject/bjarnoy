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
    const def = (side: 'left' | 'right', align: 'top' | 'bottom') => ({ open: true, collapsed: false, side, column: 0, align, order: 0 });

    it('defaults to every panel open and expanded in the first spots', () => {
      stubLocalStorage();
      expect(useHudPrefsStore().panels).toEqual({
        construction: def('left', 'top'),
        garrison: def('right', 'top'),
        armies: def('right', 'bottom'),
        quests: def('left', 'bottom'),
      });
    });

    it('togglePanel, toggleCollapsed and movePanel update state and persist under one key, and a new store reads them back', () => {
      const backing = stubLocalStorage();
      const prefs = useHudPrefsStore();
      prefs.togglePanel('quests');
      prefs.toggleCollapsed('garrison');
      prefs.movePanel('armies', { side: 'left', column: 1, align: 'top', before: null });
      expect(prefs.panels.quests.open).toBe(false);
      expect(prefs.panels.garrison.collapsed).toBe(true);
      expect(prefs.panels.armies).toMatchObject({ side: 'left', column: 1, align: 'top' });
      expect(JSON.parse(backing.get('bjarnoy.hudPanels')!)).toMatchObject({
        quests: { open: false },
        garrison: { collapsed: true },
        armies: { side: 'left', column: 1, align: 'top', order: 0 },
      });
      setActivePinia(createPinia());
      const again = useHudPrefsStore();
      expect(again.panels.quests.open).toBe(false);
      expect(again.panels.garrison.collapsed).toBe(true);
      expect(again.panels.armies).toMatchObject({ side: 'left', column: 1 });
      again.toggleCollapsed('garrison');
      expect(again.panels.garrison.collapsed).toBe(false);
    });

    it('validates each panel on its own and falls back per panel to its default', () => {
      const backing = stubLocalStorage();
      backing.set(
        'bjarnoy.hudPanels',
        JSON.stringify({
          construction: { ...def('left', 'top'), open: false, column: 2 },
          garrison: { ...def('right', 'top'), side: 'middle' },
          armies: 7,
        }),
      );
      expect(useHudPrefsStore().panels).toEqual({
        construction: { ...def('left', 'top'), open: false, column: 2 },
        garrison: def('right', 'top'),
        armies: def('right', 'bottom'),
        quests: def('left', 'bottom'),
      });
    });

    it('drops entries in the old corner format back to their defaults', () => {
      const backing = stubLocalStorage();
      backing.set('bjarnoy.hudPanels', JSON.stringify({ quests: { open: false, corner: 'top-right' }, garrison: { open: true, corner: 'bottom-left' } }));
      const prefs = useHudPrefsStore();
      expect(prefs.panels.quests).toEqual(def('left', 'bottom'));
      expect(prefs.panels.garrison).toEqual(def('right', 'top'));
    });

    it('falls back to the defaults for corrupt JSON and survives unavailable storage', () => {
      const backing = stubLocalStorage();
      backing.set('bjarnoy.hudPanels', '{nope');
      expect(useHudPrefsStore().panels.garrison).toEqual(def('right', 'top'));
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
