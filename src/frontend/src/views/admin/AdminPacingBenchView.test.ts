// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPacingBenchView from './AdminPacingBenchView.vue';
import EconomyChart, { type EconomySeries } from '../../components/admin/EconomyChart.vue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { createTestI18n } from '../../test/i18n';
import adminPacingBench from '../../i18n/locales/en/adminPacingBench.json';
import buildingSnapshot from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';

// A run is real CPU work (the simulator, ~450 ms for the default 200 days and growing faster than linearly with the horizon),
// and these tests trigger up to three. Tests that only check how the view reacts to a changed knob start from a shorter
// remembered horizon, so a run stays cheap on a loaded machine.
const SHORT_HORIZON_DAYS = 100;
const STORE_KEY = 'bjarnoy-pacing-bench-v2';

// jsdom has no Worker, so the bench runs inline; the chart is stubbed (no canvas) and the debounce is skipped with fake timers.
function mountView(opts: { horizonDays?: number } = {}) {
  if (opts.horizonDays !== undefined) localStorage.setItem(STORE_KEY, JSON.stringify({ knobs: { horizonDays: opts.horizonDays } }));
  return mount(AdminPacingBenchView, {
    global: { plugins: [createTestI18n({ adminPacingBench })], stubs: { EconomyChart: true } },
  });
}

async function settle(ms = 300) {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setActivePinia(createPinia());
  const buildings = useBuildingCatalogueStore();
  buildings.definitions = buildingSnapshot.data as BuildingDefinitionResponse[];
  buildings.source = 'fallback';
});
afterEach(() => vi.useRealTimers());

describe('AdminPacingBenchView', () => {
  it('runs on load and fills the milestone table for the four profiles', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-testid="bench-status"]').text()).toMatch(/Simulated 200 days × 4 profiles/);
    const rows = wrapper.findAll('[data-testid="bench-milestones"] tbody tr');
    expect(rows).toHaveLength(4);
    expect(wrapper.get('[data-testid="bench-activeFeasts-settle"]').text()).toMatch(/^d\d/);
    expect(wrapper.get('[data-testid="bench-activeFeasts-5"]').text()).toMatch(/^d\d/);
    // The first run is the reference, so nothing differs from it yet.
    expect(wrapper.findAll('.d')).toHaveLength(0);
  });

  it('shows the profile text from the code constants', async () => {
    const wrapper = mountView();
    await flushPromises();
    const text = wrapper.get('.how').text();
    expect(text).toContain('from 07:00 to 23:00');
    expect(text).toContain('08:00, 12:00, 17:00 and 21:00');
    expect(wrapper.get('[data-testid="bench-how-feasts"]').text()).toContain('800 × 1.25^(TS−1)');
  });

  it('a changed knob re-runs after the debounce and shows the change against the reference; pinning makes it the reference', async () => {
    const wrapper = mountView({ horizonDays: SHORT_HORIZON_DAYS });
    await flushPromises();
    const before = wrapper.get('[data-testid="bench-activeFeasts-10"]').text();
    // A steeper Longhouse build-time tail makes the early Longhouse levels take longer.
    const input = wrapper.get('[data-testid="bench-lhShape"]');
    await input.setValue('6');
    // Not yet: the run waits for the typing to stop.
    expect(wrapper.get('[data-testid="bench-activeFeasts-10"]').text()).toBe(before);
    await settle();
    const delta = wrapper.get('[data-testid="bench-activeFeasts-10-delta"]');
    expect(delta.classes()).toContain('later');
    expect(delta.text()).toMatch(/^\+\d/);
    // The Longhouse wood costs show the reference in brackets.
    await wrapper.get('[data-testid="bench-longhouseCostGrowth"]').setValue('1.5');
    await settle();
    expect(wrapper.get('[data-testid="bench-cost-10"]').text()).toMatch(/\(.+\)/);

    await wrapper.get('[data-testid="bench-pin"]').trigger('click');
    expect(wrapper.findAll('.d')).toHaveLength(0);
    expect(wrapper.get('[data-testid="bench-cost-10"]').text()).not.toMatch(/\(/);
  });

  it('hands the charts the four profiles plus a dashed reference each', async () => {
    const wrapper = mountView();
    await flushPromises();
    const series = wrapper.findAllComponents(EconomyChart)[0].props('series') as EconomySeries[];
    expect(series.filter((s) => !s.dashed)).toHaveLength(4);
    expect(series.filter((s) => s.dashed)).toHaveLength(4);
    expect(series[0].points[0]).toEqual({ x: 0, y: 1 });
  });

  it('Reset to live values restores every knob', async () => {
    const wrapper = mountView({ horizonDays: SHORT_HORIZON_DAYS });
    await flushPromises();
    const input = wrapper.get<HTMLInputElement>('[data-testid="bench-storageHouseCapacity"]');
    const live = input.element.value;
    await input.setValue('100');
    expect(input.classes()).toContain('changed');
    // No debounce wait: the knobs reset synchronously, and letting the re-runs fire would only add simulator work.
    await wrapper.get('[data-testid="bench-reset"]').trigger('click');
    expect(input.element.value).toBe(live);
    expect(input.classes()).not.toContain('changed');
  });

  it('Copy settings writes the knobs as JSON to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-testid="bench-copy"]').trigger('click');
    await flushPromises();
    expect(JSON.parse(writeText.mock.calls[0][0] as string)).toMatchObject({ producersPerTower: 1, horizonDays: 200, renownThreshold: 80000 });
    expect(wrapper.get('[data-testid="bench-status"]').text()).toBe('Copied the settings');
  });
});
