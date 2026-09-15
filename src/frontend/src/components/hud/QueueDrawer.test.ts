// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QueueDrawer from './QueueDrawer.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse, TrainingOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountDrawer(props: { open?: boolean } = {}) {
  return mount(QueueDrawer, {
    props: { open: props.open ?? false },
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

function buildOrder(overrides: Partial<BuildOrderResponse> = {}): BuildOrderResponse {
  return {
    id: 'order-1',
    q: 1,
    r: 2,
    building: 'farm',
    targetLevel: 1,
    state: 'building',
    slotCost: 1,
    completesAtGameTime: '2026-01-01T00:00:00Z',
    completesInSeconds: 100,
    totalSeconds: 100,
    ...overrides,
  };
}

function trainingOrder(overrides: Partial<TrainingOrderResponse> = {}): TrainingOrderResponse {
  return {
    id: 'training-1',
    unit: 'spearman',
    count: 5,
    completedCount: 0,
    completesAtGameTime: '2026-01-01T00:00:00Z',
    completesInSeconds: 100,
    totalSeconds: 100,
    ...overrides,
  };
}

describe('QueueDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('renders nothing when there is no build/training/garrison/guest data', () => {
    const wrapper = mountDrawer();
    expect(wrapper.find('.queue-drawer').exists()).toBe(false);
  });

  it('shows only the soonest-to-finish build order on the collapsed rail, plus a +N more chip', () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      buildOrder({ id: 'slow', completesInSeconds: 500, totalSeconds: 500, q: 1, r: 1 }),
      buildOrder({ id: 'fast', completesInSeconds: 50, totalSeconds: 50, q: 2, r: 2 }),
      buildOrder({ id: 'medium', completesInSeconds: 200, totalSeconds: 200, q: 3, r: 3 }),
    ];

    const wrapper = mountDrawer();
    const rail = wrapper.get('.queue-drawer-rail');
    expect(rail.findAll('.rail-row-name')).toHaveLength(1);
    expect(rail.get('.rail-row-time').text()).toBe('0:50');
    expect(rail.get('.rail-row-more').text()).toBe('+2 more');
  });

  it('falls back to the first waiting order when every build order is waiting', () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      buildOrder({ id: 'w1', state: 'waiting', completesAtGameTime: null, completesInSeconds: null }),
      buildOrder({ id: 'w2', state: 'waiting', completesAtGameTime: null, completesInSeconds: null }),
    ];

    const wrapper = mountDrawer();
    const rail = wrapper.get('.queue-drawer-rail');
    expect(rail.findAll('.rail-row-name')).toHaveLength(1);
    expect(rail.text()).toContain('Waiting for a slot');
  });

  it('omits a category row on the rail when that queue is empty', () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const rail = wrapper.get('.queue-drawer-rail');
    expect(rail.findAll('.rail-row')).toHaveLength(1);
  });

  it('clicking the rail opens the drawer', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    expect(wrapper.get('.queue-drawer').classes()).not.toContain('is-open');

    await wrapper.get('.queue-drawer-rail').trigger('click');

    expect(wrapper.emitted('update:open')).toEqual([[true]]);
  });

  it('clicking a build row emits select with its coord and closes the drawer', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ q: 4, r: 5 })];

    const wrapper = mountDrawer({ open: true });
    await wrapper.get('.status-row-click').trigger('click');

    expect(wrapper.emitted('select')).toEqual([[{ q: 4, r: 5 }]]);
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
  });

  it('shows the garrison and guest sections', () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 12 }];
    world.model.registerSettlement({
      id: 'owner-1',
      ownerId: 'owner-1',
      ownerName: 'Ragnar',
      name: 'Bjørnstad',
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
    });
    world.guestArmies = [
      {
        armyId: 'guest-1',
        ownerSettlementId: 'owner-1',
        totalUpkeepPerHour: 0,
        stacks: [{ unit: 'spearman', count: 3 }],
      },
    ];

    const wrapper = mountDrawer({ open: true });
    expect(wrapper.text()).toContain('Garrison');
    expect(wrapper.text()).toContain('Guests');
  });
});
