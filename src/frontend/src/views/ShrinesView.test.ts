// @vitest-environment jsdom
//
// The shrines page: one table row per god with figures read off the catalogue and the shrine formulas, links
// into the tech tree, and the unfinished runes section kept out of players' sight.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ShrinesView from './ShrinesView.vue';
import { useAuthStore } from '../stores/auth';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import catalogue from '../data/building-catalogue.json';
import type { BuildingDefinitionResponse, UserResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }, { path: '/docs', component: { template: '<div />' } }, { path: '/docs/tech-tree', component: { template: '<div />' } }],
  });
  const wrapper = mount(ShrinesView, {
    attachTo: document.body,
    global: {
      plugins: [createTestI18n({ docs: enDocs }), router],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('ShrinesView', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBuildingCatalogueStore().definitions = catalogue.data as BuildingDefinitionResponse[];
    useAuthStore().user = { role: 'player' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(false);
  });

  it('lists the five gods with their favour at levels 1, 3 and 5', async () => {
    const wrapper = await mountPage();

    const rows = wrapper.findAll('[data-testid=gods-table] tbody tr');
    expect(rows.map((r) => r.attributes('data-god'))).toEqual(['thor', 'freyja', 'ullr', 'njord', 'odin']);
    const thor = rows[0]!.findAll('td').map((td) => td.text());
    expect(thor.slice(1, 4)).toEqual(['+10%', '+16%', '+22%']);
    const odin = rows[4]!.findAll('td').map((td) => td.text());
    expect(odin.slice(1, 4)).toEqual(['−2% build time+2 vision rings', '−6% build time+6 vision rings', '−10% build time+10 vision rings']);
    wrapper.unmount();
  });

  it('names what each shrine needs and where it stands, from the catalogue', async () => {
    const wrapper = await mountPage();

    const njord = wrapper.get('[data-god=njord]').findAll('td').map((td) => td.text());
    expect(njord[4]).toBe('Dockyard 10');
    expect(njord[5]).toBe('Shallow (coastal) water');
    expect(wrapper.get('[data-god=thor]').findAll('td')[4]!.text()).toBe('Weaponsmith 5');
    expect(wrapper.get('[data-god=thor]').findAll('td')[5]!.text()).toBe('Grassland');
    wrapper.unmount();
  });

  it('states the Longhouse level and maximum level from the catalogue and links each shrine into the tech tree', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#rules').text()).toContain('Longhouse of level 25');
    expect(wrapper.get('#rules').text()).toContain('level 5');
    const hrefs = wrapper.findAll('[data-testid=gods-table] a.link').map((a) => a.attributes('href'));
    expect(hrefs).toContain('/docs/tech-tree#shrineofthor');
    expect(hrefs).toContain('/docs/tech-tree#odinstatue');
    wrapper.unmount();
  });

  it('keeps the runes section from players, even with the stored admin toggle on', async () => {
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Work in progress');
    wrapper.unmount();
  });

  it('shows the runes section, labelled work in progress, to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    const note = wrapper.get('[data-testid=admin-note]');
    expect(note.text()).toContain('Work in progress');
    expect(note.text()).toContain('Fehu');
    expect(note.text()).toContain('+50%');
    wrapper.unmount();
  });
});
