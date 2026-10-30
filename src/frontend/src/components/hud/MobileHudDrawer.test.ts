// @vitest-environment jsdom
// The drawer's "Landing" link follows the same rule as HudNav.vue's
// (composables/useLandingLink.ts): hidden on the landing route itself and
// once the player has founded — a founded player was still offered it on a
// phone, where it only reads as "start over".
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import MobileHudDrawer from './MobileHudDrawer.vue';
import { usePlayerStore } from '../../stores/player';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

async function mountDrawer(path: string) {
  const stub = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: stub },
      { path: '/docs', name: 'docs', component: stub },
      { path: '/settlement', name: 'settlement', component: stub },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(MobileHudDrawer, {
    global: { plugins: [router, createTestI18n({ hud: enHud, onboarding: enOnboarding })] },
  });
}

function linkLabels(wrapper: Awaited<ReturnType<typeof mountDrawer>>) {
  return wrapper.findAll('.drawer-links > .link').map((b) => b.text());
}

describe('MobileHudDrawer Landing link', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('is offered on other routes to a player with nothing founded yet', async () => {
    const wrapper = await mountDrawer('/docs');
    expect(linkLabels(wrapper)).toContain('Landing');
  });

  it('is hidden on the landing route itself', async () => {
    const wrapper = await mountDrawer('/');
    expect(linkLabels(wrapper)).not.toContain('Landing');
  });

  it('is hidden on every route once the player has founded', async () => {
    usePlayerStore().hasFoundedSettlement = true;
    for (const path of ['/settlement', '/docs', '/']) {
      const wrapper = await mountDrawer(path);
      expect(linkLabels(wrapper)).not.toContain('Landing');
      wrapper.unmount();
    }
  });
});
