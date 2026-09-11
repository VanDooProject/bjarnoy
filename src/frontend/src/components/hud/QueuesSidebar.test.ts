// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QueuesSidebar from './QueuesSidebar.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse, TrainingOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountSidebar() {
  return mount(QueuesSidebar, {
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
    id: 'train-1',
    unit: 'spearman',
    count: 10,
    completedCount: 4,
    completesAtGameTime: '2026-01-01T00:00:00Z',
    completesInSeconds: 100,
    totalSeconds: 200,
    ...overrides,
  };
}

// @vue/test-utils' `.trigger()` assigns extra props onto a plain MouseEvent
// after construction, but `clientX` is a getter-only property in jsdom — so
// it has to be supplied via the constructor's init dict instead.
function firePointer(wrapper: ReturnType<typeof mount>, el: Element, type: string, clientX: number) {
  el.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
  return wrapper.vm.$nextTick();
}

describe('QueuesSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('starts closed, and a tap on the edge tab opens then closes it', async () => {
    const wrapper = mountSidebar();

    const tab = wrapper.get('.queues-tab');
    expect(tab.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('.queues-sidebar').classes()).not.toContain('queues-sidebar--open');

    await firePointer(wrapper, tab.element, 'pointerdown', 400);
    await firePointer(wrapper, tab.element, 'pointerup', 400);
    expect(wrapper.get('.queues-sidebar').classes()).toContain('queues-sidebar--open');

    await wrapper.get('.back-button').trigger('click');
    expect(wrapper.get('.queues-sidebar').classes()).not.toContain('queues-sidebar--open');
  });

  it('opens on a real leftward drag past the threshold, hinged on the right edge', async () => {
    const wrapper = mountSidebar();
    const tab = wrapper.get('.queues-tab');

    await firePointer(wrapper, tab.element, 'pointerdown', 400);
    await firePointer(wrapper, tab.element, 'pointermove', 340); // dragging left, i.e. into the screen
    await firePointer(wrapper, tab.element, 'pointerup', 340);

    expect(wrapper.get('.queues-sidebar').classes()).toContain('queues-sidebar--open');
  });

  it('shows construction orders with the used/total slot count and per-order progress', () => {
    const world = useWorldStore();
    world.hud.construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0, maxOrdersPerHex: 1 };
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ completesInSeconds: 40, totalSeconds: 100 })];

    const wrapper = mountSidebar();

    const section = wrapper.findAll('.queue-section')[0];
    expect(section.get('.queue-section-count').text()).toBe('2 / 3 slots');
    expect(section.get('.queue-row-name').text()).toBe('Farm → 1');
    const style = section.get('.queue-progress-fill').attributes('style') ?? '';
    expect(style).toContain('width: 60%');
  });

  it('shows a waiting construction order with no progress bar', () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ state: 'waiting', completesInSeconds: null })];

    const wrapper = mountSidebar();

    const row = wrapper.get('.queue-row');
    expect(row.classes()).toContain('is-waiting');
    expect(row.get('.queue-row-time').text()).toBe('Waiting for a slot');
    expect(row.find('.queue-progress').exists()).toBe(false);
  });

  it('shows training orders and the garrison list', () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder({ completesInSeconds: 50, totalSeconds: 200 })];
    world.hud.garrison = [
      { unit: 'raider', count: 18 },
      { unit: 'shieldbearer', count: 6 },
      { unit: 'spearman', count: 0 },
    ];

    const wrapper = mountSidebar();

    const trainingSection = wrapper.findAll('.queue-section')[1];
    expect(trainingSection.get('.queue-section-count').text()).toBe('1 / 5 slots');
    expect(trainingSection.get('.queue-row-name').text()).toBe('10× Spearman');

    const garrisonRows = wrapper.findAll('.garrison-row');
    expect(garrisonRows).toHaveLength(2);
    expect(garrisonRows[0].text()).toContain('18');
  });

  it('shows the empty-garrison note when nothing is garrisoned', () => {
    const wrapper = mountSidebar();
    expect(wrapper.text()).toContain('No units standing here yet.');
  });
});
