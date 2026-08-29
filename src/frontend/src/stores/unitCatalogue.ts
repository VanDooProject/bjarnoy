import { defineStore } from 'pinia';
import { api } from '../api/client';
import type { UnitDefinitionResponse } from '../api/types';
import { DEMO_MODE } from '../config';

// Mirrors stores/buildingCatalogue.ts exactly: the unit roster
// (UnitCatalogue.cs) is static data, identical for every world, so this
// fetches once and caches for the session rather than scoping by worldId.
export type CatalogueSource = 'live' | 'fallback';

export const useUnitCatalogueStore = defineStore('unitCatalogue', {
  state: () => ({
    definitions: [] as UnitDefinitionResponse[],
    source: null as CatalogueSource | null,
    /** When `source === 'fallback'`, when that bundled snapshot was generated. */
    generatedAt: null as string | null,
    loading: false,
    error: null as string | null,
  }),
  getters: {
    // Indexed by wire type name so components can look up "the Spearman
    // definition" directly instead of scanning the array themselves.
    byType(state): Record<string, UnitDefinitionResponse> {
      const byType: Record<string, UnitDefinitionResponse> = {};
      for (const definition of state.definitions) {
        byType[definition.type] = definition;
      }
      return byType;
    },
  },
  actions: {
    // Idempotent: repeat calls (e.g. a second view mounting) reuse the
    // already-loaded catalogue instead of re-fetching or re-importing.
    async load() {
      if (this.definitions.length > 0 || this.loading) return;

      this.loading = true;
      this.error = null;
      try {
        if (DEMO_MODE) {
          await this.loadFallback();
          return;
        }
        this.definitions = await api.getUnitCatalogue();
        this.source = 'live';
      } catch {
        await this.loadFallback();
      } finally {
        this.loading = false;
      }
    },
    async loadFallback() {
      // Dynamic import so the snapshot only lands in a chunk actually
      // reached (demo mode, or a live fetch failure) rather than always.
      const module = await import('../data/unit-catalogue.json');
      this.definitions = module.default.data as UnitDefinitionResponse[];
      this.generatedAt = module.default._meta.generatedAt;
      this.source = 'fallback';
    },
  },
});
