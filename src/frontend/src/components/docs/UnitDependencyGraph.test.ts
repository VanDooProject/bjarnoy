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

function mountGraph(domain: 'land' | 'water' = 'land') {
  setActivePinia(createPinia());
  useUnitCatalogueStore().definitions = unitCatalogue.data as UnitDefinitionResponse[];
  useBuildingCatalogueStore().load = vi.fn();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
  return mount(UnitDependencyGraph, {
    props: { domain },
    global: { plugins: [createTestI18n({ docs: enDocs, catalogue: enCatalogue }), router] },
  });
}

describe('UnitDependencyGraph', () => {
  it('draws one node per land unit and no arrows, since no unit needs another unit', () => {
    const wrapper = mountGraph();
    const land = (unitCatalogue.data as UnitDefinitionResponse[]).filter((u) => u.class !== 'ship');
    expect(wrapper.findAll('svg .node')).toHaveLength(land.length);
    expect(wrapper.find('svg [data-unit="karve"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-edge]')).toHaveLength(0);
    expect(wrapper.find('svg path.edge').exists()).toBe(false);
    expect(wrapper.get('svg [data-unit="axeman"]').text()).not.toContain('LH');
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

  it('draws the ships only in the water graph, in the harbour and shipyard lanes', () => {
    const wrapper = mountGraph('water');
    const ships = (unitCatalogue.data as UnitDefinitionResponse[]).filter((u) => u.class === 'ship');
    expect(wrapper.findAll('svg .node')).toHaveLength(ships.length);
    expect(wrapper.find('svg [data-unit="spearman"]').exists()).toBe(false);
    expect(wrapper.findAll('.lane-label').map((l) => l.attributes('data-building')).sort()).toEqual(['harbour', 'shipyard']);
  });

  it('links every node and list entry to the unit page', () => {
    const wrapper = mountGraph();
    expect(wrapper.get('svg [data-unit="axeman"]').attributes('href')).toBe('/docs/units/axeman');
    expect(wrapper.get('.phone-building[data-building="barracks"] a[href="/docs/units/berserker"]').text()).toBe('Berserker');
  });
});
