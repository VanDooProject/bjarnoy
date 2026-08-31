// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSettlementsView from './AdminSettlementsView.vue';
import { useAdminWorldStore } from '../../stores/adminWorld';
import type { AdminSettlementSummary, SettlementResponse } from '../../api/types';

const { adminSearchSettlements, adminGetSettlement, adminGrantResources, adminSetBuildingLevel } = vi.hoisted(() => ({
  adminSearchSettlements: vi.fn(),
  adminGetSettlement: vi.fn(),
  adminGrantResources: vi.fn(),
  adminSetBuildingLevel: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminSearchSettlements, adminGetSettlement, adminGrantResources, adminSetBuildingLevel },
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
    claimRadius: 3,
    resources: {
      stock: { wood: 300, stone: 200, food: 150, iron: 50 },
      ratePerHour: { wood: 10, stone: 5, food: 8, iron: 2 },
      capacity: { wood: 1000, stone: 1000, food: 1000, iron: 1000 },
    },
    buildings: [{ q: 0, r: 0, type: 'Longhouse', level: 1 }],
    queue: [],
    garrison: [],
    trainingQueue: [],
    world: { state: 'running', running: true, acceptsCommands: true, gameTime: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
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

  it('expands a row into detail with the grant and set-level forms', async () => {
    adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });
    adminGetSettlement.mockResolvedValue(detail());

    const wrapper = mount(AdminSettlementsView);
    await flushPromises();

    await wrapper.findAll('button').find((b) => b.text() === 'Manage')!.trigger('click');
    await flushPromises();

    expect(adminGetSettlement).toHaveBeenCalledWith('settlement-1');
    expect(wrapper.text()).toContain('Grant resources');
    expect(wrapper.text()).toContain('Set building level');
    expect(wrapper.text()).toContain('Wood 300');
  });

  it('applies a resource grant and reflects the updated stock in the detail panel', async () => {
    adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });
    adminGetSettlement.mockResolvedValue(detail());
    adminGrantResources.mockResolvedValue(detail({ resources: { ...detail().resources, stock: { wood: 800, stone: 200, food: 150, iron: 50 } } }));

    const wrapper = mount(AdminSettlementsView);
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Manage')!.trigger('click');
    await flushPromises();

    const woodInput = wrapper.findAll('input[type="number"]')[0]!;
    await woodInput.setValue(500);
    await wrapper.find('.grant-form').trigger('submit');
    await flushPromises();

    expect(adminGrantResources).toHaveBeenCalledWith('settlement-1', { wood: 500, stone: 0, food: 0, iron: 0 });
    expect(wrapper.text()).toContain('Wood 800');
  });

  it('sets a building level and reflects the updated longhouse level in the row', async () => {
    adminSearchSettlements.mockResolvedValue({ items: [summary()], totalCount: 1, page: 1, pageSize: 25 });
    adminGetSettlement.mockResolvedValue(detail());
    adminSetBuildingLevel.mockResolvedValue(detail({ longhouseLevel: 4 }));

    const wrapper = mount(AdminSettlementsView);
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Manage')!.trigger('click');
    await flushPromises();

    const levelInput = wrapper.find('.level-form input[type="number"]');
    await levelInput.setValue(4);
    await wrapper.find('.level-form').trigger('submit');
    await flushPromises();

    expect(adminSetBuildingLevel).toHaveBeenCalledWith('settlement-1', 0, 0, { level: 4 });
    const row = wrapper.findAll('tbody tr')[0]!;
    expect(row.text()).toContain('4');
  });
});
