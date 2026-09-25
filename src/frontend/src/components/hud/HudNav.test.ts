// @vitest-environment jsdom
// Design handoff "2a" frame 5: the profile-mark nudge that replaces the old
// forced end-of-flow nickname modal. This is HudNav's own show/hide gate
// (showProfileNudge) — ProfileNudge.test.ts covers the nudge panel's own
// content/actions.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudNav from './HudNav.vue';
import { usePlayerStore } from '../../stores/player';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

// Named the same as the real router (router/index.ts) for the routes this
// file's tests actually care about — HudNav's `landing`/`world` v-ifs key off
// `route.name`, which a bare `path` list (with no `name`) can never satisfy.
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div />' } },
      { path: '/world', name: 'world', component: { template: '<div />' } },
      { path: '/leaderboards', name: 'leaderboards', component: { template: '<div />' } },
      { path: '/reports', name: 'reports', component: { template: '<div />' } },
      { path: '/guild', name: 'guild', component: { template: '<div />' } },
      { path: '/docs', name: 'docs', component: { template: '<div />' } },
      { path: '/register', name: 'register', component: { template: '<div />' } },
      { path: '/profile', name: 'profile', component: { template: '<div />' } },
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
    ],
  });
}

async function mountHudNav(path = '/') {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  return mount(HudNav, {
    global: { plugins: [router, createTestI18n({ hud: enHud, onboarding: enOnboarding })] },
  });
}

// Same as mountHudNav, but also hands back the router — the account-menu
// tests below need it to assert on navigation.
async function mountHudNavWithRouter(path = '/settlement') {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(HudNav, {
    global: { plugins: [router, createTestI18n({ hud: enHud, onboarding: enOnboarding })] },
  });
  return { wrapper, router };
}

function foundAndOnboarded(player: ReturnType<typeof usePlayerStore>) {
  player.hasFoundedSettlement = true;
  player.onboardingComplete = true;
}

describe('HudNav profile nudge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows once founded and onboarded, for an anonymous player who has not dismissed it', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    const wrapper = await mountHudNav();
    expect(wrapper.find('[data-testid="returning-player-trigger"]').classes()).toContain('is-nudging');
    expect(wrapper.find('.nudge-dot').exists()).toBe(true);
    expect(wrapper.text()).toContain('Three buildings, no jarl.');
  });

  it('does not show before founding', async () => {
    const wrapper = await mountHudNav();
    expect(wrapper.find('[data-testid="returning-player-trigger"]').classes()).not.toContain('is-nudging');
    expect(wrapper.text()).not.toContain('Three buildings, no jarl.');
  });

  it('does not show before onboarding is actually complete', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const wrapper = await mountHudNav();
    expect(wrapper.find('[data-testid="returning-player-trigger"]').classes()).not.toContain('is-nudging');
  });

  it('does not show once dismissed', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    player.dismissProfileNudge();
    const wrapper = await mountHudNav();
    expect(wrapper.find('[data-testid="returning-player-trigger"]').classes()).not.toContain('is-nudging');
  });

  it('does not show once a nickname is already set', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    player.nickname = 'Ragnar';
    const wrapper = await mountHudNav();
    expect(wrapper.find('[data-testid="returning-player-trigger"]').classes()).not.toContain('is-nudging');
  });

  it('does not show for an authenticated player, even if otherwise eligible', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    const auth = useAuthStore();
    auth.user = {
      id: 'user-1',
      userName: 'ragnar',
      role: 'player',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };
    const wrapper = await mountHudNav();
    // The authenticated branch renders a different avatar entirely (opens
    // /profile, not ReturningPlayerMenu) — no nudge, no is-nudging class
    // anywhere, and no returning-player trigger at all.
    expect(wrapper.find('[data-testid="returning-player-trigger"]').exists()).toBe(false);
    expect(wrapper.find('.nudge-dot').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Three buildings, no jarl.');
  });
});

function authenticate(auth: ReturnType<typeof useAuthStore>) {
  auth.user = {
    id: 'user-1',
    userName: 'ragnar',
    role: 'player',
    status: 'active',
    displayName: null,
    isPremium: false,
    preferredLocale: null,
  };
}

// Returning-player nav work: Leaderboards and World Map used to be reachable
// (or, for World Map, a dead click — see the `HudNav link visibility`
// describe block below) for an anonymous visitor too; both are now gated on
// being logged in, World Map on top of the pre-existing founded-settlement
// gate.
describe('HudNav auth gating', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hides Leaderboards when logged out', async () => {
    const wrapper = await mountHudNav();
    expect(wrapper.text()).not.toContain('Leaderboards');
  });

  it('shows Leaderboards once authenticated', async () => {
    const auth = useAuthStore();
    authenticate(auth);
    const wrapper = await mountHudNav();
    expect(wrapper.text()).toContain('Leaderboards');
  });

  it('hides World map when neither authenticated nor founded', async () => {
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).not.toContain('World map');
  });

  it('hides World map when authenticated but not founded', async () => {
    const auth = useAuthStore();
    authenticate(auth);
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).not.toContain('World map');
  });

  it('hides World map when founded but not authenticated', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).not.toContain('World map');
  });

  it('shows World map only once both authenticated and founded', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const auth = useAuthStore();
    authenticate(auth);
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).toContain('World map');
  });
});

// landing-page-defects.md L1: both links are guard-dead on any pre-founding
// route (`/world` bounces straight back to `/`, see router/index.ts) or a
// self-link (`route.name === 'landing'`) — this is independent of
// LandingView's own header swap (LandingView.test.ts doesn't exist; that
// half is covered by e2e/landing.spec.ts instead, since it needs the real
// router guard and canvas), because HudNav is reused by every other
// pre-founding route this same bug could show up on.
describe('HudNav link visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hides World map before founding — the router guard bounces it straight back', async () => {
    const wrapper = await mountHudNav('/');
    expect(wrapper.text()).not.toContain('World map');
  });

  it('shows World map once founded and authenticated', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const auth = useAuthStore();
    authenticate(auth);
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).toContain('World map');
  });

  it('hides the Landing self-link while already on the landing route', async () => {
    const wrapper = await mountHudNav('/');
    expect(wrapper.text()).not.toContain('Landing');
  });

  it('shows the Landing link on any other route', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const wrapper = await mountHudNav('/settlement');
    expect(wrapper.text()).toContain('Landing');
  });
});

// Player logout/login gate: the authenticated avatar is now a small account
// dropdown (Profile / Log out) instead of a direct link to /profile.
describe('HudNav account menu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('opens on trigger click and Profile routes to /profile', async () => {
    const auth = useAuthStore();
    authenticate(auth);
    const { wrapper, router } = await mountHudNavWithRouter();

    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="account-menu-trigger"]').trigger('click');
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(true);

    await wrapper.find('[data-testid="account-menu-profile"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/profile');
    // Navigating away closes the menu, same as ReturningPlayerMenu's panel.
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);
  });

  it('Log out calls auth.logout, forgets the local identity, and ends with a full page load to /', async () => {
    const auth = useAuthStore();
    authenticate(auth);
    localStorage.setItem('bjarnoy.playerId', 'player-1');
    localStorage.setItem('bjarnoy.settlementId', 'settlement-1');
    localStorage.setItem('bjarnoy.settlementsByWorld', '{"world-1":"settlement-1"}');
    localStorage.setItem('bjarnoy.onboardingComplete', '1');
    localStorage.setItem('bjarnoy.profileNudgeDismissed', '1');
    localStorage.setItem('bjarnoy.nickname', 'Ragnar');
    localStorage.setItem('bjarnoy.worldId', 'world-1');
    localStorage.setItem('bjarnoy.locale', 'de');

    // jsdom's window.location doesn't support vi.spyOn directly (its
    // `assign` isn't a plain, reconfigurable own property) — swap the whole
    // object out for the duration of this test instead.
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    const { wrapper } = await mountHudNavWithRouter();

    await wrapper.find('[data-testid="account-menu-trigger"]').trigger('click');
    await wrapper.find('[data-testid="account-menu-logout"]').trigger('click');
    await flushPromises();

    expect(auth.isAuthenticated).toBe(false);
    for (const key of [
      'bjarnoy.playerId',
      'bjarnoy.settlementId',
      'bjarnoy.settlementsByWorld',
      'bjarnoy.onboardingComplete',
      'bjarnoy.profileNudgeDismissed',
      'bjarnoy.nickname',
    ]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    expect(localStorage.getItem('bjarnoy.worldId')).toBe('world-1');
    expect(localStorage.getItem('bjarnoy.locale')).toBe('de');
    expect(localStorage.getItem('bjarnoy.lastAccount')).toBe('ragnar');
    expect(assignSpy).toHaveBeenCalledWith('/');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });
});

// Mobile audit: below 768px the links move into a collapsible dropdown
// behind a hamburger toggle (`.nav-links`/`.menu-toggle`) rather than
// rendering off-screen. The toggle exists at every viewport width (CSS alone
// hides it on desktop), so these tests don't need to fake a narrow viewport.
describe('HudNav mobile menu toggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('is closed by default and opens on toggle click', async () => {
    const wrapper = await mountHudNav();
    const links = wrapper.get('[data-testid="hud-nav-links"]');
    const toggle = wrapper.get('[data-testid="hud-nav-menu-toggle"]');

    expect(links.classes()).not.toContain('open');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    expect(links.classes()).toContain('open');
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await toggle.trigger('click');
    expect(links.classes()).not.toContain('open');
  });

  it('closes after clicking a link inside the panel', async () => {
    const wrapper = await mountHudNav('/settlement');
    await wrapper.get('[data-testid="hud-nav-menu-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).toContain('open');

    // Any of the always-visible `.link` buttons closes it — reports is
    // rendered on every route.
    await wrapper.get('.reports-link').trigger('click');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).not.toContain('open');
  });

  it('closes on Escape', async () => {
    const wrapper = await mountHudNav();
    await wrapper.get('[data-testid="hud-nav-menu-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).toContain('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).not.toContain('open');
  });

  it('closes on an outside pointerdown', async () => {
    const wrapper = await mountHudNav();
    await wrapper.get('[data-testid="hud-nav-menu-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).toContain('open');

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).not.toContain('open');
  });

  it('closes on route change', async () => {
    const { wrapper, router } = await mountHudNavWithRouter('/settlement');
    await wrapper.get('[data-testid="hud-nav-menu-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).toContain('open');

    await router.push('/docs');
    expect(wrapper.get('[data-testid="hud-nav-links"]').classes()).not.toContain('open');
  });
});
