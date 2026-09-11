// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HudQueueSummary from './HudQueueSummary.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse, TrainingOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountSummary() {
  return mount(HudQueueSummary, {
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

describe('HudQueueSummary', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('renders nothing for a queue with no slots', () => {
    const world = useWorldStore();
    world.hud.construction = { slots: 0, slotsUsed: 0, maxWaitingOrders: 0, waitingOrders: 0, maxOrdersPerHex: 1 };
    world.hud.trainingQueue = [];

    const wrapper = mountSummary();

    expect(wrapper.find('.summary-row').exists()).toBe(false);
  });

  it('shows the construction slot count and progress of the active order', () => {
    const world = useWorldStore();
    world.hud.construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 0, waitingOrders: 0, maxOrdersPerHex: 1 };
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ completesInSeconds: 40, totalSeconds: 100 })];

    const wrapper = mountSummary();

    const rows = wrapper.findAll('.summary-row');
    expect(rows[0].get('.summary-count').text()).toBe('2 / 3 slots');
    const style = rows[0].get('.summary-progress-fill').attributes('style') ?? '';
    expect(style).toContain('width: 60%');
  });

  it('shows the training slot count and progress of the active order', () => {
    const world = useWorldStore();
    world.hud.construction = { slots: 0, slotsUsed: 0, maxWaitingOrders: 0, waitingOrders: 0, maxOrdersPerHex: 1 };
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder({ completesInSeconds: 50, totalSeconds: 200 })];

    const wrapper = mountSummary();

    const row = wrapper.get('.summary-row');
    expect(row.get('.summary-count').text()).toBe('1 / 5 slots');
    const style = row.get('.summary-progress-fill').attributes('style') ?? '';
    expect(style).toContain('width: 75%');
  });
});
