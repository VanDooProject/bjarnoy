import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

// Issue #40 phase 4: `refreshArmies` now also pulls the host's guest-army
// view (`GET /settlements/{id}/guests`) in the same tick as the owner's own
// `armies` list — see world.ts's own comment on why that's one poll rather
// than a third independent timer. Mirrors stores/unitCatalogue.test.ts's
// resetModules-per-test pattern since DEMO_MODE is baked in at import time.

const getSettlementArmies = vi.fn();
const getArmy = vi.fn();
const getSettlementGuests = vi.fn();
const recallArmy = vi.fn();

// The test environment is `node` (see vitest.config.ts), not `jsdom` — world.ts
// reads `localStorage.getItem('bjarnoy.worldId')` at module-level state-init
// time, so it needs a stand-in here the same way a browser would provide one.
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

async function loadStoreModule(demoMode: boolean) {
  vi.resetModules();
  vi.doMock('../config', () => ({ DEMO_MODE: demoMode }));
  vi.doMock('../api/client', () => ({
    api: {
      getSettlementArmies: (...args: unknown[]) => getSettlementArmies(...args),
      getArmy: (...args: unknown[]) => getArmy(...args),
      getSettlementGuests: (...args: unknown[]) => getSettlementGuests(...args),
      recallArmy: (...args: unknown[]) => recallArmy(...args),
    },
    ApiError: class ApiError extends Error {},
  }));
  const { useWorldStore } = await import('./world');
  setActivePinia(createPinia());
  const store = useWorldStore();
  return store;
}

describe('useWorldStore refreshArmies (guest armies)', () => {
  it('fetches guest armies alongside the owner-side army list', async () => {
    getSettlementArmies.mockReset().mockResolvedValue([]);
    getArmy.mockReset();
    getSettlementGuests.mockReset().mockResolvedValue([
      {
        armyId: 'guest-army-1',
        ownerSettlementId: 'owner-settlement-1',
        totalUpkeepPerHour: 4,
        stacks: [{ unit: 'spearman', count: 10 }],
      },
    ]);

    const store = await loadStoreModule(false);
    store.selectedSettlementId = 'host-settlement-1';

    await store.refreshArmies();

    expect(getSettlementGuests).toHaveBeenCalledWith('host-settlement-1');
    expect(store.guestArmies).toHaveLength(1);
    expect(store.guestArmies[0]).toEqual({
      armyId: 'guest-army-1',
      ownerSettlementId: 'owner-settlement-1',
      totalUpkeepPerHour: 4,
      stacks: [{ unit: 'spearman', count: 10 }],
    });
    expect(store.guestArmiesFetchedAt).toBeGreaterThan(0);
  });

  it('does not call the guests endpoint in demo mode', async () => {
    getSettlementArmies.mockReset();
    getArmy.mockReset();
    getSettlementGuests.mockReset();

    const store = await loadStoreModule(true);
    store.selectedSettlementId = 'host-settlement-1';

    await store.refreshArmies();

    expect(getSettlementGuests).not.toHaveBeenCalled();
    expect(store.guestArmies).toEqual([]);
  });

  it('does not call the guests endpoint when no settlement is selected yet', async () => {
    getSettlementArmies.mockReset();
    getArmy.mockReset();
    getSettlementGuests.mockReset();

    const store = await loadStoreModule(false);

    await store.refreshArmies();

    expect(getSettlementGuests).not.toHaveBeenCalled();
  });
});

// Issue #93: editing an arbitrary waypoint of a plotted route, not just
// popping the newest one — the map's drag-a-pin gesture and the panel's
// per-waypoint remove button both go through these.
describe('useWorldStore waypoint editing', () => {
  it('moves a waypoint by index, leaving the rest of the route alone', async () => {
    const store = await loadStoreModule(true);
    store.startDispatch();
    store.addWaypoint({ q: 1, r: 0 });
    store.addWaypoint({ q: 2, r: 0 });
    store.addWaypoint({ q: 3, r: 0 });

    store.moveWaypoint(1, { q: 9, r: 9 });

    expect(store.dispatchDraft!.route).toEqual([
      { q: 1, r: 0 },
      { q: 9, r: 9 },
      { q: 3, r: 0 },
    ]);
  });

  it('removes a waypoint by index, unlike removeLastWaypoint', async () => {
    const store = await loadStoreModule(true);
    store.startDispatch();
    store.addWaypoint({ q: 1, r: 0 });
    store.addWaypoint({ q: 2, r: 0 });
    store.addWaypoint({ q: 3, r: 0 });

    store.removeWaypoint(0);

    expect(store.dispatchDraft!.route).toEqual([{ q: 2, r: 0 }, { q: 3, r: 0 }]);
  });

  it('ignores an out-of-range index or a draft that is already gone', async () => {
    const store = await loadStoreModule(true);
    store.startDispatch();
    store.addWaypoint({ q: 1, r: 0 });

    store.moveWaypoint(5, { q: 9, r: 9 });
    store.removeWaypoint(-1);
    expect(store.dispatchDraft!.route).toEqual([{ q: 1, r: 0 }]);

    // A drag can still be in flight in the renderer when the draft is
    // cancelled underneath it.
    store.cancelDispatch();
    expect(() => store.moveWaypoint(0, { q: 4, r: 4 })).not.toThrow();
    expect(() => store.removeWaypoint(0)).not.toThrow();
  });
});
