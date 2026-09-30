// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import AdminEconomyView from './AdminEconomyView.vue';
import EconomyChart, { type EconomySeries } from '../../components/admin/EconomyChart.vue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { createTestI18n } from '../../test/i18n';
import adminEconomy from '../../i18n/locales/en/adminEconomy.json';
import buildingSnapshot from '../../data/building-catalogue.json';
import unitSnapshot from '../../data/unit-catalogue.json';
import type { BuildingDefinitionResponse, UnitDefinitionResponse } from '../../api/types';

// The chart component is stubbed: jsdom has no canvas, and what is under test
// here is which series the page hands the charts and the tables it renders.
function mountView() {
  return mount(AdminEconomyView, {
    global: { plugins: [createTestI18n({ adminEconomy })], stubs: { EconomyChart: true } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  const buildings = useBuildingCatalogueStore();
  buildings.definitions = buildingSnapshot.data as BuildingDefinitionResponse[];
  buildings.source = 'fallback';
  buildings.generatedAt = buildingSnapshot._meta.generatedAt;
  const units = useUnitCatalogueStore();
  units.definitions = unitSnapshot.data as UnitDefinitionResponse[];
  units.source = 'fallback';
});

describe('AdminEconomyView', () => {
  it('shows the catalogue source and renders the four curve charts, the unlock chart and the pacing chart', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.get('[data-testid="economy-source"]').text()).toContain('fallback');
    expect(wrapper.findAllComponents(EconomyChart)).toHaveLength(6);
  });

  it('charts the default building types over their levels, live and what-if together', async () => {
    const wrapper = mountView();
    await flushPromises();
    const cost = wrapper.findAllComponents(EconomyChart)[0].props('series') as EconomySeries[];
    const live = cost.filter((s) => !s.dashed);
    const whatIf = cost.filter((s) => s.dashed);
    expect(live).toHaveLength(6);
    expect(whatIf).toHaveLength(6);
    // One point per level, from 1 up to that building's own max level.
    const xs = live[0].points.map((p) => p.x);
    expect(xs.length).toBeGreaterThan(1);
    expect(xs).toEqual(xs.map((_, i) => i + 1));
    // Default knobs reproduce the live curve.
    expect(whatIf[0].points.map((p) => p.x)).toEqual(xs);
    expect(whatIf[0].points[5].y!).toBeCloseTo(live[0].points[5].y!, 1);
  });

  it('what-if knobs move the dashed curves at once but not the live ones, and Reset restores them', async () => {
    const wrapper = mountView();
    await flushPromises();
    const longhouse = (dashed: boolean) =>
      (wrapper.findAllComponents(EconomyChart)[0].props('series') as EconomySeries[]).find(
        (s) => !!s.dashed === dashed && s.label.startsWith('Longhouse'),
      )!.points[9].y!;
    const liveBefore = longhouse(false);
    const whatIfBefore = longhouse(true);
    await wrapper.get('[data-testid="whatif-longhouseCostGrowth"]').setValue('1.5');
    expect(longhouse(false)).toBe(liveBefore);
    expect(longhouse(true)).toBeGreaterThan(whatIfBefore);
    await wrapper.get('[data-testid="whatif-reset"]').trigger('click');
    expect(longhouse(true)).toBeCloseTo(whatIfBefore, 6);
  });

  it('runs the simulation only on demand and lists live and what-if results per profile', async () => {
    const wrapper = mountView();
    await flushPromises();
    const chartSeries = () => wrapper.findAllComponents(EconomyChart).at(-1)!.props('series') as EconomySeries[];
    const first = wrapper.get('[data-testid="lh-5-active-live"]').text();
    expect(first).toMatch(/\d+d \d\d:\d\d/);
    // The initial run charts each default profile twice: live solid, what-if dashed.
    expect(chartSeries()).toHaveLength(6);
    expect(chartSeries().filter((s) => s.dashed)).toHaveLength(3);
    // Editing inputs does not re-run the sim ...
    await wrapper.get('[data-testid="profile-always24"]').setValue(true);
    await wrapper.get('[data-testid="whatif-timeScale"]').setValue('4');
    expect(chartSeries()).toHaveLength(6);
    expect(wrapper.find('[data-testid="lh-5-always24-live"]').exists()).toBe(false);
    const whatIfBefore = wrapper.get('[data-testid="lh-5-active-whatif"]').text();
    // ... the Run button does, for the newly ticked profile and with the new what-if.
    await wrapper.get('[data-testid="economy-run"]').trigger('submit');
    expect(chartSeries()).toHaveLength(8);
    expect(wrapper.get('[data-testid="lh-5-always24-live"]').text()).toMatch(/\d+d/);
    expect(wrapper.get('[data-testid="lh-5-active-live"]').text()).toBe(first);
    expect(wrapper.get('[data-testid="lh-5-active-whatif"]').text()).not.toBe(whatIfBefore);
    const rows = wrapper.get('[data-testid="milestones"]').findAll('tbody tr');
    expect(rows.length).toBe(6 + 3 + 2);
  });

  it('accepts a custom schedule as a profile', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get('[data-testid="profile-custom"]').setValue(true);
    expect(wrapper.find('[data-testid="custom-schedule"]').exists()).toBe(true);
    await wrapper.get('[data-testid="add-session"]').trigger('click');
    await wrapper.get('[data-testid="economy-run"]').trigger('submit');
    expect(wrapper.find('[data-testid="settlement-custom-live"]').exists()).toBe(true);
  });

  it('highlights bulk unlock levels in the ladder', async () => {
    const wrapper = mountView();
    await flushPromises();
    const bulkRows = wrapper.findAll('.ladder-row.bulk');
    for (const row of bulkRows) expect(row.text()).toContain('Bulk unlock');
  });
});
