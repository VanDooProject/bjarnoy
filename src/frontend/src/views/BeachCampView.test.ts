// @vitest-environment jsdom
//
// The beach camp page: the camp's figures come from the camp rules (lib/founding.ts), the Cart Workshop link from the building catalogue,
// and the page names every rule a player needs.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import BeachCampView from './BeachCampView.vue';
import { useAuthStore } from '../stores/auth';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import buildingCatalogue from '../data/building-catalogue.json';
import type { BuildingDefinitionResponse, UserResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const wrapper = mount(BeachCampView, {
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
  useAuthStore().user = { role: 'player' } as unknown as UserResponse;
});

describe('BeachCampView', () => {
  it('says what a camp costs and how long it takes: two builders, 200 wood and 100 brick, 10 minutes', async () => {
    const wrapper = await mountPage();

    const setup = wrapper.get('#setup').text();
    expect(setup).toContain('exactly 2 Camp builder');
    expect(setup).toContain('200 Wood · 100 Brick');
    expect(setup).toContain('10 minutes');
    expect(wrapper.find('#setup a[href]').exists()).toBe(true); // the Cart Workshop link
    wrapper.unmount();
  });

  it('lists where it goes, the waiting troops and ships, and what comes home on a recall', async () => {
    const wrapper = await mountPage();

    const rules = wrapper.findAll('#setup li').map((li) => li.text());
    expect(rules).toHaveLength(5);
    expect(rules[0]).toContain('sand hex');
    expect(rules[1]).toContain('enemy');
    expect(rules[2]).toContain('one hex out on the water');
    expect(rules[4]).toContain('recall');
    wrapper.unmount();
  });

  it('states the stock cap, no production, its own hex and the settlement limit', async () => {
    const wrapper = await mountPage();

    expect(wrapper.get('#holds').text()).toContain('up to 2,000 of each resource');
    expect(wrapper.get('#holds').text()).toContain('produces nothing');
    expect(wrapper.get('#claim').text()).toContain('only its own hex');
    expect(wrapper.get('#claim').text()).toContain('does not count towards your limit');
    expect(wrapper.find('#claim a[href="/docs/realm"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('says a camp falls only to an attack that leaves nobody in it, and that nothing destroys a guarded one', async () => {
    const wrapper = await mountPage();

    const risks = wrapper.get('#risks').text();
    expect(risks).toContain('falls only to an attack that leaves nobody in it while the attacker still has troops left');
    expect(risks).toContain('needs no siege engines');
    expect(risks).toContain('A raid only plunders it');
    expect(risks).toContain('nothing destroys it: not catapults, rams or fire ships');
    wrapper.unmount();
  });
});
