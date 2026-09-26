// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QueueDrawer from './QueueDrawer.vue';
import { useWorldStore } from '../../stores/world';
import type { ArmyResponse, BuildOrderResponse, TrainingOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

const { recallArmy } = vi.hoisted(() => ({ recallArmy: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, recallArmy } };
});

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

function army(overrides: Partial<ArmyResponse> = {}): ArmyResponse {
  return {
    id: 'army-1',
    settlementId: 'settlement-1',
    mission: 'move',
    targetSettlementId: null,
    atHome: false,
    supporting: false,
    position: { q: 1, r: 1 },
    provisions: 10,
    totalSpeed: 4,
    totalUpkeepPerHour: 2,
    stacks: [{ unit: 'spearman', count: 10 }],
    movement: {
      departedAt: '2026-01-01T00:00:00Z',
      path: [{ q: 0, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 2 }],
      cumulativeHours: [0, 1, 2],
      arrivesAt: '2026-01-01T02:00:00Z',
      returnPath: [],
      returnCumulativeHours: [],
      turnAroundAt: '2026-01-01T02:00:00Z',
      returnArrivesAt: '2026-01-01T04:00:00Z',
      isReturning: false,
    },
    ...overrides,
  };
}

describe('QueueDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    recallArmy.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('renders nothing when there is no build/training/garrison/guest data', () => {
    const wrapper = mountDrawer();
    expect(wrapper.find('.queue-drawer').exists()).toBe(false);
  });

  it('shows a badge with the total build+training order count', () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      buildOrder({ id: 'slow', completesInSeconds: 500, totalSeconds: 500, q: 1, r: 1 }),
      buildOrder({ id: 'fast', completesInSeconds: 50, totalSeconds: 50, q: 2, r: 2 }),
    ];
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle');
    expect(handle.get('.queue-drawer-badge').text()).toBe('3');
  });

  it('omits the badge when only the garrison has entries', () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 12 }];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle');
    expect(handle.find('.queue-drawer-badge').exists()).toBe(false);
  });

  it('the progress bar fill matches the soonest active order across both queues', () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      // Waiting — excluded even though it would otherwise look "soonest".
      buildOrder({ id: 'waiting', state: 'waiting', completesAtGameTime: null, completesInSeconds: null }),
      buildOrder({ id: 'slow', completesInSeconds: 500, totalSeconds: 500, q: 1, r: 1 }),
    ];
    world.hud.trainingQueueFetchedAt = Date.now();
    // Soonest active order overall: 80/100 done, 20s remaining.
    world.hud.trainingQueue = [trainingOrder({ completesInSeconds: 20, totalSeconds: 100 })];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle');
    expect(handle.get('.queue-drawer-handle-progress-fill').attributes('style')).toContain('height: 80%');
  });

  it('renders no progress bar when nothing is active', () => {
    const world = useWorldStore();
    world.hud.garrison = [{ unit: 'spearman', count: 12 }];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle');
    expect(handle.find('.queue-drawer-handle-progress').exists()).toBe(false);
  });

  it('clicking the handle opens the drawer', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    expect(wrapper.get('.queue-drawer').classes()).not.toContain('is-open');

    await wrapper.get('.queue-drawer-handle').trigger('click');

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

  function stubPointerCapture(el: HTMLElement) {
    (el as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn();
    (el as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = vi.fn(() => false);
    (el as unknown as { releasePointerCapture: () => void }).releasePointerCapture = vi.fn();
  }

  it('dragging the handle past the open threshold opens the drawer', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle').element as HTMLElement;
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 0, pointerId: 1 }));

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true]);
  });

  it('a short drag below the threshold snaps back without opening', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle').element as HTMLElement;
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 30, clientY: 0, pointerId: 1 }));

    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('a small, quick pointer tap toggles the drawer, same as a click', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle').element as HTMLElement;
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 2, clientY: 1, pointerId: 1 }));

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true]);
  });

  it('bails out of the drawer drag when the gesture is more vertical than horizontal', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer();
    const handle = wrapper.get('.queue-drawer-handle').element as HTMLElement;
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 60, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 60, pointerId: 1 }));

    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('Escape closes an open drawer', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder()];

    const wrapper = mountDrawer({ open: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:open')).toEqual([[false]]);
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

  // Issue: mobile army dispatch.
  describe('Armies section', () => {
    it('keeps the drawer mounted for armies alone, sorted by soonest ETA', () => {
      const world = useWorldStore();
      world.armies = [
        army({ id: 'far', movement: { ...army().movement!, arrivesAt: '2026-01-01T05:00:00Z' } }),
        army({ id: 'near', movement: { ...army().movement!, arrivesAt: '2026-01-01T01:00:00Z' } }),
        army({ id: 'guest', supporting: true, movement: null }),
      ];

      const wrapper = mountDrawer({ open: true });
      expect(wrapper.find('.queue-drawer').exists()).toBe(true);
      expect(wrapper.text()).toContain('Armies');

      const etas = wrapper.findAll('.army-row .status-row-time').map((n) => n.text());
      // near (1h out) sorts before far (5h out); the supporting army (no
      // active leg, so no ETA) sorts last regardless.
      expect(etas).toEqual(['1h 0m', '5h 0m', '—']);
    });

    it('Recall calls recallArmyLive', async () => {
      const world = useWorldStore();
      world.armies = [army({ id: 'army-1' })];

      const wrapper = mountDrawer({ open: true });
      await wrapper.get('.army-row .recall').trigger('click');
      await Promise.resolve();
      await Promise.resolve();

      expect(recallArmy).toHaveBeenCalledWith('army-1', undefined);
    });

    it('a row tap closes the drawer and emits select-army', async () => {
      const world = useWorldStore();
      world.armies = [army({ id: 'army-1' })];

      const wrapper = mountDrawer({ open: true });
      await wrapper.get('.army-row .status-row-click').trigger('click');

      expect(wrapper.emitted('select-army')).toEqual([['army-1']]);
      expect(wrapper.emitted('update:open')).toEqual([[false]]);
    });

    it('build and training sections stay unaffected by the Armies section', () => {
      const world = useWorldStore();
      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [buildOrder()];
      world.armies = [army({ id: 'army-1' })];

      const wrapper = mountDrawer({ open: true });
      expect(wrapper.text()).toContain('Construction');
      expect(wrapper.text()).toContain('Armies');
    });
  });
});
