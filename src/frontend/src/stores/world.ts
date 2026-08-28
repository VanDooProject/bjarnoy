import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { ApiError, api } from '../api/client';
import type { BuildOrderResponse, IslandResponse } from '../api/types';
import { DEMO_MODE } from '../config';
import { hexDistance, type AxialCoord } from '../lib/hex/coords';
import { WorldModel } from '../lib/map/WorldModel';
import type { Resources } from '../lib/map/types';
import { emptyResources } from '../lib/map/types';

// How often live mode re-polls a settlement to pick up build-queue
// completions and rate changes it didn't cause itself (see
// `applyServerSnapshot`). Kept well below build/production timescales.
const LIVE_POLL_MS = 4000;

// Mirrors the backend's SettlementService.MinimumSpacing: the minimum hex
// distance the API enforces between two settlements' centres. Kept in sync
// here so nearestStartPosition can skip a plot the backend would reject
// instead of finding out only after the founding request fails.
const MINIMUM_SETTLEMENT_SPACING = 3;

// The WorldModel instance itself is `markRaw`-ed: it's a plain class meant
// to be mutated directly by the renderer's render loop, not walked by Vue's
// reactivity proxy. Only the small `hud` summary below is reactive, and it
// is refreshed on a slow interval (1s) rather than on every resource tick.
export const useWorldStore = defineStore('world', {
  state: () => ({
    model: markRaw(new WorldModel(20260824)),
    selectedSettlementId: null as string | null,
    hud: {
      resources: emptyResources() as Resources,
      rates: emptyResources() as Resources,
      settlementName: '',
      level: 1,
      // Issue #16: population, wired the same way as the other resources —
      // current/max stock plus a rate. See `WorldModel.populationFor`.
      population: { current: 0, max: 0, rate: 0 },
      // zip 6a: landing-page onboarding needs "how many buildings has the
      // player actually placed" — derived from the model itself (the
      // longhouse counts as the first) rather than a separately tracked
      // counter that could drift from what's really on the ground.
      buildingsPlaced: 0,
      // zip 9: "real-time elements: build queue countdowns" — a snapshot of
      // the backend's queue plus when it was fetched, so BuildQueuePanel can
      // count each order down locally between polls instead of only
      // updating every LIVE_POLL_MS. Always empty in demo mode: the local
      // WorldModel places buildings instantly and has no queue to show.
      queue: [] as BuildOrderResponse[],
      queueFetchedAt: 0,
      /** Increments every syncHud tick (1s) — a cheap reactive dependency for countdown displays. */
      tick: 0,
    },
    syncHandle: null as ReturnType<typeof setInterval> | null,
    livePollHandle: null as ReturnType<typeof setInterval> | null,
    // Live-mode state: which backend world this session is playing in, and
    // the start positions a settlement may be founded on. Unused in demo
    // mode, where `WorldModel` is the entire source of truth.
    worldId: localStorage.getItem('bjarnoy.worldId'),
    islands: [] as IslandResponse[],
    liveReady: false,
  }),
  actions: {
    /**
     * Connects to the real backend when the app isn't running in demo mode
     * (see `config.ts`): joins an existing running world or creates one, then
     * reseeds the local `WorldModel` from that world's seed so this client
     * renders the exact terrain the server has (`TerrainSampler` is a
     * bit-exact port of `worldGenerator.ts` — see docs/tech/backend.md).
     * A no-op in demo mode and idempotent once a world is joined.
     */
    async bootstrapLiveWorld() {
      if (DEMO_MODE || this.liveReady) return;

      let world = this.worldId ? await api.getWorld(this.worldId).catch(() => null) : null;
      // Worlds are shared and meant to be created by an admin, not by
      // whichever browser tab happens to land here first — so join
      // whatever exists rather than filtering by status. (There used to be
      // a `status === 'running'` filter here, but WorldResponse's `status`
      // never actually takes that value — see WorldEntity's WorldStatus —
      // so it silently matched nothing and fell through to createWorld()
      // below on every visit, racing every other tab that did the same and
      // 409-ing on the shared 'Kettil Sea' name.)
      if (!world) {
        world = await this.newestWorld();
      }
      if (!world) {
        // Nobody has created a world yet (e.g. a fresh dev database) — seed
        // one so there's something to join. If another tab won that race,
        // join what it created instead of failing on the name conflict.
        try {
          world = await api.createWorld({ name: 'Kettil Sea' });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) throw err;
          world = await this.newestWorld();
          if (!world) throw err;
        }
      }

      this.worldId = world.id;
      localStorage.setItem('bjarnoy.worldId', world.id);
      this.model = markRaw(new WorldModel(world.seed));
      this.islands = await api.getIslands(world.id);
      // Island names/centres, as generated by the backend (see
      // `Bjarnoy.Domain.World.IslandNames`) — the renderer draws one label
      // per island at this position (world map only).
      this.model.setIslands(
        this.islands.map((island) => ({ id: island.id, name: island.name, q: island.q, r: island.r })),
      );
      this.liveReady = true;
      // Every other player already in this shared world needs to be known
      // before the landing page picks a starting plot (nearestStartPosition
      // must avoid their homes) and drawn on screen (rival realms are part
      // of the world too, not just something the world map reveals later).
      await this.refreshWorldSettlements();
    },
    /** The most recently created world, or null if none exist yet. */
    async newestWorld() {
      const worlds = await api.listWorlds();
      // GetWorldsAsync orders by id (UUIDv7, so creation order) ascending.
      return worlds.length > 0 ? worlds[worlds.length - 1] : null;
    },
    /**
     * Nearest island start position to `near` that nobody has founded on (or
     * too close to) yet, for founding via the API.
     *
     * Start positions are precomputed once at world generation and never
     * shrink as players settle, so without this check every new player on a
     * shared world converges on the exact same nearest plot — which the
     * backend then refuses with `PlotTaken` (an exact match) or
     * `TooCloseToNeighbour` (see `SettlementService.MinimumSpacing`) once
     * it's taken, rather than the client ever finding out until it tries.
     */
    nearestStartPosition(near: AxialCoord): { islandId: string; at: AxialCoord } | null {
      const settlements = this.model.listSettlements();
      let best: { islandId: string; at: AxialCoord; distance: number } | null = null;
      for (const island of this.islands) {
        for (const pos of island.startPositions) {
          const tooCloseToExisting = settlements.some(
            (s) => hexDistance(pos, { q: s.q, r: s.r }) < MINIMUM_SETTLEMENT_SPACING,
          );
          if (tooCloseToExisting) continue;
          const distance = hexDistance(near, pos);
          if (!best || distance < best.distance) {
            best = { islandId: island.id, at: pos, distance };
          }
        }
      }
      return best;
    },
    /** Demo mode: found instantly in the local `WorldModel`, no server round trip. */
    foundStartingSettlement(ownerId: string, ownerName: string, name: string, near: AxialCoord) {
      const at = this.model.findLandfall(near) ?? near;
      const settlement = this.model.foundSettlement(ownerId, ownerName, name, at);
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      return settlement;
    },
    /**
     * Live mode: the backend is the source of truth for the settlement's id
     * and starting stock. The result is mirrored into the local `WorldModel`
     * via `registerSettlement` so the renderer, HUD and settlement view work
     * exactly as they do in demo mode from this point on.
     *
     * `ownerId` is the stable local player id (see `stores/player.ts`), sent
     * to the backend so it can refuse a second settlement for the same
     * player in this world (one realm per player until ships/carts exist —
     * see `SettlementService.FoundAsync`). Throws `ApiError` (409) if this
     * player already has a settlement here.
     */
    async foundStartingSettlementLive(ownerId: string, ownerName: string, realmName: string, near: AxialCoord) {
      if (!this.worldId) throw new Error('bootstrapLiveWorld() must run before founding a settlement');
      // Bootstrap's own snapshot can be stale by the time the player
      // actually clicks — re-sync who else has founded here first so
      // nearestStartPosition doesn't send this request at a plot someone
      // else claimed in the meantime.
      await this.refreshWorldSettlements();
      const start = this.nearestStartPosition(near);
      if (!start) throw new Error('No unclaimed start positions in this world yet');

      const response = await api.foundSettlement(this.worldId, {
        islandId: start.islandId,
        q: start.at.q,
        r: start.at.r,
        name: realmName,
        ownerName,
        ownerId,
      });

      const settlement = this.model.registerSettlement({
        id: response.id,
        ownerId,
        ownerName: response.ownerName,
        name: response.name,
        q: response.q,
        r: response.r,
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        foundedAt: Date.now(),
        islandId: response.islandId,
      });
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      return settlement;
    },
    /**
     * Live mode: queues a building against the backend rather than placing
     * it locally and instantly (`WorldModel.placeBuilding`). The building
     * only appears once its build order completes and the next poll
     * (`refreshLiveSettlement`) picks it up — matching how the backend's
     * build queue actually works (docs/tech/backend.md, "Everything is
     * lazy"). Throws `ApiError` on rejection (e.g. not enough resources);
     * callers decide how to surface that.
     */
    async queueBuildLive(building: string, at: AxialCoord) {
      if (!this.selectedSettlementId) throw new Error('No settlement selected');
      await api.queueBuild(this.selectedSettlementId, { building, q: at.q, r: at.r });
      await this.refreshLiveSettlement();
    },
    /** Pulls the settlement's current resources/level/buildings from the backend. No-op in demo mode. */
    async refreshLiveSettlement() {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      const response = await api.getSettlement(this.selectedSettlementId);
      this.model.applyServerSnapshot(response.id, {
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        buildings: response.buildings,
      });
      this.hud.queue = response.queue;
      this.hud.queueFetchedAt = Date.now();
      this.syncHud();
    },
    /**
     * Live mode: rehydrates `selectedSettlementId`/`WorldModel` after a page
     * reload, using the settlement id `stores/player.ts` persisted. Without
     * this, `hasFoundedSettlement` (and thus the router's `/settlement`
     * guard) surviving a reload while the `WorldModel` itself starts empty
     * would strand the player on a blank settlement view. A no-op if this
     * settlement is already loaded, and in demo mode (nothing is persisted
     * there — see `stores/player.ts`).
     */
    async restoreLiveSettlement(ownerId: string, settlementId: string) {
      if (DEMO_MODE || this.selectedSettlementId === settlementId) return;
      await this.bootstrapLiveWorld();
      const response = await api.getSettlement(settlementId);
      this.model.registerSettlement({
        id: response.id,
        ownerId,
        ownerName: response.ownerName,
        name: response.name,
        q: response.q,
        r: response.r,
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        foundedAt: Date.now(),
        islandId: response.islandId,
      });
      this.selectedSettlementId = response.id;
      this.syncHud();
    },
    /**
     * Live mode: pulls every settlement in the world (not just this
     * player's) so rival realms — their border, marker and owner-name label
     * — show up on the world map, matching `prototypes/worldmap`'s `marks`.
     * Registered with the settlement's own id as its `ownerId`, which can
     * never equal the local player's id, so it always renders as a rival.
     */
    async refreshWorldSettlements() {
      if (DEMO_MODE || !this.worldId) return;
      const summaries = await api.listSettlements(this.worldId);
      for (const summary of summaries) {
        if (summary.id === this.selectedSettlementId) continue;
        this.model.registerSettlement({
          id: summary.id,
          ownerId: summary.id,
          ownerName: summary.ownerName,
          name: summary.name,
          q: summary.q,
          r: summary.r,
          level: summary.longhouseLevel,
          resources: emptyResources(),
          rates: emptyResources(),
          foundedAt: Date.now(),
        });
      }
    },
    syncHud() {
      const settlement = this.selectedSettlementId
        ? this.model.getSettlement(this.selectedSettlementId)
        : undefined;
      if (!settlement) return;
      this.hud.resources = { ...settlement.resources };
      this.hud.rates = { ...settlement.rates };
      this.hud.settlementName = settlement.name;
      this.hud.level = settlement.level;
      this.hud.buildingsPlaced = this.model.countBuildings(settlement.id);
      this.hud.population = this.model.populationFor(settlement.id);
      this.hud.tick += 1;
    },
    startHudSync() {
      this.stopHudSync();
      this.syncHud();
      this.syncHandle = setInterval(() => this.syncHud(), 1000);
      if (!DEMO_MODE) {
        void this.refreshLiveSettlement();
        void this.refreshWorldSettlements();
        this.livePollHandle = setInterval(() => {
          void this.refreshLiveSettlement();
          void this.refreshWorldSettlements();
        }, LIVE_POLL_MS);
      }
    },
    stopHudSync() {
      if (this.syncHandle) clearInterval(this.syncHandle);
      this.syncHandle = null;
      if (this.livePollHandle) clearInterval(this.livePollHandle);
      this.livePollHandle = null;
    },
  },
});
