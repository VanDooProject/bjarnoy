import { defineStore } from 'pinia';
import { api } from '../api/client';
import { DEMO_MODE } from '../config';
export const useUnitCatalogueStore = defineStore('unitCatalogue', {
    state: () => ({
        definitions: [],
        source: null,
        /** When `source === 'fallback'`, when that bundled snapshot was generated. */
        generatedAt: null,
        loading: false,
        error: null,
    }),
    getters: {
        // Indexed by wire type name so components can look up "the Spearman
        // definition" directly instead of scanning the array themselves.
        byType(state) {
            const byType = {};
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
            if (this.definitions.length > 0 || this.loading)
                return;
            this.loading = true;
            this.error = null;
            try {
                if (DEMO_MODE) {
                    await this.loadFallback();
                    return;
                }
                this.definitions = await api.getUnitCatalogue();
                this.source = 'live';
            }
            catch {
                await this.loadFallback();
            }
            finally {
                this.loading = false;
            }
        },
        async loadFallback() {
            // Dynamic import so the snapshot only lands in a chunk actually
            // reached (demo mode, or a live fetch failure) rather than always.
            const module = await import('../data/unit-catalogue.json');
            this.definitions = module.default.data;
            this.generatedAt = module.default._meta.generatedAt;
            this.source = 'fallback';
        },
    },
});
