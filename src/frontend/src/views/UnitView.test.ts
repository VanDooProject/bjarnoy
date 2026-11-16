// @vitest-environment jsdom
//
// The unit detail page: figures come off the unit catalogue, the training building off the same entry.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import UnitView from './UnitView.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import buildingCatalogue from '../data/building-catalogue.json';
import unitCatalogue from '../data/unit-catalogue.json';
import type { BuildingDefinitionResponse, UnitDefinitionResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';

async function mountUnit(type: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/docs/units/:type', component: UnitView }],
  });
  await router.push(`/docs/units/${type}`);
  const wrapper = mount(UnitView, {
    attachTo: document.body,
    global: {
      plugins: [createTestI18n({ docs: enDocs, catalogue: enCatalogue }), router],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true },
    },
  });
  await flushPromises();
  return wrapper;
}

const defs = unitCatalogue.data as UnitDefinitionResponse[];

beforeEach(() => {
  setActivePinia(createPinia());
  useBuildingCatalogueStore().definitions = buildingCatalogue.data as BuildingDefinitionResponse[];
  useUnitCatalogueStore().definitions = defs;
});

describe('UnitView', () => {
  it('shows a land unit with its figures and the building that trains it', async () => {
    const unit = defs.find((u) => u.type === 'spearman')!;
    const wrapper = await mountUnit('spearman');
    expect(wrapper.get('h1').text()).toBe('Spearman');
    expect(wrapper.get('[data-col=attack]').text()).toBe(String(unit.attack));
    expect(wrapper.get('[data-col=vision]').text()).toBe(String(unit.visionRadius));
    expect(wrapper.text()).toContain(`level ${unit.requiredBuildingLevel}`);
    expect(wrapper.find('a[href="/docs/training"]').exists()).toBe(true);
  });

  it('shows a ship with its room aboard and points back to the ships page', async () => {
    const unit = defs.find((u) => u.type === 'karve')!;
    const wrapper = await mountUnit('karve');
    expect(wrapper.get('[data-col=slots]').text()).toBe(String(unit.shipSlots));
    expect(wrapper.get('[data-testid=unit-kind]').text()).toBe('Transport');
    expect(wrapper.find('a[href="/docs/ships"]').exists()).toBe(true);
  });

  it('says so for a unit that does not exist', async () => {
    const wrapper = await mountUnit('dragon');
    expect(wrapper.find('[data-testid=unit-unknown]').exists()).toBe(true);
  });
});
