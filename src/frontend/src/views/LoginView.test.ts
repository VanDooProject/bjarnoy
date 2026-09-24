// @vitest-environment jsdom
// Login↔world linkage (docs/plans/returning-player-world-switching.md):
// ReturningPlayerMenu.vue's "Log in" row carries the currently joined
// world's id/name as `?worldId=&worldName=` query params (see that
// component's own test file for the sending side) — this covers the
// receiving side: LoginView reads them, shows a continuation line, and
// founds/returns to that world (instead of the generic redirect-or-/
// fallback) once login succeeds.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginView from './LoginView.vue';
import { useAuthStore } from '../stores/auth';
import { useWorldStore } from '../stores/world';
import { createTestI18n } from '../test/i18n';
import enLogin from '../i18n/locales/en/login.json';

// Player logout/login gate: forced to live mode so the "restore realm after
// login" assertion below (useLoginForm's `!DEMO_MODE && world.worldId`
// guard) actually exercises the `world.joinWorld` call — the vitest config
// otherwise defaults DEMO_MODE to true the same way a plain `npm run dev`
// does. Doesn't affect this file's other tests: they either don't submit,
// or go through LoginView's own linked-world branch, which calls
// `world.joinWorld` unconditionally regardless of DEMO_MODE.
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { ...actual, DEMO_MODE: false };
});

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/register', name: 'register', component: { template: '<div />' } },
    ],
  });
}

async function mountLoginView(query: Record<string, string> = {}): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = testRouter();
  await router.push({ path: '/login', query });
  await router.isReady();
  const wrapper = mount(LoginView, {
    global: { plugins: [router, createTestI18n({ login: enLogin })] },
  });
  return { wrapper, router };
}

async function submit(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#userName').setValue('ragnar');
  await wrapper.find('#password').setValue('hunter2');
  await wrapper.find('form').trigger('submit.prevent');
  await flushPromises();
}

describe('LoginView world linkage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows no continuation line and keeps the plain redirect-or-/ behaviour when no world is linked', async () => {
    const { wrapper, router } = await mountLoginView();
    expect(wrapper.text()).not.toContain("once you're logged in");

    const auth = useAuthStore();
    auth.login = vi.fn().mockResolvedValue(undefined);
    const world = useWorldStore();
    world.joinWorld = vi.fn();

    await submit(wrapper);

    expect(auth.login).toHaveBeenCalledWith('ragnar', 'hunter2');
    expect(world.joinWorld).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('shows the linked world\'s name and founds/returns to it after a successful login', async () => {
    const { wrapper, router } = await mountLoginView({ worldId: 'world-1', worldName: 'Midgard' });
    expect(wrapper.text()).toContain("You'll continue in Midgard once you're logged in.");

    const auth = useAuthStore();
    auth.login = vi.fn().mockResolvedValue(undefined);
    const world = useWorldStore();
    world.joinWorld = vi.fn().mockResolvedValue(undefined);

    await submit(wrapper);

    expect(auth.login).toHaveBeenCalledWith('ragnar', 'hunter2');
    expect(world.joinWorld).toHaveBeenCalledWith('world-1');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('falls back to a generic continuation line when the world is linked but has no cached display name', async () => {
    const { wrapper } = await mountLoginView({ worldId: 'world-1' });
    expect(wrapper.text()).toContain("You'll continue in your world once you're logged in.");
  });

  it('does not join the linked world if login itself fails', async () => {
    const { wrapper } = await mountLoginView({ worldId: 'world-1', worldName: 'Midgard' });

    const auth = useAuthStore();
    auth.login = vi.fn().mockRejectedValue(new Error('nope'));
    const world = useWorldStore();
    world.joinWorld = vi.fn();

    await submit(wrapper);

    expect(world.joinWorld).not.toHaveBeenCalled();
    expect(wrapper.find('.error').exists()).toBe(true);
  });

  // Player logout/login gate: a plain login (no linked world) still needs
  // this account's realm in whatever world is already loaded restored
  // before the redirect fires — otherwise the router guard sees an
  // unfounded player and strands them on the founding flow even though
  // they already own a settlement there. `world.worldId` here stands in
  // for "a world is already loaded" (set e.g. by a previous anonymous
  // visit) — DEMO_MODE is left at its default (non-demo in the vitest
  // config), so useLoginForm's own `!DEMO_MODE && world.worldId` guard
  // takes the restore branch.
  it('awaits world.joinWorld before the redirect when world.worldId is set and no world is linked', async () => {
    const { wrapper, router } = await mountLoginView();

    const auth = useAuthStore();
    auth.login = vi.fn().mockResolvedValue(undefined);
    const world = useWorldStore();
    world.worldId = 'world-9';
    let resolveJoin!: () => void;
    world.joinWorld = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveJoin = resolve;
        }),
    );

    const submitPromise = submit(wrapper);
    await flushPromises();

    // Still on /login: the redirect must wait for joinWorld to resolve.
    expect(world.joinWorld).toHaveBeenCalledWith('world-9');
    expect(router.currentRoute.value.path).toBe('/login');

    resolveJoin();
    await submitPromise;

    expect(router.currentRoute.value.path).toBe('/');
  });
});
