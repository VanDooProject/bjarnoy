import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

const definitionsFixture = [
  { type: 'lumberjack', level: 2, cost: { wood: 10, stone: 0, food: 0, iron: 0 } },
  { type: 'lumberjack', level: 1, cost: { wood: 5, stone: 0, food: 0, iron: 0 } },
  { type: 'farm', level: 1, cost: { wood: 0, stone: 0, food: 5, iron: 0 } },
];

const getBuildingCatalogue = vi.fn();

// `config.ts` and the store both need re-importing fresh per test (via
// resetModules) since DEMO_MODE is a module-level constant baked in at
// import time, not something the store re-reads per call.
async function loadStoreModule(demoMode: boolean) {
  vi.resetModules();
  vi.doMock('../config', () => ({ DEMO_MODE: demoMode }));
  vi.doMock('../api/client', () => ({
    api: { getBuildingCatalogue: (...args: unknown[]) => getBuildingCatalogue(...args) },
  }));
  vi.doMock('../data/building-catalogue.json', () => ({
    default: { _meta: { generatedAt: '2026-01-01T00:00:00.000Z' }, data: [definitionsFixture[2]] },
  }));
  const { useBuildingCatalogueStore } = await import('./buildingCatalogue');
  setActivePinia(createPinia());
  return useBuildingCatalogueStore();
}

describe('useBuildingCatalogueStore', () => {
  it('loads from the live API and groups/sorts definitions by type and level', async () => {
    getBuildingCatalogue.mockReset();
    getBuildingCatalogue.mockResolvedValue(definitionsFixture);
    const store = await loadStoreModule(false);

    await store.load();

    expect(store.source).toBe('live');
    expect(store.byType.lumberjack!.map((d) => d.level)).toEqual([1, 2]);
    expect(store.types).toEqual(['farm', 'lumberjack']);
  });

  it('falls back to the bundled snapshot when the live API call fails', async () => {
    getBuildingCatalogue.mockReset();
    getBuildingCatalogue.mockImplementation(async () => {
      throw new Error('network down');
    });
    const store = await loadStoreModule(false);

    await store.load();

    expect(store.source).toBe('fallback');
    expect(store.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(store.definitions).toHaveLength(1);
  });

  it('never calls the live API in demo mode, using the bundled snapshot instead', async () => {
    getBuildingCatalogue.mockReset();
    const store = await loadStoreModule(true);

    await store.load();

    expect(getBuildingCatalogue).not.toHaveBeenCalled();
    expect(store.source).toBe('fallback');
  });

  it('does not re-fetch on a second load() once definitions are cached', async () => {
    getBuildingCatalogue.mockReset();
    getBuildingCatalogue.mockResolvedValue(definitionsFixture);
    const store = await loadStoreModule(false);

    await store.load();
    await store.load();

    expect(getBuildingCatalogue).toHaveBeenCalledTimes(1);
  });
});
