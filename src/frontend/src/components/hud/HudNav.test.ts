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

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/world', '/leaderboards', '/reports', '/guild', '/docs', '/register', '/profile', '/settlement'].map(
      (path) => ({ path, component: { template: '<div />' } }),
    ),
  });
}

async function mountHudNav() {
  const router = testRouter();
  await router.push('/');
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
    expect(wrapper.find('.avatar').classes()).toContain('is-nudging');
    expect(wrapper.find('.nudge-dot').exists()).toBe(true);
    expect(wrapper.text()).toContain('Three buildings, no jarl.');
  });

  it('does not show before founding', async () => {
    const wrapper = await mountHudNav();
    expect(wrapper.find('.avatar').classes()).not.toContain('is-nudging');
    expect(wrapper.text()).not.toContain('Three buildings, no jarl.');
  });

  it('does not show before onboarding is actually complete', async () => {
    const player = usePlayerStore();
    player.hasFoundedSettlement = true;
    const wrapper = await mountHudNav();
    expect(wrapper.find('.avatar').classes()).not.toContain('is-nudging');
  });

  it('does not show once dismissed', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    player.dismissProfileNudge();
    const wrapper = await mountHudNav();
    expect(wrapper.find('.avatar').classes()).not.toContain('is-nudging');
  });

  it('does not show once a nickname is already set', async () => {
    const player = usePlayerStore();
    foundAndOnboarded(player);
    player.nickname = 'Ragnar';
    const wrapper = await mountHudNav();
    expect(wrapper.find('.avatar').classes()).not.toContain('is-nudging');
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
    // /profile, not /register) — no nudge, no is-nudging class anywhere.
    expect(wrapper.find('.nudge-dot').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Three buildings, no jarl.');
  });
});
