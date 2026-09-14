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
const getSettlement = vi.fn();
const getFogMask = vi.fn();
const getPlotSuggestion = vi.fn();
const releasePlotSuggestion = vi.fn();
const buildDemoFogMask = vi.fn();
const getWorld = vi.fn();
const getIslands = vi.fn();
const listWorlds = vi.fn();
const getWorldMembership = vi.fn();

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
  // Mirrors the real `ApiError` shape (status + problem) — see
  // stores/leaderboard.test.ts's own copy of the same mock. Needed by the
  // `refreshPlotSuggestion` tests below (409 + `problem.rejection`) and by
  // `recoverFromMissingWorld`/`recoverFromMissingSettlement`'s own tests
  // (404 + `problem.error`).
  class MockApiError extends Error {
    status: number;
    problem: { rejection?: string; existingSettlementId?: string; error?: string } | undefined;
    constructor(
      status: number,
      problem?: { rejection?: string; existingSettlementId?: string; error?: string },
    ) {
      super(`Request failed with status ${status}`);
      this.status = status;
      this.problem = problem;
    }
  }
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
      getSettlement: (...args: unknown[]) => getSettlement(...args),
      getFogMask: (...args: unknown[]) => getFogMask(...args),
      getPlotSuggestion: (...args: unknown[]) => getPlotSuggestion(...args),
      releasePlotSuggestion: (...args: unknown[]) => releasePlotSuggestion(...args),
      getWorld: (...args: unknown[]) => getWorld(...args),
      getIslands: (...args: unknown[]) => getIslands(...args),
      listWorlds: (...args: unknown[]) => listWorlds(...args),
      getWorldMembership: (...args: unknown[]) => getWorldMembership(...args),
    },
    ApiError: MockApiError,
    // Real implementations check `err instanceof ApiError && err.problem?.error
    // === '...'` — mirrored here against the same mocked class so
    // `recoverFromMissingWorld`/`recoverFromMissingSettlement`'s tests can
    // trigger them with a plain MockApiError.
    isWorldNotFound: (err: unknown) =>
      err instanceof MockApiError && err.problem?.error === 'world_not_found',
    isSettlementNotFound: (err: unknown) =>
      err instanceof MockApiError && err.problem?.error === 'settlement_not_found',
    // `stores/auth.ts` wires its refresh/lock hooks onto this at module load
    // (`authHooks.getAccessToken = ...`) — world.ts now imports that store
    // for the field-order premium check below, so the mock needs a plain
    // object here for that assignment to land on, same as the real module.
    authHooks: {},
  }));
  // demoFogMask.ts's own bake needs ImageData/createImageBitmap, which this
  // test environment (node, not jsdom — see the localStorage stub above) has
  // no stand-in for — stub the module the same way api/client is stubbed
  // above, rather than the real bake. (See demoFogMask.test.ts for coverage
  // of the real bake body, with just those two globals stubbed.)
  vi.doMock('../lib/map/fog/demoFogMask', () => ({
    buildDemoFogMask: (...args: unknown[]) => buildDemoFogMask(...args),
    DEMO_MASK_RADIUS: 60,
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

// The premium-gating UX fix (docs/design/premium-gating-ux.md): a standing
// army's first click is the free "move on" destination — Army.PlanFieldOrder
// never charges premium for that one case — but a second click turns it into
// a waypointed order, which is premium-only. This used to only be caught
// server-side at Confirm; it's now refused right where the click is added,
// with `error` telling the player why, so a non-premium account never builds
// a route it can't submit in the first place.
describe('useWorldStore addFieldOrderWaypoint (premium gate)', () => {
  async function withAuth(isPremium: boolean) {
    const store = await loadStoreModule(true);
    const { useAuthStore } = await import('./auth');
    const auth = useAuthStore();
    auth.user = {
      id: 'u1',
      userName: 'ragnar',
      role: 'player',
      status: 'active',
      displayName: null,
      isPremium,
      preferredLocale: null,
    };
    return store;
  }

  it('lets a non-premium account plot exactly one free destination', async () => {
    const store = await withAuth(false);
    store.startFieldOrder('army-1');

    store.addFieldOrderWaypoint({ q: 1, r: 0 });

    expect(store.fieldOrderDraft!.route).toEqual([{ q: 1, r: 0 }]);
    expect(store.fieldOrderDraft!.error).toBeNull();
  });

  it('refuses a second stop for a non-premium account, explaining why instead of silently dropping it', async () => {
    const store = await withAuth(false);
    store.startFieldOrder('army-1');
    store.addFieldOrderWaypoint({ q: 1, r: 0 });

    store.addFieldOrderWaypoint({ q: 2, r: 0 });

    expect(store.fieldOrderDraft!.route).toEqual([{ q: 1, r: 0 }]);
    expect(store.fieldOrderDraft!.error).toMatch(/premium/i);
  });

  it('lets a premium account plot as many stops as it likes', async () => {
    const store = await withAuth(true);
    store.startFieldOrder('army-1');

    store.addFieldOrderWaypoint({ q: 1, r: 0 });
    store.addFieldOrderWaypoint({ q: 2, r: 0 });
    store.addFieldOrderWaypoint({ q: 3, r: 0 });

    expect(store.fieldOrderDraft!.route).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
    expect(store.fieldOrderDraft!.error).toBeNull();
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

  it('founds on the exact tile clicked, even when it is only an advisory alternative', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    getTradeBoard.mockReset().mockResolvedValue([]);
    getMyTradeOffers.mockReset().mockResolvedValue([]);
    getShipments.mockReset().mockResolvedValue([]);
    getPlotSuggestion.mockReset().mockResolvedValue({
      islandId: FAR_ISLAND.islandId,
      plot: NEAR_ISLAND.at,
      alternatives: [FAR_ISLAND.at],
      reserved: true,
      reservedUntil: null,
    });
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

    // The player clicked the advisory alternative, not the suggestion's own
    // pinned plot — startPositionAt must resolve the exact hex clicked, not
    // snap to whichever one the backend pinned.
    await store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", FAR_ISLAND.at);

    expect(foundSettlement).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({ islandId: FAR_ISLAND.islandId, q: FAR_ISLAND.at.q, r: FAR_ISLAND.at.r }),
    );
  });

  it('re-requests the plot suggestion before founding, so a stale pin cannot be used', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    getPlotSuggestion.mockReset().mockResolvedValue({
      islandId: NEAR_ISLAND.islandId,
      plot: NEAR_ISLAND.at,
      alternatives: [],
      reserved: true,
      reservedUntil: null,
    });
    foundSettlement.mockReset().mockResolvedValue({
      id: 'settlement-1',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: NEAR_ISLAND.at.q,
      r: NEAR_ISLAND.at.r,
      longhouseLevel: 1,
      resources: { stock: {}, ratePerHour: {} },
      islandId: NEAR_ISLAND.islandId,
    });

    const store = await loadStoreModule(false);
    withIslands(store);

    await store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", NEAR_ISLAND.at);

    expect(getPlotSuggestion).toHaveBeenCalledWith('world-1', 'player-1');
  });

  it('refuses to found on a hex the backend did not offer, without calling the API', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    getPlotSuggestion.mockReset().mockResolvedValue({
      islandId: NEAR_ISLAND.islandId,
      plot: NEAR_ISLAND.at,
      alternatives: [],
      reserved: true,
      reservedUntil: null,
    });
    foundSettlement.mockReset();

    const store = await loadStoreModule(false);
    withIslands(store);

    await expect(
      store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", { q: 9, r: 9 }),
    ).rejects.toThrow();
    expect(foundSettlement).not.toHaveBeenCalled();
  });
});

// landing-page-defects.md L6b: `foundStartingSettlementLive` used to POST
// the founding, then mirror the response into the local `WorldModel`, claim
// territory, sync the HUD and warm the trade cache, and only once ALL of
// that returned did `LandingView.foundHere` call `player.foundSettlement` —
// the write that actually matters, since it's what puts
// `bjarnoy.settlementId` into localStorage (what the router guard, and L7's
// whole recovery path, both check). A throw anywhere in that local
// reconciliation left the backend holding a settlement the browser had no
// record of: unrecoverable without clearing site data, and exactly the
// state that produces L7's permanent 409 loop on the next reload. This is a
// regression test for moving `player.foundSettlement` to fire the instant
// the POST resolves: run against the old ordering, `player.hasFoundedSettlement`
// stays false here because the simulated reconciliation failure throws
// before `LandingView.foundHere` ever gets to call it.
describe('useWorldStore founding a settlement (L6b: persist before reconciling)', () => {
  const ISLAND = { islandId: 'island-1', at: { q: 0, r: 0 } };

  it('marks the player founded with the settlement id even when reconciliation after the POST throws', async () => {
    listSettlements.mockReset().mockResolvedValue([]);
    getPlotSuggestion.mockReset().mockResolvedValue({
      islandId: ISLAND.islandId,
      plot: ISLAND.at,
      alternatives: [],
      reserved: true,
      reservedUntil: null,
    });
    foundSettlement.mockReset().mockResolvedValue({
      id: 'settlement-1',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: ISLAND.at.q,
      r: ISLAND.at.r,
      longhouseLevel: 1,
      resources: { stock: {}, ratePerHour: {} },
      islandId: ISLAND.islandId,
    });

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.islands = [
      {
        id: ISLAND.islandId,
        index: 0,
        name: 'Island',
        q: 0,
        r: 0,
        tileCount: 10,
        startPositions: [ISLAND.at],
        riverTiles: [],
      },
    ];
    // Simulates a failure in the local reconciliation that follows a
    // successful founding POST — the backend already has the settlement at
    // this point, only the browser's own bookkeeping fails.
    vi.spyOn(store.model, 'registerSettlement').mockImplementation(() => {
      throw new Error('boom — simulated reconciliation failure');
    });

    const { AlreadyFoundedError } = await import('./world');
    let caught: unknown;
    try {
      await store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", ISLAND.at);
    } catch (err) {
      caught = err;
    }

    // The failure surfaces as "your realm exists" (recover into it, same as
    // an AlreadyFounded 409), not a bare error `LandingView.foundHere` would
    // otherwise show as "that plot was just taken" — see
    // `foundStartingSettlementLive`'s own doc comment.
    expect(caught).toBeInstanceOf(AlreadyFoundedError);
    expect((caught as InstanceType<typeof AlreadyFoundedError>).settlementId).toBe('settlement-1');

    // The actual regression check: the player is marked founded with the
    // right id regardless of the reconciliation failure above — this is
    // what stops the settlement from being unrecorded on the client.
    const { usePlayerStore } = await import('./player');
    const player = usePlayerStore();
    expect(player.hasFoundedSettlement).toBe(true);
    expect(player.settlementId).toBe('settlement-1');
  });
});

// landing-page-defects.md L7: a 409 from `GET /worlds/{id}/plot-suggestion`
// used to escape `refreshPlotSuggestion` as an uncaught `ApiError`, aborting
// `LandingView.onMounted`/`refreshPreview` partway through and leaving the
// landing page with no map and no redirect, forever (every reload re-hit the
// same 409). The one existing recovery — `LandingView.foundHere`'s catch —
// called `router.push('/settlement')` straight away, which the router guard
// (`router/index.ts`) silently bounced back to `/` because
// `player.hasFoundedSettlement` was still false: the exact state a 409 like
// this leaves the player in. These cover the store-side half of the fix.
describe('useWorldStore refreshPlotSuggestion (L7: 409 recovery)', () => {
  it('returns alreadyFounded with the settlement id instead of throwing', async () => {
    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    const { ApiError: MockedApiError } = await import('../api/client');
    getPlotSuggestion.mockReset().mockRejectedValue(
      new MockedApiError(409, { rejection: 'AlreadyFounded', existingSettlementId: 'settlement-99' }),
    );

    const result = await store.refreshPlotSuggestion('player-1');

    expect(result).toEqual({ kind: 'alreadyFounded', settlementId: 'settlement-99' });
  });

  it('returns noPlotAvailable instead of throwing', async () => {
    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    const { ApiError: MockedApiError } = await import('../api/client');
    getPlotSuggestion.mockReset().mockRejectedValue(
      new MockedApiError(409, { rejection: 'NoPlotAvailable' }),
    );

    const result = await store.refreshPlotSuggestion('player-1');

    expect(result).toEqual({ kind: 'noPlotAvailable' });
  });

  it('rethrows a 500 — an unrecognised failure must stay loud, not get swallowed like the 409 used to', async () => {
    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    const { ApiError: MockedApiError } = await import('../api/client');
    getPlotSuggestion.mockReset().mockRejectedValue(new MockedApiError(500, { title: 'Internal Server Error' }));

    await expect(store.refreshPlotSuggestion('player-1')).rejects.toThrow();
  });

  it(
    "foundStartingSettlementLive's preflight throws AlreadyFoundedError, and applying its settlement id marks " +
      'the player founded — the exact state the router guard checks — rather than only asserting router.push ' +
      'was called, which is what let the original bug (a no-op push) through undetected',
    async () => {
      const store = await loadStoreModule(false);
      store.worldId = 'world-1';
      const { ApiError: MockedApiError } = await import('../api/client');
      getPlotSuggestion.mockReset().mockRejectedValue(
        new MockedApiError(409, { rejection: 'AlreadyFounded', existingSettlementId: 'settlement-99' }),
      );
      const { AlreadyFoundedError } = await import('./world');

      let caught: unknown;
      try {
        await store.foundStartingSettlementLive('player-1', 'Astrid', "Astrid's realm", { q: 0, r: 0 });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(AlreadyFoundedError);
      const settlementId = (caught as InstanceType<typeof AlreadyFoundedError>).settlementId;
      expect(settlementId).toBe('settlement-99');

      // Mirrors LandingView's `recoverAlreadyFounded`: mark the player
      // founded FIRST — that write (`hasFoundedSettlement`/
      // `bjarnoy.settlementId`) is what `router/index.ts`'s guard actually
      // reads before it lets `/settlement` load.
      const { usePlayerStore } = await import('./player');
      const player = usePlayerStore();
      player.foundSettlement(settlementId);

      expect(player.hasFoundedSettlement).toBe(true);
      expect(player.settlementId).toBe('settlement-99');
    },
  );
});

// Issue #98: the header's storage cap must reflect the backend's real
// per-resource capacity (`ResourcesResponse.Capacity`, the same cap
// `ResourcePool.Adjust` enforces server-side) instead of a synthetic
// longhouse-level-derived guess — otherwise a fully-clamped admin grant
// (e.g. 3000 clamped to a 750 cap) makes the header read "750 / 3,000" and
// look like most of the grant vanished.
// Regression for the landing-page bug: the "empty plot" preview used to show
// other players' already-existing buildings because refreshWorldSettlements
// painted every settlement world-wide with no island scoping. Rivals should
// only ever be painted (buildings + owner border) when they're on the same
// island as what's actually on screen — the world map is the one legitimate
// exception (worldMapActive).
describe('useWorldStore refreshWorldSettlements (island-scoped painting)', () => {
  it('paints only same-island rivals once a plot suggestion pins the current island', async () => {
    listSettlements.mockReset().mockResolvedValue([
      { id: 'rival-near', name: 'Near realm', ownerName: 'Astrid', q: 0, r: 0, longhouseLevel: 1, islandId: 'island-near' },
      { id: 'rival-far', name: 'Far realm', ownerName: 'Bjorn', q: 40, r: 40, longhouseLevel: 1, islandId: 'island-far' },
    ]);

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.plotSuggestion = {
      islandId: 'island-near',
      plot: { q: 0, r: 0 },
      alternatives: [],
      reserved: true,
      reservedUntil: null,
    };

    await store.refreshWorldSettlements();

    expect(store.model.countBuildings('rival-near')).toBe(1);
    expect(store.model.countBuildings('rival-far')).toBe(0);
  });

  it('paints every rival once the world map is active', async () => {
    listSettlements.mockReset().mockResolvedValue([
      { id: 'rival-near', name: 'Near realm', ownerName: 'Astrid', q: 0, r: 0, longhouseLevel: 1, islandId: 'island-near' },
      { id: 'rival-far', name: 'Far realm', ownerName: 'Bjorn', q: 40, r: 40, longhouseLevel: 1, islandId: 'island-far' },
    ]);

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.setWorldMapActive(true);

    await store.refreshWorldSettlements();

    expect(store.model.countBuildings('rival-near')).toBe(1);
    expect(store.model.countBuildings('rival-far')).toBe(1);
  });
});

describe('useWorldStore refreshLiveSettlement (storage capacity)', () => {
  it('uses the backend capacity for hud.storageCap, not the synthetic longhouse-level guess', async () => {
    getSettlement.mockReset().mockResolvedValue({
      id: 'settlement-1',
      longhouseLevel: 1,
      resources: {
        stock: { wood: 750, stone: 0, food: 0, iron: 0 },
        ratePerHour: { wood: 0, stone: 0, food: 0, iron: 0 },
        capacity: { wood: 750, stone: 750, food: 900, iron: 375 },
      },
      buildings: [],
      queue: [],
      garrison: [],
      trainingQueue: [],
    });

    const store = await loadStoreModule(false);
    store.model.registerSettlement({
      id: 'settlement-1',
      ownerId: 'player-1',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: Date.now(),
    });
    store.selectedSettlementId = 'settlement-1';

    await store.refreshLiveSettlement();

    expect(store.hud.storageCap).toEqual({ wood: 750, stone: 750, food: 900, iron: 375 });
    expect(store.hud.resources.wood).toBe(750);
  });

  // Regression: SettlementEndpoints.Get 404s exactly when no settlement
  // exists by that id (see SettlementEndpoints.SettlementNotFoundProblem).
  // refreshLiveSettlement had no try/catch at all, and startHudSync's poll
  // loop calls it unawaited (`void this.refreshLiveSettlement()`), so this
  // became an uncaught promise rejection every poll tick forever, once a
  // settlement's world got reseeded out from under it. It must instead
  // deselect the dead id and drop back to "not founded yet" rather than
  // throwing.
  it('deselects the settlement and resets onboarding when the backend reports settlement_not_found', async () => {
    const store = await loadStoreModule(false);
    const { ApiError: MockedApiError } = await import('../api/client');
    getSettlement.mockReset().mockRejectedValue(
      new MockedApiError(404, { error: 'settlement_not_found' }),
    );
    store.worldId = 'world-1';
    store.selectedSettlementId = 'dead-settlement';

    const { usePlayerStore } = await import('./player');
    const player = usePlayerStore();
    player.foundSettlement('dead-settlement', 'world-1');

    await expect(store.refreshLiveSettlement()).resolves.toBeUndefined();

    expect(store.selectedSettlementId).toBeNull();
    expect(player.settlementId).toBeNull();
    expect(player.hasFoundedSettlement).toBe(false);
  });

  it('still throws on an ordinary (non-settlement_not_found) failure, for the caller to handle', async () => {
    getSettlement.mockReset().mockRejectedValue(new Error('network error'));

    const store = await loadStoreModule(false);
    store.selectedSettlementId = 'settlement-1';

    await expect(store.refreshLiveSettlement()).rejects.toThrow('network error');
  });
});

describe('useWorldStore fetchFogMask', () => {
  it('is a no-op in demo mode', async () => {
    getFogMask.mockReset();

    const store = await loadStoreModule(true);
    store.worldId = 'world-1';
    store.ownerId = 'player-1';

    await store.fetchFogMask();

    expect(getFogMask).not.toHaveBeenCalled();
    expect(store.fogMaskBitmap).toBeNull();
  });

  it('is a no-op before a world/owner is known', async () => {
    getFogMask.mockReset();

    const store = await loadStoreModule(false);

    await store.fetchFogMask();

    expect(getFogMask).not.toHaveBeenCalled();
  });

  it('fetches and stashes the decoded bitmap, closing the previous one', async () => {
    const firstBitmap = { close: vi.fn() };
    const secondBitmap = { close: vi.fn() };
    getFogMask
      .mockReset()
      .mockResolvedValueOnce({ bitmap: firstBitmap, version: '"v1"' })
      .mockResolvedValueOnce({ bitmap: secondBitmap, version: '"v2"' });

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.ownerId = 'player-1';

    await store.fetchFogMask();
    expect(getFogMask).toHaveBeenCalledWith('world-1', 'player-1');
    expect(store.fogMaskBitmap).toBe(firstBitmap);

    await store.fetchFogMask();
    expect(firstBitmap.close).toHaveBeenCalledOnce();
    expect(store.fogMaskBitmap).toBe(secondBitmap);
  });

  it('leaves the previous bitmap in place if the fetch fails', async () => {
    const firstBitmap = { close: vi.fn() };
    getFogMask
      .mockReset()
      .mockResolvedValueOnce({ bitmap: firstBitmap, version: '"v1"' })
      .mockRejectedValueOnce(new Error('network error'));

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.ownerId = 'player-1';

    await store.fetchFogMask();
    await store.fetchFogMask();

    expect(store.fogMaskBitmap).toBe(firstBitmap);
  });

  // Regression: startHudSync polls this on a fixed LIVE_POLL_MS timer with no
  // regard for how long the previous fetch actually took — a fetch slower
  // than the poll interval (a slow network, or demo mode's own
  // refreshDemoFogMask CPU-bound bake — see that describe block below) used
  // to let the next tick start a second, overlapping fetch right on top of
  // it. Each overlap adds concurrent work that makes the next one slower
  // still, which is exactly the kind of unbounded pile-up that could stall a
  // page for tens of seconds under load (observed hanging a ring-menu e2e
  // test's build click — see ring-menu.spec.ts's "hovering a building shows
  // its cost..." test). `maskFetchInFlight` already existed (read by
  // FogPerfPanel) but was only ever set, never checked — this is what
  // actually wires it up as a guard.
  it('does not start a second fetch while one is still in flight', async () => {
    getFogMask.mockReset();
    let resolveFirst: (v: { bitmap: unknown; version: string }) => void;
    const firstCall = new Promise<{ bitmap: unknown; version: string }>((resolve) => {
      resolveFirst = resolve;
    });
    getFogMask.mockReturnValueOnce(firstCall);

    const store = await loadStoreModule(false);
    store.worldId = 'world-1';
    store.ownerId = 'player-1';

    const firstFetch = store.fetchFogMask();
    const secondFetch = store.fetchFogMask(); // fired before the first resolves
    expect(getFogMask).toHaveBeenCalledTimes(1);

    resolveFirst!({ bitmap: { close: vi.fn() }, version: '"v1"' });
    await Promise.all([firstFetch, secondFetch]);
    expect(getFogMask).toHaveBeenCalledTimes(1);

    // Once the in-flight fetch has actually settled, a later poll tick must
    // still go through — this isn't a one-shot latch.
    getFogMask.mockResolvedValueOnce({ bitmap: { close: vi.fn() }, version: '"v2"' });
    await store.fetchFogMask();
    expect(getFogMask).toHaveBeenCalledTimes(2);
  });

  // Regression: WorldEndpoints.GetFogMask 404s exactly when the world itself
  // is gone (see WorldEndpoints.WorldNotFoundProblem) — before this, that
  // just fell into fetchFogMask's ordinary "leave the previous bitmap in
  // place" catch, so a client whose world stopped existing kept asking after
  // the same dead id forever (the reported "fog covers the whole map and
  // never clears" symptom). It must instead drop the stale id and rejoin
  // whatever world is actually running.
  it('drops the world id and rejoins the newest world when the backend reports world_not_found', async () => {
    const store = await loadStoreModule(false);
    const { ApiError: MockedApiError } = await import('../api/client');
    const staleBitmap = { close: vi.fn() };
    getFogMask.mockReset().mockRejectedValue(new MockedApiError(404, { error: 'world_not_found' }));
    listWorlds.mockReset().mockResolvedValue([
      {
        id: 'world-2',
        name: 'New Kettil Sea',
        seed: 2,
        radius: 30,
        maxPlayers: 100,
        status: 'Running',
        islandCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        joinable: true,
        joinableReason: 'None',
        startsAt: null,
        endbossTriggered: false,
        speedFactor: 1,
        generation: {},
        movement: { land: {}, sea: {}, riverCrossingCost: 8 },
      },
    ]);
    getIslands.mockReset().mockResolvedValue([]);
    listSettlements.mockReset().mockResolvedValue([]);

    store.worldId = 'world-1';
    store.ownerId = 'player-1';
    store.liveReady = true;
    store.fogMaskBitmap = staleBitmap as unknown as ImageBitmap;

    await store.fetchFogMask();

    // Recovery runs fire-and-forget from fetchFogMask's own catch (see that
    // code's comment on why), so `fetchFogMask()` resolving doesn't mean
    // `recoverFromMissingWorld`'s chain of awaits (bootstrapLiveWorld ->
    // listWorlds -> getIslands -> refreshWorldSettlements) has settled yet.
    await vi.waitFor(() => expect(store.worldId).toBe('world-2'));

    expect(store.liveReady).toBe(true);
    // The dead world's mask is gone too, not just left stale — recovery
    // starts this store back at "no mask fetched yet for the new world".
    expect(staleBitmap.close).toHaveBeenCalledOnce();
    expect(store.fogMaskBitmap).toBeNull();
  });
});

describe('useWorldStore refreshDemoFogMask', () => {
  it('is a no-op outside demo mode', async () => {
    buildDemoFogMask.mockReset();
    const store = await loadStoreModule(false);

    await store.refreshDemoFogMask();

    expect(buildDemoFogMask).not.toHaveBeenCalled();
  });

  // Same regression as fetchFogMask's own "does not start a second fetch"
  // test above, but for the poll that actually caused the observed hang:
  // demoFogMask.ts's bake is real synchronous CPU work (a texel loop over
  // DEMO_MASK_RADIUS) plus an async `createImageBitmap`, not a network wait,
  // so it is the more likely of the two to run long enough to overlap its
  // own next poll tick under load.
  it('does not start a second bake while one is still in flight', async () => {
    buildDemoFogMask.mockReset();
    let resolveFirst: (bitmap: unknown) => void;
    const firstBake = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    buildDemoFogMask.mockReturnValueOnce(firstBake);

    const store = await loadStoreModule(true);

    const firstRefresh = store.refreshDemoFogMask();
    const secondRefresh = store.refreshDemoFogMask(); // fired before the first resolves
    expect(buildDemoFogMask).toHaveBeenCalledTimes(1);

    resolveFirst!({ close: vi.fn() });
    await Promise.all([firstRefresh, secondRefresh]);
    expect(buildDemoFogMask).toHaveBeenCalledTimes(1);

    // Once the in-flight bake has settled, a later poll must still go through
    // — this isn't a one-shot latch. The fog has to actually move for that,
    // since an unchanged fog is now skipped (see the test below); founding a
    // settlement claims territory, which is exactly what moves it.
    buildDemoFogMask.mockResolvedValueOnce({ close: vi.fn() });
    store.model.foundSettlement('player-1', 'You', 'Second', { q: 20, r: 20 });
    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(2);
  });

  // The bake is ~30ms of main thread over a ~30k-texel grid, and it was polled
  // on the same four-second interval as live mode's mask *fetch* — so with the
  // camera sitting perfectly still, demo mode dropped a frame every four
  // seconds re-deriving a bitmap identical to the one already on screen. Fog
  // moves when territory is claimed or a settlement's vision grows, not on a
  // timer, so the poll now compares WorldModel.fogSignature() first.
  it('skips the bake when nothing the fog is drawn from has changed', async () => {
    buildDemoFogMask.mockReset();
    buildDemoFogMask.mockResolvedValue({ close: vi.fn() });
    const store = await loadStoreModule(true);

    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(1);

    // Several more poll ticks with nothing happening in between.
    await store.refreshDemoFogMask();
    await store.refreshDemoFogMask();
    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(1);

    // ...and it is not a latch: claiming territory moves the fog, so the next
    // tick bakes again.
    store.model.foundSettlement('player-1', 'You', 'Outpost', { q: 30, r: 30 });
    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(2);
  });

  // A bake that produced nothing (no settlement founded yet, so there is no
  // fog to draw) must not record its signature — otherwise the very first
  // real bake, once a settlement exists, would be skipped and the map would
  // render with no fog at all until something else happened to change it.
  it('does not let a bail-out suppress the first real bake', async () => {
    buildDemoFogMask.mockReset();
    buildDemoFogMask.mockResolvedValueOnce(null);
    const store = await loadStoreModule(true);

    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(1);
    expect(store.fogMaskBitmap).toBeNull();

    buildDemoFogMask.mockResolvedValueOnce({ close: vi.fn() });
    await store.refreshDemoFogMask();
    expect(buildDemoFogMask).toHaveBeenCalledTimes(2);
    expect(store.fogMaskBitmap).not.toBeNull();
  });
});

// Issue #158: construction slots/reservations have no backend to ask in
// demo mode — the local WorldModel simulation places buildings instantly
// and has no queue at all. Every new `hud` field must default to something
// safe (no reservation, no waiting queue) rather than erroring or leaving
// stale/undefined state, and refreshLiveSettlement — the only place these
// fields are ever refreshed from the backend — must stay a true no-op.
// "Join another world" (store half — UI comes later): `joinWorld` must wipe
// whatever per-world/per-settlement state the previously-joined world left
// behind, point the store at the new world, and either restore an existing
// realm there or leave the player free to found a fresh one.
describe('useWorldStore joinWorld', () => {
  function worldFixture(id: string) {
    return {
      id,
      name: 'New World',
      seed: 1,
      radius: 50,
      maxPlayers: 100,
      status: 'Running',
      islandCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      joinable: true,
      joinableReason: 'None',
      startsAt: null,
      endbossTriggered: false,
      speedFactor: 1,
      generation: {},
      movement: { land: {}, sea: {}, riverCrossingCost: 8 },
    };
  }

  it('switches to a world with an existing realm and restores it immediately', async () => {
    getWorld.mockReset().mockResolvedValue(worldFixture('world-2'));
    getIslands.mockReset().mockResolvedValue([]);
    listSettlements.mockReset().mockResolvedValue([]);
    getWorldMembership.mockReset().mockResolvedValue({
      worldId: 'world-2',
      settlementId: 'settlement-42',
      settlementName: "Astrid's realm",
    });
    getSettlement.mockReset().mockResolvedValue({
      id: 'settlement-42',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: 3,
      r: 4,
      longhouseLevel: 1,
      resources: { stock: {}, ratePerHour: {} },
      islandId: 'island-2',
      buildings: [],
      queue: [],
      garrison: [],
      trainingQueue: [],
    });
    getTradeBoard.mockReset().mockResolvedValue([]);
    getMyTradeOffers.mockReset().mockResolvedValue([]);
    getShipments.mockReset().mockResolvedValue([]);

    const store = await loadStoreModule(false);

    await store.joinWorld('world-2');

    expect(getWorldMembership).toHaveBeenCalledWith('world-2', expect.any(String));
    expect(store.worldId).toBe('world-2');
    expect(store.liveReady).toBe(true);
    expect(store.selectedSettlementId).toBe('settlement-42');

    const { usePlayerStore } = await import('./player');
    const player = usePlayerStore();
    expect(player.hasFoundedSettlement).toBe(true);
    expect(player.settlementId).toBe('settlement-42');
  });

  it('switches to a brand-new world with no realm, leaving no stale state from the previous world behind', async () => {
    getWorld.mockReset().mockResolvedValue(worldFixture('world-3'));
    getIslands.mockReset().mockResolvedValue([]);
    listSettlements.mockReset().mockResolvedValue([]);
    getSettlement.mockReset();
    getWorldMembership.mockReset().mockResolvedValue({
      worldId: 'world-3',
      settlementId: null,
      settlementName: null,
    });

    const store = await loadStoreModule(false);
    // Stale state left over from a previously-joined world/settlement.
    store.worldId = 'world-1';
    store.selectedSettlementId = 'old-settlement';
    store.plotSuggestion = {
      islandId: 'old-island',
      plot: { q: 0, r: 0 },
      alternatives: [],
      reserved: true,
      reservedUntil: null,
    };
    store.islands = [
      { id: 'old-island', index: 0, name: 'Old', q: 0, r: 0, tileCount: 1, startPositions: [], riverTiles: [] },
    ];
    store.armies = [{ id: 'old-army' } as never];
    store.liveReady = true;

    await store.joinWorld('world-3');

    expect(store.worldId).toBe('world-3');
    expect(store.liveReady).toBe(true);
    expect(store.selectedSettlementId).toBeNull();
    expect(store.plotSuggestion).toBeNull();
    expect(store.armies).toEqual([]);
    expect(getSettlement).not.toHaveBeenCalled();

    const { usePlayerStore } = await import('./player');
    const player = usePlayerStore();
    expect(player.hasFoundedSettlement).toBe(false);
    expect(player.settlementId).toBeNull();
  });

  it('is a no-op in demo mode', async () => {
    getWorldMembership.mockReset();
    const store = await loadStoreModule(true);
    const originalWorldId = store.worldId;

    await store.joinWorld('world-9');

    expect(getWorldMembership).not.toHaveBeenCalled();
    expect(store.worldId).toBe(originalWorldId);
  });
});

describe('construction slots/reservations degrade gracefully in demo mode', () => {
  it('reports a zero-reservation, non-premium construction summary with no backend call', async () => {
    getSettlement.mockReset();
    const store = await loadStoreModule(true);

    expect(store.hud.reserved).toEqual({ wood: 0, stone: 0, food: 0, iron: 0 });
    expect(store.hud.available).toEqual(store.hud.resources);
    expect(store.hud.construction).toEqual({
      slots: 2,
      slotsUsed: 0,
      maxWaitingOrders: 0,
      waitingOrders: 0,
      maxOrdersPerHex: 1,
    });

    store.selectedSettlementId = 'settlement-1';
    await store.refreshLiveSettlement();

    expect(getSettlement).not.toHaveBeenCalled();
    // Still the same safe defaults after the no-op call.
    expect(store.hud.reserved).toEqual({ wood: 0, stone: 0, food: 0, iron: 0 });
    expect(store.hud.construction.maxWaitingOrders).toBe(0);
  });
});
