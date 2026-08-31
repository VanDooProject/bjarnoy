import { defineStore } from 'pinia';
import { api, ApiError } from '../api/client';
import type { AdminWorldResponse } from '../api/types';

const SELECTED_WORLD_KEY = 'bjarnoy.admin.selectedWorldId';

// Backs the world selector in AdminLayout.vue's header (issue #114, split out
// of #105's admin-ui world-selector bullet): the one piece of shared state
// every world-scoped admin tab (today: Settlements) reads instead of each
// having its own free-text "world id" filter. Selection is required — there
// is deliberately no "all worlds" value — and persists across reloads the
// same way stores/auth.ts persists its refresh token.
export const useAdminWorldStore = defineStore('adminWorld', {
  state: () => ({
    worlds: [] as AdminWorldResponse[],
    selectedWorldId: localStorage.getItem(SELECTED_WORLD_KEY),
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async loadWorlds() {
      this.loading = true;
      this.error = null;
      try {
        this.worlds = await api.adminListWorlds();
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : 'Could not load worlds.';
        return;
      } finally {
        this.loading = false;
      }

      // A persisted selection that no longer names a real world (deleted, or
      // from a stale/different environment's localStorage) is not a valid
      // choice; neither is having none at all while worlds exist. Both fall
      // back to the first world in the list, same as picking one fresh.
      if (!this.worlds.some((w) => w.id === this.selectedWorldId)) {
        this.selectWorld(this.worlds[0]?.id ?? null);
      }
    },
    selectWorld(worldId: string | null) {
      this.selectedWorldId = worldId;
      if (worldId) {
        localStorage.setItem(SELECTED_WORLD_KEY, worldId);
      } else {
        localStorage.removeItem(SELECTED_WORLD_KEY);
      }
    },
  },
});
