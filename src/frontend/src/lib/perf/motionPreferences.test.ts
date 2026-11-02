// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
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

/** Fresh module graph per test so the singletons re-read storage. */
async function load(initial: Record<string, string> = {}, reduced = false) {
  vi.resetModules();
  const store = stubLocalStorage(initial);
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  const motion = await import('./motionPreferences');
  const anim = await import('./animationPreference');
  return { store, ...motion, animationPreference: anim.animationPreference };
}

describe('resolveMotion', () => {
  it('explicit choices win over the device setting', async () => {
    const { resolveMotion } = await load();
    expect(resolveMotion('on', true)).toBe(true);
    expect(resolveMotion('off', false)).toBe(false);
  });
  it('auto follows the device', async () => {
    const { resolveMotion } = await load();
    expect(resolveMotion('auto', true)).toBe(false);
    expect(resolveMotion('auto', false)).toBe(true);
  });
});

describe('motionPreferences', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('defaults to auto and resolves from the OS setting', async () => {
    const { motionPreferences } = await load({}, true);
    expect(motionPreferences.water).toBe('auto');
    expect(motionPreferences.waterEnabled).toBe(false);
    expect(motionPreferences.fogEnabled).toBe(false);
    expect(motionPreferences.hudEnabled).toBe(false);
  });

  it('animates under auto when the device does not ask for reduced motion', async () => {
    const { motionPreferences } = await load({}, false);
    expect(motionPreferences.waterEnabled).toBe(true);
    expect(motionPreferences.hudEnabled).toBe(true);
  });

  it('persists each setting and reads it back', async () => {
    const first = await load({}, true);
    first.motionPreferences.water = 'on';
    first.motionPreferences.fog = 'off';
    first.motionPreferences.hud = 'on';
    expect(first.store.get('bjarnoy.motion.water')).toBe('on');
    expect(first.store.get('bjarnoy.motion.fog')).toBe('off');
    expect(first.store.get('bjarnoy.motion.hud')).toBe('on');
    const second = await load(Object.fromEntries(first.store), true);
    expect(second.motionPreferences.waterEnabled).toBe(true);
    expect(second.motionPreferences.fogEnabled).toBe(false);
    expect(second.motionPreferences.hudEnabled).toBe(true);
  });

  it('ignores garbage in storage', async () => {
    const { motionPreferences } = await load({ 'bjarnoy.motion.water': 'banana' });
    expect(motionPreferences.water).toBe('auto');
  });

  it('turnAllOn sets all four settings and records the answer', async () => {
    const { motionPreferences, animationPreference, store } = await load({}, true);
    motionPreferences.turnAllOn();
    expect(animationPreference.setting).toBe('on');
    expect(motionPreferences.water).toBe('on');
    expect(motionPreferences.fog).toBe('on');
    expect(motionPreferences.hud).toBe('on');
    expect(store.get('bjarnoy.animations')).toBe('on');
    expect(store.get('bjarnoy.motionPrompt')).toBe('on');
    expect(motionPreferences.promptVisible).toBe(false);
  });

  describe('promptVisible', () => {
    it('shows when reduced, unanswered and all auto', async () => {
      const { motionPreferences } = await load({}, true);
      expect(motionPreferences.promptVisible).toBe(true);
    });
    it('hidden when the device does not ask for reduced motion', async () => {
      const { motionPreferences } = await load({}, false);
      expect(motionPreferences.promptVisible).toBe(false);
    });
    it('dismissPrompt hides it for good and leaves settings on auto', async () => {
      const first = await load({}, true);
      first.motionPreferences.dismissPrompt();
      expect(first.motionPreferences.promptVisible).toBe(false);
      expect(first.motionPreferences.hud).toBe('auto');
      expect(first.store.get('bjarnoy.motionPrompt')).toBe('dismissed');
      const second = await load(Object.fromEntries(first.store), true);
      expect(second.motionPreferences.promptVisible).toBe(false);
    });
    it.each([
      ['bjarnoy.animations', 'off'],
      ['bjarnoy.motion.water', 'off'],
      ['bjarnoy.motion.fog', 'on'],
      ['bjarnoy.motion.hud', 'on'],
    ])('hidden once %s was set to %s', async (key, value) => {
      const { motionPreferences } = await load({ [key]: value }, true);
      expect(motionPreferences.promptVisible).toBe(false);
    });
  });
});
