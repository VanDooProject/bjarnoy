// @vitest-environment jsdom
//
// Covers the monotonic-progress clamp (issue #99) and the poll-reset case
// directly against the shared composable — BuildQueuePanel.test.ts and
// TrainingQueuePanel.test.ts remain the regression net for the panels
// themselves and are left untouched.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { formatCountdown, useBuildOrders, useTrainingOrders } from './useQueueOrders';
import { useWorldStore } from '../stores/world';
import type { BuildOrderResponse, TrainingOrderResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';

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

// Both composables call useI18n(), which requires an active component
// setup context — mount a throwaway component to get one instead of
// invoking the composable bare.
function mountWithOrders<T>(useOrders: () => T) {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useOrders();
        return () => h('div');
      },
    }),
    { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } },
  );
  return { wrapper, result };
}

describe('formatCountdown', () => {
  it('omits the hour segment under an hour', () => {
    expect(formatCountdown(65)).toBe('1:05');
  });

  it('includes the hour segment at or above an hour', () => {
    expect(formatCountdown(3665)).toBe('1:01:05');
  });
});

describe('useBuildOrders', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('never lets progress jump backward when a poll resets queueFetchedAt', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ completesInSeconds: 100, totalSeconds: 100 })];

    const { wrapper, result } = mountWithOrders(useBuildOrders);

    vi.advanceTimersByTime(60_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    const beforePoll = result.value[0].progress;
    expect(beforePoll).toBeGreaterThan(0);

    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ completesInSeconds: 40, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(result.value[0].progress).toBeGreaterThanOrEqual(beforePoll);
    wrapper.unmount();
  });

  it('starts a new order fresh instead of carrying over the previous one\'s progress', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ id: 'order-1', completesInSeconds: 100, totalSeconds: 100 })];

    const { wrapper, result } = mountWithOrders(useBuildOrders);
    vi.advanceTimersByTime(90_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    expect(result.value[0].progress).toBeGreaterThan(0.5);

    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [buildOrder({ id: 'order-2', completesInSeconds: 100, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(result.value[0].progress).toBeLessThan(0.1);
    wrapper.unmount();
  });

  it('exposes remainingSeconds as null for a waiting order and a number otherwise', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      buildOrder({ id: 'active-1', state: 'building', completesInSeconds: 42, totalSeconds: 100 }),
      buildOrder({ id: 'waiting-1', state: 'waiting', completesAtGameTime: null, completesInSeconds: null }),
    ];

    const { wrapper, result } = mountWithOrders(useBuildOrders);
    await wrapper.vm.$nextTick();

    expect(result.value[0].remainingSeconds).toBeCloseTo(42, 0);
    expect(result.value[1].remainingSeconds).toBeNull();
    wrapper.unmount();
  });
});

describe('useTrainingOrders', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('never lets progress jump backward when a poll resets trainingQueueFetchedAt', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder({ completesInSeconds: 100, totalSeconds: 100 })];

    const { wrapper, result } = mountWithOrders(useTrainingOrders);

    vi.advanceTimersByTime(60_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    const beforePoll = result.value[0].progress;
    expect(beforePoll).toBeGreaterThan(0);

    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [trainingOrder({ completesInSeconds: 40, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(result.value[0].progress).toBeGreaterThanOrEqual(beforePoll);
    wrapper.unmount();
  });
});
