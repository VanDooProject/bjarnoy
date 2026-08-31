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

  // Regression: refreshWorldSettlements() used to register another player's
  // settlement into the local WorldModel without an islandId, so the
  // per-island spacing check in unclaimedStartPositions() never actually
  // excluded it — a second player's client kept treating an already-founded
  // start position as free and repeatedly got 409'd by the backend.
  it('refuses to found on a start position someone else already claimed on the same island, without calling the API', async () => {
    listSettlements.mockReset().mockResolvedValue([
      {
        id: 'settlement-1',
        name: "Astrid's realm",
        ownerName: 'Astrid',
        q: NEAR_ISLAND.at.q,
        r: NEAR_ISLAND.at.r,
        longhouseLevel: 1,
        islandId: NEAR_ISLAND.islandId,
      },
    ]);
    foundSettlement.mockReset();

    const store = await loadStoreModule(false);
    withIslands(store);

    await expect(
      store.foundStartingSettlementLive('player-2', 'Bjorn', "Bjorn's realm", NEAR_ISLAND.at),
    ).rejects.toThrow();
    expect(foundSettlement).not.toHaveBeenCalled();
  });
});

// Regression coverage for scoping MINIMUM_SETTLEMENT_SPACING to the same
// island (mirrors the backend's FoundAsync): a start position on a
// *different* island must stay available no matter how close it is by raw
// hex distance to an existing settlement — separate islands are always
// divided by open sea, so their claim discs can never actually overlap any
// land either could claim.
describe('useWorldStore unclaimedStartPositions (spacing is per-island)', () => {
  const HOME_ISLAND = 'island-home';
  const OTHER_ISLAND = 'island-other';
  // Well within MINIMUM_SETTLEMENT_SPACING (13) of the existing settlement
  // at {0,0} on both islands below.
  const CLOSE_ON_HOME = { q: 2, r: 0 };
  const CLOSE_ON_OTHER = { q: 0, r: 2 };

  it('excludes a close start position on the same island but keeps one just as close on a different island', async () => {
    const store = await loadStoreModule(false);
    store.islands = [
      {
        id: HOME_ISLAND,
        index: 0,
        name: 'Home',
        q: 0,
        r: 0,
        tileCount: 10,
        startPositions: [CLOSE_ON_HOME],
        riverTiles: [],
      },
      {
        id: OTHER_ISLAND,
        index: 1,
        name: 'Other',
        q: 0,
        r: 2,
        tileCount: 10,
        startPositions: [CLOSE_ON_OTHER],
        riverTiles: [],
      },
    ];
    store.model.registerSettlement({
      id: 'settlement-home',
      ownerId: 'owner-1',
      ownerName: 'Ulf',
      name: "Ulf's realm",
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: HOME_ISLAND,
    });

    const available = store.unclaimedStartPositions().map((p) => p.islandId);

    expect(available).not.toContain(HOME_ISLAND);
    expect(available).toContain(OTHER_ISLAND);
  });
});
