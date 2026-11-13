// @vitest-environment jsdom
//
// The ships page: the ship table is read off the unit catalogue, the harbour and shipyard sentences off the building catalogue, and the fleet-route note stays admin-only.
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
  it('compares the eight ships by group from the unit catalogue', async () => {
    const wrapper = await mountPage();

    expect(wrapper.findAll('[data-testid=ships-table] thead th[data-ship]').map((th) => th.text())).toEqual([
      'Færing', 'Byrding', 'Knarr', 'Karve', 'Snekkja', 'Skeid', 'Fire Raft', 'Fire Hulk',
    ]);
    const groups = wrapper.findAll('[data-testid=ships-table] thead th[data-group]');
    expect(groups.map((th) => [th.attributes('data-group'), th.attributes('colspan')])).toEqual([
      ['scouts', '1'], ['cargo', '2'], ['transport', '1'], ['warships', '2'], ['fireCraft', '2'],
    ]);
    expect(groups.map((th) => th.text())).toEqual(['Scouts', 'Cargo', 'Transport', 'Warships', 'Fire craft']);
    const row = (id: string) => wrapper.get(`[data-row=${id}]`).findAll('td').map((td) => td.text());
    expect(row('attack')).toEqual(['0', '0', '0', '5', '60', '90', '0', '0']);
    expect(row('defense')).toEqual(['3', '10', '20', '30', '40', '60', '3', '25']);
    expect(row('speed')).toEqual(['8', '6', '4', '8', '10', '11', '5', '8']);
    expect(row('loot')).toEqual(['0', '160', '600', '200', '80', '120', '0', '0']);
    expect(row('slots')).toEqual(['0', '0', '0', '10', '20', '30', '0', '0']);
    expect(row('food')).toEqual(['40', '150', '1,200', '600', '320', '480', '30', '200']);
    expect(row('upkeep')).toEqual(['0.25', '0.5', '1', '1.5', '2', '3', '1', '5']);
    expect(row('cost')).toEqual([
      '40 / 10 / 10 / 0', '120 / 50 / 20 / 20', '300 / 120 / 40 / 135', '250 / 100 / 40 / 100',
      '400 / 200 / 60 / 220', '550 / 250 / 80 / 300', '50 / 10 / 10 / 10', '300 / 60 / 40 / 80',
    ]);
    expect(row('time')).toEqual(['6 min', '20 min', '50 min', '45 min', '90 min', '120 min', '10 min', '40 min']);
    expect(row('fire')).toEqual(['–', '–', '–', '–', '–', '–', '50', '10']);
    expect(row('needs')).toEqual([
      'Harbour 1', 'Harbour 1', 'Harbour 3', 'Harbour 5',
      'Shipyard 1', 'Shipyard 10 · Longhouse 20', 'Shipyard 1', 'Shipyard 5 · Longhouse 12',
    ]);
    wrapper.unmount();
  });

  it('lists the slots every land unit takes aboard from the unit catalogue and states the troop rules', async () => {
    const wrapper = await mountPage();

    const slots = Object.fromEntries(
      wrapper.findAll('[data-testid=slots-table] tbody tr').map((tr) => [tr.attributes('data-unit'), tr.get('td').text()]),
    );
    expect(slots).toEqual({
      thrall: '1', spearman: '1', settler: '1', bowman: '2', axeman: '2', provisioner: '2', berserker: '4', catapult: '10', ram: '10', campbuilder: '1',
    });
    const text = wrapper.get('#troops').text();
    expect(text).toContain('slowest ship');
    expect(text).toContain('do not take part in the ship fight');
    expect(text).toContain('drown');
    expect(wrapper.get('#battles').text()).toContain('An attack is two fights');
    wrapper.unmount();
  });

  it('names what the Harbour and the Shipyard need from the building catalogue', async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#harbour').text();
    expect(text).toContain('Harbour trains scouts, cargo ships and the troop transport');
    expect(text).toContain('Longhouse of level 5');
    expect(text).toContain('Fishing Hut of level 3');
    expect(text).toContain('Shipyard trains warships and fire craft');
    expect(text).toContain('Longhouse of level 10');
    expect(text).toContain('Harbour of level 5');
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

  it('explains that ships do not damage buildings on land and loot needs a won land fight', async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#battles').text();
    expect(text).toContain('Ships do no damage to buildings on land');
    expect(text).toContain('10 Fire Hulks or 50 Fire Rafts take one level off');
    expect(text).toContain('Loot needs a won land fight');
    wrapper.unmount();
  });

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('(ShipCargo)');
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('Founding by sea');
    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('5 settlers');
    wrapper.unmount();
  });
});
