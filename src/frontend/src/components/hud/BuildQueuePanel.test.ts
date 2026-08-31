// @vitest-environment jsdom
//
// Issue #99: construction progress bars used to snap back to ~0% on every
// live-mode poll because progress was computed relative to the *remaining*
// time at the last poll rather than the order's real total duration. These
// tests mount the panel against a real Pinia store, drive its `hud.queue`
// snapshot the same way `stores/world.ts`'s poll loop does, and assert the
// fill width only ever grows — including across a simulated refetch.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BuildQueuePanel from './BuildQueuePanel.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse } from '../../api/types';

function order(overrides: Partial<BuildOrderResponse> = {}): BuildOrderResponse {
  return {
    id: 'order-1',
    q: 1,
    r: 2,
    building: 'farm',
    targetLevel: 1,
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

describe('BuildQueuePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('advances progress smoothly as time passes without a refetch', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mount(BuildQueuePanel);
    const initial = fillWidth(wrapper);

    vi.advanceTimersByTime(20_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    const later = fillWidth(wrapper);
    expect(later).toBeGreaterThan(initial);
    wrapper.unmount();
  });

  it('never lets progress jump backward when a poll resets queueFetchedAt', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mount(BuildQueuePanel);

    vi.advanceTimersByTime(60_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    const beforePoll = fillWidth(wrapper);
    expect(beforePoll).toBeGreaterThan(0);

    // Simulate the live poll in world.ts: queueFetchedAt resets to "now" and
    // completesInSeconds drops to the freshly observed remaining time, while
    // totalSeconds (the order's real duration) stays the same. Before the
    // fix, this made `elapsed` snap to 0 and progress fall back to ~0%.
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [order({ completesInSeconds: 40, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    const afterPoll = fillWidth(wrapper);
    expect(afterPoll).toBeGreaterThanOrEqual(beforePoll);
    wrapper.unmount();
  });

  it('starts a new order fresh instead of carrying over the previous one\'s progress', async () => {
    const world = useWorldStore();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [order({ id: 'order-1', completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mount(BuildQueuePanel);
    vi.advanceTimersByTime(90_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    expect(fillWidth(wrapper)).toBeGreaterThan(50);

    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [order({ id: 'order-2', completesInSeconds: 100, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(fillWidth(wrapper)).toBeLessThan(10);
    wrapper.unmount();
  });
});
