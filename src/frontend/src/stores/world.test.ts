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
const listSettlements = vi.fn();
const foundSettlement = vi.fn();
const getTradeBoard = vi.fn();
const getMyTradeOffers = vi.fn();
const getShipments = vi.fn();

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
      listSettlements: (...args: unknown[]) => listSettlements(...args),
      foundSettlement: (...args: unknown[]) => foundSettlement(...args),
      getTradeBoard: (...args: unknown[]) => getTradeBoard(...args),
      getMyTradeOffers: (...args: unknown[]) => getMyTradeOffers(...args),
      getShipments: (...args: unknown[]) => getShipments(...args),
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

// Issue #96: clicking a tile on the landing page used to found the
// settlement on whichever unclaimed start position was *nearest* the click,
// not the one actually clicked — so a click landed the longhouse on the
// same "suggested" tile almost every time. `foundStartingSettlementLive`
// must resolve the exact clicked hex (`startPositionAt`), never snap to the
// nearest one.
describe('useWorldStore founding a settlement (live mode)', () => {
  const NEAR_ISLAND = { islandId: 'island-near', at: { q: 0, r: 0 } };
  const FAR_ISLAND = { islandId: 'island-far', at: { q: 5, r: 5 } };

  function withIslands(store: Awaited<ReturnType<typeof loadStoreModule>>) {
    store.worldId = 'world-1';
    store.islands = [
      {
        id: NEAR_ISLAND.islandId,
        index: 0,
        name: 'Near',
        q: 0,
        r: 0,
        tileCount: 10,
        startPositions: [NEAR_ISLAND.at],
        riverTiles: [],
      },
      {
        id: FAR_ISLAND.islandId,
        index: 1,
        name: 'Far',
        q: 5,
        r: 5,
        tileCount: 10,
        startPositions: [FAR_ISLAND.at],
        riverTiles: [],
      },
    ];
  }

  it('founds on the exact tile clicked, even when a different start position is nearer the origin', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    getTradeBoard.mockReset().mockResolvedValue([]);
    getMyTradeOffers.mockReset().mockResolvedValue([]);
    getShipments.mockReset().mockResolvedValue([]);
    foundSettlement.mockReset().mockResolvedValue({
      id: 'settlement-1',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: FAR_ISLAND.at.q,
      r: FAR_ISLAND.at.r,
      longhouseLevel: 1,
      resources: { stock: {}, ratePerHour: {} },
      islandId: FAR_ISLAND.islandId,
    });

    const store = await loadStoreModule(false);
    withIslands(store);

    // The player clicked the far start position, not the one nearest {0,0}
    // (which `nearestStartPosition` — used only for the preview highlight —
    // would have picked).
    await store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", FAR_ISLAND.at);

    expect(foundSettlement).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({ islandId: FAR_ISLAND.islandId, q: FAR_ISLAND.at.q, r: FAR_ISLAND.at.r }),
    );
  });

  it('refuses to found on a hex that is not an unclaimed start position, without calling the API', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    foundSettlement.mockReset();

    const store = await loadStoreModule(false);
    withIslands(store);

    await expect(
      store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", { q: 9, r: 9 }),
    ).rejects.toThrow();
    expect(foundSettlement).not.toHaveBeenCalled();
  });
});
