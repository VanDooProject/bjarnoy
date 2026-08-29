import { defineStore } from 'pinia';
import { api } from '../api/client';
import type { BuildingDefinitionResponse } from '../api/types';
import { DEMO_MODE } from '../config';

// The catalogue is currently identical for every world (BuildingCatalogue.cs
// is static, not per-world data), so this store fetches it once and caches
// it for the session rather than scoping it by worldId.
export type CatalogueSource = 'live' | 'fallback';

export const useBuildingCatalogueStore = defineStore('buildingCatalogue', {
  state: () => ({
    definitions: [] as BuildingDefinitionResponse[],
    source: null as CatalogueSource | null,
    /** When `source === 'fallback'`, when that bundled snapshot was generated. */
    generatedAt: null as string | null,
    loading: false,
    error: null as string | null,
  }),
  getters: {
    // Grouped and level-sorted so consumers (the tech-tree page today, a
    // build menu or tooltip later) never re-derive this themselves.
    byType(state): Record<string, BuildingDefinitionResponse[]> {
      const grouped: Record<string, BuildingDefinitionResponse[]> = {};
      for (const definition of state.definitions) {
        (grouped[definition.type] ??= []).push(definition);
      }
      for (const list of Object.values(grouped)) {
        list.sort((a, b) => a.level - b.level);
      }
      return grouped;
    },
    types(): string[] {
      return Object.keys(this.byType).sort();
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
        this.definitions = await api.getBuildingCatalogue();
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
      const module = await import('../data/building-catalogue.json');
      this.definitions = module.default.data as BuildingDefinitionResponse[];
      this.generatedAt = module.default._meta.generatedAt;
      this.source = 'fallback';
    },
  },
});
