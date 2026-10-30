// @vitest-environment jsdom
//
// The production page: one table row per producer and mill with figures read off the catalogue and the economy formulas, and the admin-only note kept from players.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ResourceProductionView from './ResourceProductionView.vue';
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
  const wrapper = mount(ResourceProductionView, {
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

describe('ResourceProductionView', () => {
  it('lists the eight producers and the Longhouse with their level 1 and level 10 output', async () => {
    const wrapper = await mountPage();

    const rows = wrapper.findAll('[data-testid=producers-table] tbody tr');
    expect(rows.map((r) => r.attributes('data-producer'))).toEqual([
      'lumberjack',
      'quarry',
      'reindeerherder',
      'farm',
      'pumpkinfarm',
      'fishinghut',
      'claybrickworks',
      'bogoreworks',
      'longhouse',
    ]);
    const cells = (type: string) => wrapper.get(`[data-producer=${type}]`).findAll('td').map((td) => td.text());
    expect(cells('lumberjack').slice(0, 3)).toEqual(['Wood', '40', '206']);
    expect(cells('pumpkinfarm').slice(0, 3)).toEqual(['Food', '44', '227']);
    expect(cells('bogoreworks').slice(0, 3)).toEqual(['Iron', '20', '103']);
    expect(cells('longhouse').slice(0, 3)).toEqual(['Wood / Stone / Food / Iron', '15 / 12 / 15 / 2', '150 / 120 / 150 / 20']);
    wrapper.unmount();
  });

  it('names where each producer stands and what unlocks it, from the catalogue', async () => {
    const wrapper = await mountPage();

    const cells = (type: string) => wrapper.get(`[data-producer=${type}]`).findAll('td').map((td) => td.text());
    expect(cells('farm')[3]).toBe('Grassland');
    expect(cells('farm')[4]).toContain('Longhouse 4');
    expect(cells('farm')[4]).toContain('Reindeer Herder 3');
    expect(cells('fishinghut')[3]).toContain('Shallow (coastal) water');
    expect(cells('fishinghut')[3]).toContain('half shore of a bog lake');
    expect(cells('pumpkinfarm')[3]).toContain('pumpkin soil');
    wrapper.unmount();
  });

  it('shows the neighbour boost with its cap and the four buildings it applies to', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#boost').text()).toContain('adds 10% to its output, up to 50%');
    expect(wrapper.findAll('[data-testid=boost-table] tbody tr').map((r) => r.attributes('data-boost'))).toEqual([
      'lumberjack',
      'quarry',
      'fishinghut',
      'bogoreworks',
    ]);
    expect(wrapper.get('[data-boost=fishinghut]').text()).toContain('Open water, Bog lake');
    wrapper.unmount();
  });

  it('shows what each mill raises and its boost and reach at levels 1, 5, 10 and 20; the Crop Mill raises Farms only', async () => {
    const wrapper = await mountPage();

    const cells = (type: string) => wrapper.get(`[data-mill=${type}]`).findAll('td').map((td) => td.text());
    expect(cells('sawmill')[0]).toBe('Lumberjack');
    expect(cells('sawmill').slice(3)).toEqual(['5% · 1 ring', '25% · 2 rings', '50% · 3 rings', '100% · 5 rings']);
    expect(cells('cropmill')[0]).toBe('Farm');
    expect(cells('hammerschmiede')[0]).toBe('Bog-Ore Works');
    expect(cells('cropmill')[1]).toBe('Straight river');
    wrapper.unmount();
  });

  it('shows the storage buildings and the storehouse steps', async () => {
    const wrapper = await mountPage();

    const longhouse = wrapper.get('[data-storage=longhouse]').text();
    expect(longhouse).toContain('Level 1: 250');
    expect(longhouse).toContain('Level 30: 7,500');
    expect(wrapper.get('#storage').text()).toContain('the limit is 500 of each resource');
    const steps = wrapper.findAll('[data-testid=storehouse-steps] tbody tr').map((r) => r.findAll('td').map((td) => td.text()));
    expect(steps[0]).toEqual(['No. 2', '1 storehouse at level 10']);
    expect(steps[3]).toEqual(['No. 5 and every one after', '4 storehouses at level 25']);
    wrapper.unmount();
  });

  it('links a building only at its first mention and links the shrines page', async () => {
    const wrapper = await mountPage();

    expect(wrapper.findAll('[data-building-link=link][data-type=lumberjack]')).toHaveLength(1);
    expect(wrapper.find('a[href="/docs/shrines"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/docs/land-movement"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the admin note from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the admin note to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.get('[data-testid=admin-note]').text()).toContain('include the neighbour boost');
    wrapper.unmount();
  });
});
