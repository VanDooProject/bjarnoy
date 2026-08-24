import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { WorldModel } from '../lib/map/WorldModel';
import type { AxialCoord } from '../lib/hex/coords';
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
  }),
  actions: {
    foundStartingSettlement(ownerId: string, name: string, near: AxialCoord) {
      const at = this.model.findLandfall(near) ?? near;
      const settlement = this.model.foundSettlement(ownerId, name, at);
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
