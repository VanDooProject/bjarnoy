// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import MobileHudDrawer from './MobileHudDrawer.vue';
import { usePlayerStore } from '../../stores/player';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

async function mountDrawer(path: string, props: { hasResourceBar?: boolean } = {}) {
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
    props,
    global: { plugins: [router, createTestI18n({ hud: enHud, onboarding: enOnboarding })] },
  });
}

function linkLabels(wrapper: Awaited<ReturnType<typeof mountDrawer>>) {
  return wrapper.findAll('.drawer-links > .link').map((b) => b.text());
}

// The drawer's "Landing" link follows the same rule as HudNav.vue's
// (composables/useLandingLink.ts): hidden on the landing route itself and
// once the player has founded — a founded player was still offered it on a
// phone, where it only reads as "start over".
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

// One place per action: "Name your jarl" / "Log in" / the world list live on
// the floating ReturningPlayerMenu chip (HudNav.vue), so the in-game drawer
// doesn't repeat them. A registered player has no chip; their Profile/Log out
// stay here.
describe('MobileHudDrawer account section', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function foundAndOnboard() {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    player.onboardingComplete = true;
    return player;
  }

  it('lists no anonymous account entries after the nudge was dismissed', async () => {
    foundAndOnboard().dismissProfileNudge();
    const wrapper = await mountDrawer('/settlement', { hasResourceBar: true });
    expect(wrapper.findAll('[data-testid^="drawer-account-"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="profile-nudge"]').exists()).toBe(false);
  });

  it('carries only the account-creation nudge while it is unanswered', async () => {
    foundAndOnboard();
    const wrapper = await mountDrawer('/settlement', { hasResourceBar: true });
    expect(wrapper.find('[data-testid="profile-nudge"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="drawer-account-"]')).toHaveLength(0);
  });

  it('keeps Profile and Log out for a registered player', async () => {
    foundAndOnboard();
    useAuthStore().user = {
      id: 'user-1',
      userName: 'ragnar',
      role: 'player',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };
    const wrapper = await mountDrawer('/settlement', { hasResourceBar: true });
    expect(wrapper.find('[data-testid="drawer-account-profile"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-account-logout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-nudge"]').exists()).toBe(false);
  });
});
