import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

const definitionsFixture = [
  { type: 'thrall', class: 'civilian', requiredLonghouseLevel: 1, trainingCost: { wood: 60, stone: 30, food: 25, iron: 15 } },
  { type: 'spearman', class: 'infantry', requiredLonghouseLevel: 1, trainingCost: { wood: 80, stone: 40, food: 20, iron: 40 } },
];

const getUnitCatalogue = vi.fn();

// `config.ts` and the store both need re-importing fresh per test (via
// resetModules) since DEMO_MODE is a module-level constant baked in at
// import time, not something the store re-reads per call.
async function loadStoreModule(demoMode: boolean) {
  vi.resetModules();
  vi.doMock('../config', () => ({ DEMO_MODE: demoMode }));
  vi.doMock('../api/client', () => ({
    api: { getUnitCatalogue: (...args: unknown[]) => getUnitCatalogue(...args) },
  }));
  vi.doMock('../data/unit-catalogue.json', () => ({
    default: { _meta: { generatedAt: '2026-01-01T00:00:00.000Z' }, data: [definitionsFixture[0]] },
  }));
  const { useUnitCatalogueStore } = await import('./unitCatalogue');
  setActivePinia(createPinia());
  return useUnitCatalogueStore();
}

describe('useUnitCatalogueStore', () => {
  it('loads from the live API and indexes definitions by type', async () => {
    getUnitCatalogue.mockReset();
    getUnitCatalogue.mockResolvedValue(definitionsFixture);
    const store = await loadStoreModule(false);

    await store.load();

    expect(store.source).toBe('live');
    expect(store.byType.thrall?.requiredLonghouseLevel).toBe(1);
    expect(store.byType.spearman?.trainingCost.iron).toBe(40);
  });

  it('falls back to the bundled snapshot when the live API call fails', async () => {
    getUnitCatalogue.mockReset();
    getUnitCatalogue.mockImplementation(async () => {
      throw new Error('network down');
    });
    const store = await loadStoreModule(false);

    await store.load();

    expect(store.source).toBe('fallback');
    expect(store.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(store.definitions).toHaveLength(1);
  });

  it('never calls the live API in demo mode, using the bundled snapshot instead', async () => {
    getUnitCatalogue.mockReset();
    const store = await loadStoreModule(true);

    await store.load();

    expect(getUnitCatalogue).not.toHaveBeenCalled();
    expect(store.source).toBe('fallback');
  });

  it('does not re-fetch on a second load() once definitions are cached', async () => {
    getUnitCatalogue.mockReset();
    getUnitCatalogue.mockResolvedValue(definitionsFixture);
    const store = await loadStoreModule(false);

    await store.load();
    await store.load();

    expect(getUnitCatalogue).toHaveBeenCalledTimes(1);
  });
});
