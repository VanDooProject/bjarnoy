import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { api } from '../api/client';
import type { IslandResponse } from '../api/types';
import { DEMO_MODE } from '../config';
import { hexDistance, type AxialCoord } from '../lib/hex/coords';
import { WorldModel } from '../lib/map/WorldModel';
import type { Resources } from '../lib/map/types';
import { emptyResources } from '../lib/map/types';

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
    },
    syncHandle: null as ReturnType<typeof setInterval> | null,
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
      if (!world) {
        const worlds = await api.listWorlds();
        world = worlds.find((w) => w.status === 'running') ?? null;
      }
      if (!world) {
        world = await api.createWorld({ name: 'Kettil Sea' });
      }

      this.worldId = world.id;
      localStorage.setItem('bjarnoy.worldId', world.id);
      this.model = markRaw(new WorldModel(world.seed));
      this.islands = await api.getIslands(world.id);
      this.liveReady = true;
    },
    /** Nearest island start position to `near`, for founding via the API. */
    nearestStartPosition(near: AxialCoord): { islandId: string; at: AxialCoord } | null {
      let best: { islandId: string; at: AxialCoord; distance: number } | null = null;
      for (const island of this.islands) {
        for (const pos of island.startPositions) {
          const distance = hexDistance(near, pos);
          if (!best || distance < best.distance) {
            best = { islandId: island.id, at: pos, distance };
          }
        }
      }
      return best;
    },
    /** Demo mode: found instantly in the local `WorldModel`, no server round trip. */
    foundStartingSettlement(ownerId: string, name: string, near: AxialCoord) {
      const at = this.model.findLandfall(near) ?? near;
      const settlement = this.model.foundSettlement(ownerId, name, at);
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      return settlement;
    },
    /**
     * Live mode: the backend is the source of truth for the settlement's id
     * and starting stock. The result is mirrored into the local `WorldModel`
     * via `registerSettlement` so the renderer, HUD and settlement view work
     * exactly as they do in demo mode from this point on.
     */
    async foundStartingSettlementLive(ownerName: string, realmName: string, near: AxialCoord) {
      if (!this.worldId) throw new Error('bootstrapLiveWorld() must run before founding a settlement');
      const start = this.nearestStartPosition(near);
      if (!start) throw new Error('No known start positions in this world yet');

      const response = await api.foundSettlement(this.worldId, {
        islandId: start.islandId,
        q: start.at.q,
        r: start.at.r,
        name: realmName,
        ownerName,
      });

      const settlement = this.model.registerSettlement({
        id: response.id,
        ownerId: response.id,
        name: response.name,
        q: response.q,
        r: response.r,
        level: response.longhouseLevel,
        resources: {
          wood: response.resources.stock.wood,
          stone: response.resources.stock.stone,
          food: response.resources.stock.grain,
          iron: response.resources.stock.silver,
        },
        rates: {
          wood: response.resources.ratePerHour.wood,
          stone: response.resources.ratePerHour.stone,
          food: response.resources.ratePerHour.grain,
          iron: response.resources.ratePerHour.silver,
        },
        foundedAt: Date.now(),
      });
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      return settlement;
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
    },
    startHudSync() {
      this.stopHudSync();
      this.syncHud();
      this.syncHandle = setInterval(() => this.syncHud(), 1000);
    },
    stopHudSync() {
      if (this.syncHandle) clearInterval(this.syncHandle);
      this.syncHandle = null;
    },
  },
});
