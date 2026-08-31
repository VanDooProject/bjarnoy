// @vitest-environment jsdom
//
// Issue #99: mirrors BuildQueuePanel.test.ts — the training-queue progress
// bar used the identical relative-to-last-poll formula and had the same
// reset-to-zero-on-poll bug.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TrainingQueuePanel from './TrainingQueuePanel.vue';
import { useWorldStore } from '../../stores/world';
import type { TrainingOrderResponse } from '../../api/types';

function order(overrides: Partial<TrainingOrderResponse> = {}): TrainingOrderResponse {
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

function fillWidth(wrapper: ReturnType<typeof mount>): number {
  const style = wrapper.get('.status-progress-fill').attributes('style') ?? '';
  const match = /width:\s*([\d.]+)%/.exec(style);
  return match ? Number(match[1]) : NaN;
}

describe('TrainingQueuePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('advances progress smoothly as time passes without a refetch', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mount(TrainingQueuePanel);
    const initial = fillWidth(wrapper);

    vi.advanceTimersByTime(20_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(fillWidth(wrapper)).toBeGreaterThan(initial);
    wrapper.unmount();
  });

  it('never lets progress jump backward when a poll resets trainingQueueFetchedAt', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mount(TrainingQueuePanel);

    vi.advanceTimersByTime(60_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    const beforePoll = fillWidth(wrapper);
    expect(beforePoll).toBeGreaterThan(0);

    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 40, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(fillWidth(wrapper)).toBeGreaterThanOrEqual(beforePoll);
    wrapper.unmount();
  });
});
