// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import UnitDependencyGraph from './UnitDependencyGraph.vue';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import unitCatalogue from '../../data/unit-catalogue.json';
import type { UnitDefinitionResponse } from '../../api/types';

function mountGraph() {
  setActivePinia(createPinia());
  useUnitCatalogueStore().definitions = unitCatalogue.data as UnitDefinitionResponse[];
  useBuildingCatalogueStore().load = vi.fn();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
  return mount(UnitDependencyGraph, {
    global: { plugins: [createTestI18n({ docs: enDocs, catalogue: enCatalogue }), router] },
  });
}

describe('UnitDependencyGraph', () => {
  it('draws one node per unit and an arrow from the Berserker to the Ram and the Catapult', () => {
    const wrapper = mountGraph();
    expect(wrapper.findAll('svg .node')).toHaveLength((unitCatalogue.data as unknown[]).length);
    expect(wrapper.find('[data-edge="berserker>ram"]').exists()).toBe(true);
    expect(wrapper.find('[data-edge="berserker>catapult"]').exists()).toBe(true);
    expect(wrapper.find('[data-edge="axeman>berserker"]').exists()).toBe(false);
  });

  it('has a lane label per training building and the phone list with units ordered by level', () => {
    const wrapper = mountGraph();
    expect(wrapper.findAll('.lane-label').map((l) => l.attributes('data-building'))).toContain('barracks');
    const barracks = wrapper.get('.phone-building[data-building="barracks"]');
    expect(barracks.findAll('ol > li').map((li) => li.text())).toEqual([
      expect.stringContaining('Level 1'),
      expect.stringContaining('Level 3'),
      expect.stringContaining('Level 6'),
      expect.stringContaining('Level 10'),
    ]);
    expect(barracks.text()).toContain('Berserker');
  });
});
