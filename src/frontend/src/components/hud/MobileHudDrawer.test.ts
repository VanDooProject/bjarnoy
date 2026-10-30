// @vitest-environment jsdom
// The drawer and the desktop nav render from one entry list
// (composables/useHudNavEntries.ts): whatever HudNav offers inline plus in
// its avatar menu is exactly what the drawer lists.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import HudNav from './HudNav.vue';
import MobileHudDrawer from './MobileHudDrawer.vue';
import { usePlayerStore } from '../../stores/player';
import { useAuthStore } from '../../stores/auth';
import { useReportsStore } from '../../stores/reports';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

const stub = { template: '<div />' };
async function mountBoth(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['landing:/', 'settlement:/settlement', 'world:/world', 'leaderboards:/leaderboards', 'messages:/messages', 'reports:/reports', 'guild:/guild', 'docs:/docs'].map((r) => {
      const [name, p] = r.split(':') as [string, string];
      return { path: p, name, component: stub };
    }),
  });
  await router.push(path);
  await router.isReady();
  const global = { plugins: [router, createTestI18n({ hud: enHud, onboarding: enOnboarding })], stubs: { WorldList: true, LocaleSwitcher: true } };
  return { router, nav: mount(HudNav, { global }), drawer: mount(MobileHudDrawer, { global }) };
}

function drawerEntryTexts(drawer: Awaited<ReturnType<typeof mountBoth>>['drawer']) {
  return drawer.findAll('.drawer-links > .link').map((b) => b.text().replace(/\s*\d+$/, ''));
}

describe('MobileHudDrawer entries', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('logged in and founded: lists the same entries as the nav inline + avatar menu, without Landing', async () => {
    useAuthStore().user = { id: 'u', userName: 'r', role: 'player', status: 'active', displayName: null, isPremium: false, preferredLocale: null };
    usePlayerStore().hasFoundedSettlement = true;
    const { nav, drawer } = await mountBoth('/settlement');
    await nav.find('[data-testid="account-menu-trigger"]').trigger('click');
    const navTexts = [
      ...nav.findAll('.hud-nav > .link').map((b) => b.text()),
      ...nav.findAll('.menu-entries .row-entry').map((b) => b.text().replace(/\s*\d+$/, '')),
    ];
    expect(drawerEntryTexts(drawer)).toEqual(navTexts);
    expect(navTexts).toEqual(['Settlement', 'World map', 'Leaderboards', 'Messages', 'Reports', 'Alliance', 'Docs']);
  });

  it('anonymous before founding: offers Landing on both surfaces', async () => {
    const { nav, drawer } = await mountBoth('/docs');
    await nav.find('[data-testid="returning-player-trigger"]').trigger('click');
    const navTexts = nav.findAll('.menu-entries .row-entry').map((b) => b.text());
    expect(drawerEntryTexts(drawer)).toEqual(navTexts);
    expect(navTexts).toEqual(['Reports', 'Alliance', 'Docs', 'Landing']);
  });

  it('shows the unread reports count and closes after a click', async () => {
    useReportsStore().items = [{ id: 'r1', occurredAt: '2026-01-01T00:00:00Z' }] as never;
    const { drawer, router } = await mountBoth('/docs');
    const reports = drawer.findAll('.drawer-links > .link').find((b) => b.text().startsWith('Reports'))!;
    expect(reports.find('.badge').text()).toBe('1');
    await reports.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('reports');
    expect(drawer.emitted('close')).toHaveLength(1);
  });
});

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
