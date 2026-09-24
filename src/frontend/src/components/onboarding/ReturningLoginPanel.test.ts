// @vitest-environment jsdom
// Player logout/login gate: the login form LandingView.vue shows instead of
// the founding hero once `player.lastAccount` is set and the visitor is
// anonymous (see LandingView's own `showReturningLoginGate`, and
// stores/player.ts's `forgetLocalIdentity`/`forgetLastAccount`). The gating
// itself lives in LandingView (untestable in isolation here — it needs the
// real canvas/map stack, so it's e2e territory), this file covers the panel:
// its own content/actions and the shared `useLoginForm` composable wiring.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturningLoginPanel from './ReturningLoginPanel.vue';
import { usePlayerStore } from '../../stores/player';
import { useAuthStore } from '../../stores/auth';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enOnboarding from '../../i18n/locales/en/onboarding.json';
import enLogin from '../../i18n/locales/en/login.json';

// Forced to live mode — see LoginView.test.ts's own copy of this comment:
// useLoginForm's "restore realm after login" branch only calls
// `world.joinWorld` when `!DEMO_MODE`, and the vitest config otherwise
// defaults DEMO_MODE to true.
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div />' } },
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
    ],
  });
}

async function mountPanel() {
  const router = testRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(ReturningLoginPanel, {
    global: { plugins: [router, createTestI18n({ onboarding: enOnboarding, login: enLogin })] },
  });
  return { wrapper, router };
}

describe('ReturningLoginPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('prefills the username from player.lastAccount, editable', async () => {
    const player = usePlayerStore();
    player.lastAccount = 'ragnar42';
    const { wrapper } = await mountPanel();

    expect(wrapper.text()).toContain('Welcome back, ragnar42');
    const usernameInput = wrapper.find('#returning-login-username');
    expect((usernameInput.element as HTMLInputElement).value).toBe('ragnar42');

    await usernameInput.setValue('someone-else');
    expect((usernameInput.element as HTMLInputElement).value).toBe('someone-else');
  });

  it('"Start a new realm instead" forgets the last account', async () => {
    const player = usePlayerStore();
    player.lastAccount = 'ragnar42';
    const { wrapper } = await mountPanel();

    await wrapper.find('[data-testid="returning-login-new-realm"]').trigger('click');

    expect(player.lastAccount).toBeNull();
  });

  it('on successful submit, logs in, restores the realm, and navigates to /settlement', async () => {
    // Regression: the panel used to `router.push('/')` from '/', a duplicate
    // navigation vue-router skips — so the guard that forwards a founded
    // player to /settlement never ran and the player stayed on the landing
    // page after logging back in (caught by the AppHost happy-path test).
    const player = usePlayerStore();
    player.lastAccount = 'ragnar42';
    const { wrapper, router } = await mountPanel();

    const auth = useAuthStore();
    auth.login = vi.fn().mockResolvedValue(undefined);
    const world = useWorldStore();
    world.worldId = 'world-9';
    world.joinWorld = vi.fn().mockImplementation(async () => {
      player.enterWorld('world-9', 'settlement-1');
    });

    await wrapper.find('[data-testid="returning-login-password"]').setValue('hunter2');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(auth.login).toHaveBeenCalledWith('ragnar42', 'hunter2');
    expect(world.joinWorld).toHaveBeenCalledWith('world-9');
    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('stays on the landing page after login when the account has no realm in this world', async () => {
    const player = usePlayerStore();
    player.lastAccount = 'ragnar42';
    const { wrapper, router } = await mountPanel();

    const auth = useAuthStore();
    auth.login = vi.fn().mockResolvedValue(undefined);
    const world = useWorldStore();
    world.worldId = 'world-9';
    world.joinWorld = vi.fn().mockImplementation(async () => {
      player.enterWorld('world-9', null);
    });

    await wrapper.find('[data-testid="returning-login-password"]').setValue('hunter2');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/');
  });

  it('shows an error and does not navigate when login fails', async () => {
    const player = usePlayerStore();
    player.lastAccount = 'ragnar42';
    const { wrapper, router } = await mountPanel();

    const auth = useAuthStore();
    auth.login = vi.fn().mockRejectedValue(new Error('nope'));
    const world = useWorldStore();
    world.joinWorld = vi.fn();

    await wrapper.find('[data-testid="returning-login-password"]').setValue('wrong');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.find('[data-testid="returning-login-error"]').exists()).toBe(true);
    expect(world.joinWorld).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/');
  });
});
