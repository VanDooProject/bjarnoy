// @vitest-environment jsdom
// Login↔world linkage (docs/plans/returning-player-world-switching.md):
// the "Log in" row inside the dropdown panel needs to carry the currently
// joined world's id/name along as query params so LoginView.vue can offer
// to found/return to it right after authenticating — see that component's
// own `loginTarget` computed. LoginView.test.ts covers reading those params
// back on the other end.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturningPlayerMenu from './ReturningPlayerMenu.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enWorlds from '../../i18n/locales/en/worlds.json';

const { listJoinableWorlds, getWorldMembership } = vi.hoisted(() => ({
  listJoinableWorlds: vi.fn(),
  getWorldMembership: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { listJoinableWorlds, getWorldMembership },
  };
});

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  });
}

async function mountMenu() {
  const router = testRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(ReturningPlayerMenu, {
    global: { plugins: [router, createTestI18n({ hud: enHud, worlds: enWorlds })] },
  });
  return { wrapper, router };
}

describe('ReturningPlayerMenu login link world linkage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listJoinableWorlds.mockReset().mockResolvedValue([]);
    getWorldMembership.mockReset();
  });

  it('links to plain /login with no query params when no world is joined yet (pre-founding)', async () => {
    const world = useWorldStore();
    world.worldId = null;
    world.worldName = null;

    const { wrapper, router } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="returning-player-login"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('carries the currently joined world\'s id and name as query params to /login', async () => {
    const world = useWorldStore();
    world.worldId = 'world-1';
    world.worldName = 'Midgard';

    const { wrapper, router } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="returning-player-login"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query).toEqual({ worldId: 'world-1', worldName: 'Midgard' });
  });

  it('omits worldName from the query when the world is joined but its display name is not yet cached', async () => {
    const world = useWorldStore();
    world.worldId = 'world-1';
    world.worldName = null;

    const { wrapper, router } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="returning-player-login"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ worldId: 'world-1' });
  });

  it('opens straight to the world list — no intermediate "join another world" step', async () => {
    const { wrapper } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="returning-player-login"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="returning-player-join-world"]').exists()).toBe(false);
    // No worlds mocked joinable here, so the list renders its empty state —
    // still proof the list itself, not a menu row pointing at /worlds, is
    // what's rendered inside the panel.
    expect(wrapper.text()).toContain('No worlds are open to join right now.');
  });
});
