// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import AdminEconomyView from './AdminEconomyView.vue';
import EconomyChart from '../../components/admin/EconomyChart.vue';
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

  it('charts the default building types over their levels', async () => {
    const wrapper = mountView();
    await flushPromises();
    const cost = wrapper.findAllComponents(EconomyChart)[0].props('series');
    expect(cost.map((s: { label: string }) => s.label).sort()).toHaveLength(6);
    expect(cost[0].points.map((p: { x: number }) => p.x)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('runs the simulation only on demand and lists milestones for both profiles', async () => {
    const wrapper = mountView();
    await flushPromises();
    const firstSettlers = wrapper.get('[data-testid="settlers-always"]').text();
    // Editing an input does not re-run the sim ...
    await wrapper.get('[data-testid="producers-farm"]').setValue('8');
    expect(wrapper.get('[data-testid="settlers-always"]').text()).toBe(firstSettlers);
    // ... the Run button does.
    await wrapper.get('[data-testid="economy-run"]').trigger('submit');
    const rows = wrapper.get('[data-testid="milestones"]').findAll('tbody tr');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[1].text()).toMatch(/\d+d \d\d:\d\d/);
  });

  it('highlights bulk unlock levels in the ladder', async () => {
    const wrapper = mountView();
    await flushPromises();
    const bulkRows = wrapper.findAll('.ladder-row.bulk');
    for (const row of bulkRows) expect(row.text()).toContain('Bulk unlock');
  });
});
