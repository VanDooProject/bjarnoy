// @vitest-environment jsdom
//
// The land movement page: ground costs and the per-unit pace table are computed from the pathfinder mirror and the unit catalogue; the bridge note stays admin-only.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import LandMovementView from './LandMovementView.vue';
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
  const wrapper = mount(LandMovementView, {
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

describe('LandMovementView', () => {
  it('lists the ground costs, the flat stream cost and what cannot be entered', async () => {
    const wrapper = await mountPage();

    const cost = (id: string) => wrapper.get(`[data-ground=${id}]`).findAll('th, td').map((c) => c.text());
    expect(cost('grass')).toEqual(['Grassland', '1']);
    expect(cost('sand')).toEqual(['Shore', '1.1']);
    expect(cost('forest')).toEqual(['Forest', '1.3']);
    expect(cost('bog')).toEqual(['Bogland', '2']);
    expect(cost('stream')[1]).toContain('9');
    expect(cost('wallEnd')[1]).toContain('3');
    for (const id of ['mountain', 'sea', 'lake', 'wideRiver']) expect(cost(id)[1], id).toBe('Cannot be entered');
    wrapper.unmount();
  });

  it('works out minutes per hex for each land unit from its catalogue speed, leaving the ships out', async () => {
    const wrapper = await mountPage();

    const rows = wrapper.findAll('[data-testid=pace-table] tbody tr');
    expect(rows.map((r) => r.attributes('data-unit'))).toEqual([
      'thrall',
      'spearman',
      'axeman',
      'bowman',
      'berserker',
      'provisioner',
      'catapult',
      'settlercrew',
    ]);
    const cells = (type: string) => wrapper.get(`[data-testid=pace-table] [data-unit=${type}]`).findAll('td').map((td) => td.text());
    expect(cells('spearman')).toEqual(['4', '15 min', '16.5 min', '19.5 min', '30 min', '2 h 15 min']);
    expect(cells('thrall')).toEqual(['5', '12 min', '13.2 min', '15.6 min', '24 min', '1 h 48 min']);
    expect(cells('catapult')[1]).toBe('40 min');
    wrapper.unmount();
  });

  it('gives the spearman example, the slowest unit and the food table', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#pace').text()).toContain('a Spearman crosses a grass hex in 15 min');
    expect(wrapper.get('#pace').text()).toContain('The slowest of all is the Catapult');
    const food = wrapper.get('[data-testid=food-table] [data-unit=provisioner]').findAll('td').map((td) => td.text());
    expect(food).toEqual(['1', '150']);
    wrapper.unmount();
  });

  it('states the strong camp range and the army sight, and links the walls and wildlife camps pages', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#road').text()).toContain('guards 3 to 7 hexes');
    expect(wrapper.get('#sight').text()).toContain('2 rings of the map');
    expect(wrapper.get('#sight').text()).toContain('plus 2 more for each level');
    expect(wrapper.find('a[href="/docs/walls"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/docs/wildlife-camps"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Bridges over wide rivers');
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('Bridges over wide rivers');
    wrapper.unmount();
  });
});
