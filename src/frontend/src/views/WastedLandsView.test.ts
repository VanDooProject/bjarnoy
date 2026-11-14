// @vitest-environment jsdom
//
// The Wasted Lands page's Naglfar part: the crew table and every rule figure come from the camp rules mirror, the
// placement and art details sit in admin notes, and the history note only shows with "Show history" on.
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import WastedLandsView from './WastedLandsView.vue';
import { useAuthStore } from '../stores/auth';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import type { UserResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }, { path: '/docs', component: { template: '<div />' } }],
  });
  const wrapper = mount(WastedLandsView, {
    attachTo: document.body,
    global: {
      plugins: [createTestI18n({ docs: enDocs, catalogue: enCatalogue }), router],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true, WastedIsland: true, UtgardExample: true, AnimatedGiant: true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('WastedLandsView: Naglfar', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useAuthStore().user = { role: 'player' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(false);
  });

  it('lists the crew: one Naglfar at 30,000 / 30,000 and 100 rime ships at 300 / 300', async () => {
    const wrapper = await mountPage();

    const rows = wrapper.findAll('[data-testid=naglfar-crew] tbody tr').map((r) => r.findAll('td').map((td) => td.text()));
    expect(rows).toEqual([
      ['Naglfar', '1', '30,000', '30,000'],
      ['Rime ship', '100', '300', '300'],
    ]);
    expect(wrapper.get('#naglfar').text()).toContain('60,000 attack and 60,000 defense, about as much as 1,000 Snekkjas');
    wrapper.unmount();
  });

  it('states the guard range, calm, regrowth, no gate and the fixed loot from the rules mirror', async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#naglfar').text();
    expect(text).toContain('within 8 hexes of Naglfar is ambushed in a full battle');
    expect(text).toContain('calm for 1 hour');
    expect(text).toContain('stays empty for 1 hour before the crew starts to regrow, over 48 hours');
    expect(text).toContain('fleets can land on Utgard\'s island whether Naglfar is beaten or not');
    expect(text).toContain('takes 6,000 resources: iron 3,000, wood 1,500, brick 1,500');
    wrapper.unmount();
  });

  it('keeps the placement and art details and the history from players', async () => {
    const wrapper = await mountPage();

    const text = wrapper.get('#naglfar').text();
    expect(text).not.toContain('giantnaglfar');
    expect(text).not.toContain('lower q');
    expect(text).not.toContain('Gylfaginning');
    wrapper.unmount();
  });

  it('shows the placement and art notes to an admin with the notes switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = await mountPage();

    const text = wrapper.get('#naglfar').text();
    expect(text).toContain('closest to Utgard\'s anchor');
    expect(text).toContain('giantnaglfar');
    wrapper.unmount();
  });
});
