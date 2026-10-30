// @vitest-environment jsdom
//
// The founding page: the crew and price tables are computed from the unit catalogue and the settler rules, and the sea-founding note stays admin-only.
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
  it('prices the 2nd to 5th settlement: renown, and crew cost doubling with each settlement held', async () => {
    const wrapper = await mountPage();

    const row = (n: number) => wrapper.get(`[data-settlement="${n}"]`).findAll('th, td').map((c) => c.text());
    expect(row(2)).toEqual(['Settlement no. 2', '55,000', '200 / 150 / 100 / 100', '600 / 450 / 300 / 300']);
    expect(row(3)).toEqual(['Settlement no. 3', '110,000', '400 / 300 / 200 / 200', '1,200 / 900 / 600 / 600']);
    expect(row(5)[1]).toBe('440,000');
    expect(row(5)[2]).toBe('1,600 / 1,200 / 800 / 800');
    wrapper.unmount();
  });

  it('describes the Settler crew from the unit catalogue and the Cart Workshop from the building catalogue', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=crew-table] tbody tr').findAll('td').map((td) => td.text())).toEqual(['3', '4', '40', '1', '40 min', '10']);
    const more = wrapper.get('#more').text();
    expect(more).toContain('3 Settler crews');
    expect(more).toContain('Cart Workshop');
    expect(more).toContain('level 10');
    expect(more).toContain('Town Square of level 3');
    expect(more).toContain('Each crew carries 40 food, 120 for all three');
    wrapper.unmount();
  });

  it('states the spacing, the starting stock and the claim radius of a new settlement', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#where').text()).toContain('At least 15 hexes beyond the claim border');
    const fresh = wrapper.get('#new').text();
    expect(fresh).toContain('Its claim reaches 2 hexes, 3 from level 2');
    expect(fresh).toContain('hold 700 each of wood, stone and food, and no iron');
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

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Founding by sea');
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('Founding by sea');
    wrapper.unmount();
  });
});
