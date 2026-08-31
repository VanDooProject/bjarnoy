// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSettlementsView from './AdminSettlementsView.vue';
import { useAdminWorldStore } from '../../stores/adminWorld';
import type {
  AdminSettlementLayoutResponse,
  AdminSettlementSummary,
  SettlementResponse,
  UnitDefinitionResponse,
} from '../../api/types';

const {
  adminSearchSettlements,
  adminGetSettlement,
  adminGrantResources,
  adminGetSettlementLayout,
  adminPlaceBuilding,
  adminRazeBuilding,
  adminCompleteQueues,
  adminAdjustGarrison,
  adminListArmies,
  getUnitCatalogue,
} = vi.hoisted(() => ({
  adminSearchSettlements: vi.fn(),
  adminGetSettlement: vi.fn(),
  adminGrantResources: vi.fn(),
  adminGetSettlementLayout: vi.fn(),
  adminPlaceBuilding: vi.fn(),
  adminRazeBuilding: vi.fn(),
  adminCompleteQueues: vi.fn(),
  adminAdjustGarrison: vi.fn(),
  adminListArmies: vi.fn(),
  getUnitCatalogue: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: {
      adminSearchSettlements,
      adminGetSettlement,
      adminGrantResources,
      adminGetSettlementLayout,
      adminPlaceBuilding,
      adminRazeBuilding,
      adminCompleteQueues,
      adminAdjustGarrison,
      adminListArmies,
      getUnitCatalogue,
    },
  };
});

function summary(overrides: Partial<AdminSettlementSummary> = {}): AdminSettlementSummary {
  return {
    id: 'settlement-1',
    worldId: 'world-1',
    worldName: 'Midgard',
    name: 'Bjornstad',
    ownerName: 'Ragnar',
    q: 0,
    r: 0,
    longhouseLevel: 1,
    ...overrides,
  };
}

function detail(overrides: Partial<SettlementResponse> = {}): SettlementResponse {
  return {
    id: 'settlement-1',
    worldId: 'world-1',
    islandId: 'island-1',
    name: 'Bjornstad',
    ownerName: 'Ragnar',
    q: 0,
    r: 0,
    longhouseLevel: 1,
    claimRadius: 1,
    resources: {
      stock: { wood: 300, stone: 200, food: 150, iron: 50 },
      ratePerHour: { wood: 10, stone: 5, food: 8, iron: 2 },
      capacity: { wood: 1000, stone: 1000, food: 1000, iron: 1000 },
    },
    buildings: [{ q: 0, r: 0, type: 'longhouse', level: 1 }],
    queue: [],
    garrison: [],
    trainingQueue: [],
    runes: [],
    world: { state: 'running', running: true, acceptsCommands: true, gameTime: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
}

function layout(overrides: Partial<AdminSettlementLayoutResponse> = {}): AdminSettlementLayoutResponse {
  return {
    settlementId: 'settlement-1',
    claimRadius: 1,
    hexes: [
      { q: 0, r: 0, terrain: 'grass', isCoastalWater: false, building: 'longhouse', level: 1, isCentre: true },
      { q: 1, r: 0, terrain: 'grass', isCoastalWater: false, building: null, level: null, isCentre: false },
      { q: 0, r: 1, terrain: 'forest', isCoastalWater: false, building: null, level: null, isCentre: false },
    ],
    buildingTypes: ['longhouse', 'farm', 'lumberjack'],
    maxLevel: 10,
    ...overrides,
  };
}

/** Opens the first row's management panel, with every child panel's fetch stubbed. */
async function openDetail(detailResponse = detail()) {
  adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });
  adminGetSettlement.mockResolvedValue(detailResponse);
  adminGetSettlementLayout.mockResolvedValue(layout());
  adminListArmies.mockResolvedValue([]);
  getUnitCatalogue.mockResolvedValue([
    { type: 'spearman' },
    { type: 'thrall' },
  ] as UnitDefinitionResponse[]);

  const wrapper = mount(AdminSettlementsView);
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text() === 'Manage')!.trigger('click');
  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  // AdminSettlementsView only searches once a world is selected — normally
  // set by AdminLayout's header selector, which this view is mounted without
  // here. Seed it directly, same as a returning admin's persisted selection.
  useAdminWorldStore().selectedWorldId = 'world-1';
});

describe('AdminSettlementsView', () => {
  it('lists settlements from a search scoped to the selected world', async () => {
    adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });

    const wrapper = mount(AdminSettlementsView);
    await flushPromises();

    expect(adminSearchSettlements).toHaveBeenCalledWith(
      expect.objectContaining({ worldId: 'world-1' }),
    );
    expect(wrapper.text()).toContain('Bjornstad');
    expect(wrapper.text()).toContain('Ragnar');
    expect(wrapper.text()).toContain('Midgard');
  });

  it('shows a hint instead of searching when no world is selected', async () => {
    useAdminWorldStore().selectedWorldId = null;

    const wrapper = mount(AdminSettlementsView);
    await flushPromises();

    expect(adminSearchSettlements).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Select a world above');
  });

  it('re-searches when the selected world changes', async () => {
    adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });
    const adminWorld = useAdminWorldStore();

    mount(AdminSettlementsView);
    await flushPromises();
    expect(adminSearchSettlements).toHaveBeenCalledTimes(1);

    adminWorld.selectedWorldId = 'world-2';
    await flushPromises();

    expect(adminSearchSettlements).toHaveBeenCalledTimes(2);
    expect(adminSearchSettlements).toHaveBeenLastCalledWith(
      expect.objectContaining({ worldId: 'world-2' }),
    );
  });

  it('expands a row into the full god-mode panel', async () => {
    const wrapper = await openDetail();

    expect(adminGetSettlement).toHaveBeenCalledWith('settlement-1');
    expect(wrapper.text()).toContain('Grant resources');
    expect(wrapper.text()).toContain('Create troops');
    expect(wrapper.text()).toContain('Settlement editor');
    expect(wrapper.text()).toContain('Armies');
    expect(wrapper.text()).toContain('Wood 300');
  });

  it('applies a resource grant and reflects the updated stock in the detail panel', async () => {
    adminGrantResources.mockResolvedValue(
      detail({ resources: { ...detail().resources, stock: { wood: 800, stone: 200, food: 150, iron: 50 } } }),
    );

    const wrapper = await openDetail();

    const woodInput = wrapper.find('.grant-form').findAll('input[type="number"]')[0]!;
    await woodInput.setValue(500);
    await wrapper.find('.grant-form').trigger('submit');
    await flushPromises();

    expect(adminGrantResources).toHaveBeenCalledWith('settlement-1', { wood: 500, stone: 0, food: 0, iron: 0 });
    expect(wrapper.text()).toContain('Wood 800');
  });

  it('creates troops straight into the garrison', async () => {
    adminAdjustGarrison.mockResolvedValue(detail({ garrison: [{ unit: 'spearman', count: 10 }] }));

    const wrapper = await openDetail();

    // The unit roster is fetched asynchronously, so wait for the option to
    // actually exist rather than assuming a fixed number of ticks — that
    // assumption held locally and lost the race on CI.
    await vi.waitFor(() => {
      expect(wrapper.findAll('.garrison-form option').length).toBeGreaterThan(0);
    });

    await wrapper.find('.garrison-form select').setValue('spearman');
    await wrapper.find('.garrison-form').trigger('submit');
    await flushPromises();

    expect(adminAdjustGarrison).toHaveBeenCalledWith('settlement-1', { unit: 'spearman', count: 10 });
    expect(wrapper.text()).toContain('spearman 10');
  });

  it('places a building on a clicked hex and updates the row', async () => {
    adminPlaceBuilding.mockResolvedValue(
      detail({ buildings: [...detail().buildings, { q: 1, r: 0, type: 'farm', level: 5 }] }),
    );

    const wrapper = await openDetail();

    await wrapper.find('polygon[data-hex="1,0"]').trigger('click');
    await wrapper.find('.hex-form select').setValue('farm');
    await wrapper.find('.hex-form input[type="number"]').setValue(5);
    await wrapper.findAll('.hex-form button').find((b) => b.text() === 'Apply')!.trigger('click');
    await flushPromises();

    expect(adminPlaceBuilding).toHaveBeenCalledWith('settlement-1', 1, 0, { building: 'farm', level: 5 });
  });

  it('razes the building standing on a clicked hex', async () => {
    adminRazeBuilding.mockResolvedValue(detail());

    const wrapper = await openDetail();

    await wrapper.find('polygon[data-hex="0,0"]').trigger('click');
    await wrapper.findAll('.hex-form button').find((b) => b.text() === 'Raze')!.trigger('click');
    await flushPromises();

    expect(adminRazeBuilding).toHaveBeenCalledWith('settlement-1', 0, 0);
  });

  it('finishes the queue instantly and reports what it built', async () => {
    const queued = detail({
      queue: [{
        id: 'order-1',
        q: 1,
        r: 0,
        building: 'farm',
        targetLevel: 1,
        completesAtGameTime: '2026-01-01T01:00:00Z',
        completesInSeconds: 3600,
        totalSeconds: 3600,
      }],
    });
    adminCompleteQueues.mockResolvedValue({
      completedBuilds: 1,
      completedTraining: 0,
      settlement: detail({ buildings: [...detail().buildings, { q: 1, r: 0, type: 'farm', level: 1 }] }),
    });

    const wrapper = await openDetail(queued);

    await wrapper.find('button.insta').trigger('click');
    await flushPromises();

    expect(adminCompleteQueues).toHaveBeenCalledWith('settlement-1', { builds: true, training: true });
    expect(wrapper.text()).toContain('Finished 1 build(s)');
  });

  it('leaves the instant-build button disabled when nothing is queued', async () => {
    const wrapper = await openDetail();

    const button = wrapper.find('button.insta');
    expect(button.text()).toContain('Nothing queued');
    expect(button.attributes('disabled')).toBeDefined();
  });
});
