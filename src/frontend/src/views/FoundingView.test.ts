// @vitest-environment jsdom
//
// The founding page: the settler and price tables are computed from the unit catalogue and the settler rules, and the sea-founding note stays admin-only.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import FoundingView from './FoundingView.vue';
import { useAuthStore } from '../stores/auth';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import buildingCatalogue from '../data/building-catalogue.json';
import unitCatalogue from '../data/unit-catalogue.json';
import type { BuildingDefinitionResponse, UnitDefinitionResponse, UserResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const wrapper = mount(FoundingView, {
    attachTo: document.body,
    global: {
      plugins: [createTestI18n({ docs: enDocs }), router],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useBuildingCatalogueStore().definitions = buildingCatalogue.data as BuildingDefinitionResponse[];
  useUnitCatalogueStore().definitions = unitCatalogue.data as UnitDefinitionResponse[];
  useAuthStore().user = { role: 'player' } as unknown as UserResponse;
  useDocsAdminNotes().setEnabled(false);
});

describe('FoundingView', () => {
  it('asks renown for the 2nd to 5th settlement, doubling with each settlement held', async () => {
    const wrapper = await mountPage();

    const row = (n: number) => wrapper.get(`[data-settlement="${n}"]`).findAll('th, td').map((c) => c.text());
    expect(row(2)).toEqual(['Settlement no. 2', '55,000']);
    expect(row(3)).toEqual(['Settlement no. 3', '110,000']);
    expect(row(5)).toEqual(['Settlement no. 5', '440,000']);
    wrapper.unmount();
  });

  it('describes the Settler from the unit catalogue and the Cart Workshop from the building catalogue', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=settler-table] tbody tr').findAll('td').map((td) => td.text())).toEqual(['3', '4', '40', '0.25', '24 min', '10', '120 / 90 / 60 / 60']);
    const more = wrapper.get('#more').text();
    expect(more).toContain('5 settlers');
    expect(more).toContain('Cart Workshop');
    expect(more).toContain('level 10');
    expect(more).toContain('Town Square of level 3');
    expect(more).toContain('Each settler carries 40 food, 200 for all five');
    wrapper.unmount();
  });

  it('states the spacing, the starting stock and the claim radius of a new settlement', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#where').text()).toContain('At least 15 hexes beyond the claim border');
    const fresh = wrapper.get('#new').text();
    expect(fresh).toContain('Its claim reaches 2 hexes, 3 from level 2');
    expect(fresh).toContain('hold 700 each of wood, brick and food, and no iron');
    wrapper.unmount();
  });

  it('lists the feast cost and renown by Town Square level', async () => {
    const wrapper = await mountPage();

    const rows = wrapper.findAll('[data-testid=feast-table] tbody tr').map((r) => r.findAll('td').map((td) => td.text()));
    expect(rows[0]).toEqual(['1', '800', '3,500']);
    wrapper.unmount();
  });

  it('links the wildlife camps and land movement pages', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('a[href="/docs/wildlife-camps"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/docs/land-movement"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('describes founding by sea: the dockyard, the slots a settler takes and the ships page', async () => {
    const wrapper = await mountPage();

    const sea = wrapper.get('#sea').text();
    expect(sea).toContain('leaves from your Dockyard');
    expect(sea).toContain('Each settler takes 1 slot aboard');
    expect(sea).toContain('slowest ship');
    expect(wrapper.find('#sea a[href="/docs/ships"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('points the sea section at the beach camp page', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('#sea a[href="/docs/beach-camp"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Army.FleetAnchor');
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('Army.FleetAnchor');
    wrapper.unmount();
  });
});
