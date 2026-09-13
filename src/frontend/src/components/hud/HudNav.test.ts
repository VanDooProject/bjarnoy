// @vitest-environment jsdom
// Design handoff "2a" frame 5: the profile-mark nudge that replaces the old
// forced end-of-flow nickname modal. This is HudNav's own show/hide gate
// (showProfileNudge) — ProfileNudge.test.ts covers the nudge panel's own
// content/actions.
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
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
