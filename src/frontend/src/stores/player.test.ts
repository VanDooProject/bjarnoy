import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// "Join another world": `settlementsByWorld` (worldId -> settlementId) and
// `enterWorld` are what let a player switch between realms in different
// worlds without losing track of ones they've already founded. Mirrors
// stores/world.test.ts's resetModules-per-test pattern since DEMO_MODE is
// baked in at import time, and its localStorage stub — the test environment
// is `node` (see vitest.config.ts), not `jsdom` — except this one actually
// backs reads with what was written, since these tests assert on what
// persists across a reload.
function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    _store: store,
  };
}

async function loadStoreModule(demoMode: boolean) {
  vi.resetModules();
  vi.doMock('../config', () => ({ DEMO_MODE: demoMode }));
  const { usePlayerStore } = await import('./player');
  setActivePinia(createPinia());
  return usePlayerStore();
}

describe('usePlayerStore settlementsByWorld / enterWorld', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
  });

  it('foundSettlement with a worldId records the realm under settlementsByWorld', async () => {
    const store = await loadStoreModule(false);

    store.foundSettlement('settlement-a', 'world-a');

    expect(store.hasFoundedSettlement).toBe(true);
    expect(store.settlementId).toBe('settlement-a');
    expect(store.settlementsByWorld).toEqual({ 'world-a': 'settlement-a' });
    expect(JSON.parse(localStorage.getItem('bjarnoy.settlementsByWorld')!)).toEqual({
      'world-a': 'settlement-a',
    });
  });

  it('foundSettlement without a worldId keeps working exactly as before (every pre-existing call site)', async () => {
    const store = await loadStoreModule(false);

    store.foundSettlement('settlement-a');

    expect(store.hasFoundedSettlement).toBe(true);
    expect(store.settlementId).toBe('settlement-a');
    expect(store.settlementsByWorld).toEqual({});
    expect(localStorage.getItem('bjarnoy.settlementsByWorld')).toBeNull();
  });

  it('enterWorld for a world with an existing settlement sets founded/onboarding true and does not clobber a different world\'s entry', async () => {
    const store = await loadStoreModule(false);
    // Already has a realm in world-a from a previous session.
    store.foundSettlement('settlement-a', 'world-a');

    store.enterWorld('world-b', 'settlement-b');

    expect(store.settlementId).toBe('settlement-b');
    expect(store.hasFoundedSettlement).toBe(true);
    expect(store.onboardingComplete).toBe(true);
    // world-a's own entry survives switching into world-b.
    expect(store.settlementsByWorld).toEqual({ 'world-a': 'settlement-a', 'world-b': 'settlement-b' });
    expect(localStorage.getItem('bjarnoy.settlementId')).toBe('settlement-b');
    expect(localStorage.getItem('bjarnoy.onboardingComplete')).toBe('1');
  });

  it('enterWorld for a brand-new world (settlementId: null) sets founded/onboarding false', async () => {
    const store = await loadStoreModule(false);
    // Coming from a world where this player already had a realm.
    store.foundSettlement('settlement-a', 'world-a');
    store.completeOnboarding();

    store.enterWorld('world-c', null);

    expect(store.settlementId).toBeNull();
    expect(store.hasFoundedSettlement).toBe(false);
    expect(store.onboardingComplete).toBe(false);
    // No entry is recorded for world-c — there's no settlement to record yet.
    expect(store.settlementsByWorld).toEqual({ 'world-a': 'settlement-a' });
    expect(localStorage.getItem('bjarnoy.settlementId')).toBeNull();
    expect(localStorage.getItem('bjarnoy.onboardingComplete')).toBe('0');
  });

  it('does not touch profileNudgeDismissed', async () => {
    const store = await loadStoreModule(false);
    store.dismissProfileNudge();

    store.enterWorld('world-c', null);

    expect(store.profileNudgeDismissed).toBe(true);
  });

  it('is a no-op on localStorage in demo mode', async () => {
    const store = await loadStoreModule(true);

    store.foundSettlement('settlement-a', 'world-a');
    store.enterWorld('world-b', 'settlement-b');

    expect(localStorage.getItem('bjarnoy.settlementsByWorld')).toBeNull();
    expect(localStorage.getItem('bjarnoy.settlementId')).toBeNull();
    expect(localStorage.getItem('bjarnoy.onboardingComplete')).toBeNull();
  });
});

// Player logout/login gate: `forgetLocalIdentity` is the store half of
// logging out (composables/useLogout.ts drives the rest — clearing the auth
// session and reloading the page). `forgetLastAccount` is "start a new
// realm instead" on ReturningLoginPanel.vue declining the resulting gate.
describe('usePlayerStore forgetLocalIdentity / forgetLastAccount / lastAccount', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
  });

  it('forgetLocalIdentity removes exactly the identity keys, keeps worldId/locale, and writes lastAccount', async () => {
    const store = await loadStoreModule(false);
    store.foundSettlement('settlement-a', 'world-a');
    store.setNickname('Ragnar');
    store.completeOnboarding();
    store.dismissProfileNudge();
    localStorage.setItem('bjarnoy.worldId', 'world-a');
    localStorage.setItem('bjarnoy.locale', 'de');

    store.forgetLocalIdentity('ragnar42');

    for (const key of [
      'bjarnoy.playerId',
      'bjarnoy.settlementId',
      'bjarnoy.settlementsByWorld',
      'bjarnoy.onboardingComplete',
      'bjarnoy.profileNudgeDismissed',
      'bjarnoy.nickname',
    ]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    // Device/session context, not identity — kept.
    expect(localStorage.getItem('bjarnoy.worldId')).toBe('world-a');
    expect(localStorage.getItem('bjarnoy.locale')).toBe('de');

    expect(localStorage.getItem('bjarnoy.lastAccount')).toBe('ragnar42');
    expect(store.lastAccount).toBe('ragnar42');
  });

  it('forgetLastAccount clears lastAccount', async () => {
    const store = await loadStoreModule(false);
    store.forgetLocalIdentity('ragnar42');

    store.forgetLastAccount();

    expect(store.lastAccount).toBeNull();
    expect(localStorage.getItem('bjarnoy.lastAccount')).toBeNull();
  });

  it('a new store instance picks up lastAccount from localStorage', async () => {
    const first = await loadStoreModule(false);
    first.forgetLocalIdentity('ragnar42');

    // Simulates the full page reload useLogout.ts does: a fresh module
    // load, fresh Pinia store, same underlying localStorage.
    const second = await loadStoreModule(false);

    expect(second.lastAccount).toBe('ragnar42');
  });
});
