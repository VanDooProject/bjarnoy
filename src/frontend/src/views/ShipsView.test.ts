// @vitest-environment jsdom
//
// The ships page: the two-ship table is read off the unit catalogue, the dockyard sentence off the building catalogue, and the fleet-route note stays admin-only.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ShipsView from './ShipsView.vue';
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
  const wrapper = mount(ShipsView, {
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

describe('ShipsView', () => {
  it('compares the Karve and the Longship from the unit catalogue', async () => {
    const wrapper = await mountPage();

    expect(wrapper.findAll('[data-testid=ships-table] thead th[data-ship]').map((th) => th.text())).toEqual(['Karve', 'Longship']);
    const row = (id: string) => wrapper.get(`[data-row=${id}]`).findAll('td').map((td) => td.text());
    expect(row('attack')).toEqual(['5', '60']);
    expect(row('defense')).toEqual(['30', '40']);
    expect(row('speed')).toEqual(['8', '10']);
    expect(row('perHex')).toEqual(['7.5 min', '6 min']);
    expect(row('loot')).toEqual(['200', '80']);
    expect(row('food')).toEqual(['100', '60']);
    expect(row('upkeep')).toEqual(['2', '3']);
    expect(row('cost')).toEqual(['250 / 100 / 40 / 100', '400 / 200 / 60 / 220']);
    expect(row('time')).toEqual(['45 min', '90 min']);
    expect(row('needs')).toEqual(['Longhouse 8', 'Longhouse 20 · Karve']);
    wrapper.unmount();
  });

  it('names what the Dockyard needs from the building catalogue', async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#dockyard').text();
    expect(text).toContain('Dockyard');
    expect(text).toContain('Longhouse of level 8');
    expect(text).toContain('Fishing Hut of level 5');
    wrapper.unmount();
  });

  it("states the tower bonus and Njörd's shrine range from the shrine formulas", async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#battles').text();
    expect(text).toContain('adds 5% defence per level');
    expect(text).toContain('attack by 10% at level 1, up to 22% at level 5');
    expect(wrapper.find('a[href="/docs/shrines"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/docs/walls"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('route starts at the settlement centre');
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('route starts at the settlement centre');
    wrapper.unmount();
  });
});
