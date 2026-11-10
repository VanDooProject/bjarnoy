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
import enIntro from '../../i18n/locales/en/intro.json';
import { introMounted } from '../../intro/introSignal';

const { listJoinableWorlds, getWorldMembership } = vi.hoisted(() => ({
  listJoinableWorlds: vi.fn(),
  getWorldMembership: vi.fn(),
}));

const { mountLandingIntro } = vi.hoisted(() => ({ mountLandingIntro: vi.fn() }));
vi.mock('../../intro/startLandingIntro', () => ({ mountLandingIntro }));

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
      { path: '/register', name: 'register', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/docs', name: 'docs', component: { template: '<div />' } },
    ],
  });
}

async function mountMenu(props: { unclaimedRealm?: boolean; landingEntries?: boolean } = {}) {
  const router = testRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(ReturningPlayerMenu, {
    props,
    global: { plugins: [router, createTestI18n({ hud: enHud, worlds: enWorlds, intro: enIntro })] },
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

describe('ReturningPlayerMenu unclaimed realm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listJoinableWorlds.mockReset().mockResolvedValue([]);
    getWorldMembership.mockReset();
  });

  it('leads the panel with a "Name your jarl" row that routes to /register, above "Log in"', async () => {
    const { wrapper, router } = await mountMenu({ unclaimedRealm: true });
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    const rows = wrapper.findAll('[role="menuitem"]');
    expect(rows[0].attributes('data-testid')).toBe('returning-player-name-jarl');
    expect(rows[1].attributes('data-testid')).toBe('returning-player-login');
    await rows[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/register');
  });

  it('has no "Name your jarl" row otherwise', async () => {
    const { wrapper } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    expect(wrapper.find('[data-testid="returning-player-name-jarl"]').exists()).toBe(false);
  });
});

describe('ReturningPlayerMenu settings row', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listJoinableWorlds.mockReset().mockResolvedValue([]);
    getWorldMembership.mockReset();
  });

  it('offers the device settings to an anonymous player, opening /settings as a modal', async () => {
    const world = useWorldStore();
    world.worldId = null;
    world.worldName = null;

    const { wrapper, router } = await mountMenu();
    await wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();

    const row = wrapper.find('[data-testid="returning-player-settings"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toBe('Settings');
    expect(row.attributes('href')).toBe('/settings');

    await row.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settings');
    expect((router.options.history.state as { backgroundView?: unknown }).backgroundView).toBe('/');
    expect(wrapper.find('[data-testid="returning-player-menu"]').exists()).toBe(false);
  });
});

describe('ReturningPlayerMenu landing entries', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listJoinableWorlds.mockReset().mockResolvedValue([]);
    getWorldMembership.mockReset();
    mountLandingIntro.mockReset();
    introMounted.value = false;
  });

  async function openMenu(props: { landingEntries?: boolean }) {
    const mounted = await mountMenu(props);
    await mounted.wrapper.find('[data-testid="returning-player-trigger"]').trigger('click');
    await flushPromises();
    return mounted;
  }

  it('has no Start page or Play intro row by default, and never a Docs row ("How to play" floats beside the trigger)', async () => {
    const { wrapper } = await openMenu({});
    expect(wrapper.find('[data-testid="returning-player-start-page"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="returning-player-play-intro"]').exists()).toBe(false);
  });

  it('has no Docs row among the landing entries', async () => {
    const { wrapper } = await openMenu({ landingEntries: true });
    expect(wrapper.find('[data-testid="returning-player-docs"]').exists()).toBe(false);
  });

  it('plays the intro and closes the menu', async () => {
    const { wrapper } = await openMenu({ landingEntries: true });
    await wrapper.find('[data-testid="returning-player-play-intro"]').trigger('click');
    expect(mountLandingIntro).toHaveBeenCalledWith({ playNow: true });
    expect(wrapper.find('[data-testid="returning-player-menu"]').exists()).toBe(false);
  });

  it('opens the start page (the intro waiting for play) and closes the menu', async () => {
    const { wrapper } = await openMenu({ landingEntries: true });
    await wrapper.find('[data-testid="returning-player-start-page"]').trigger('click');
    expect(mountLandingIntro).toHaveBeenCalledWith({ playNow: false });
    expect(wrapper.find('[data-testid="returning-player-menu"]').exists()).toBe(false);
  });

  it('drops the Play intro row while the intro is on screen', async () => {
    introMounted.value = true;
    const { wrapper } = await openMenu({ landingEntries: true });
    expect(wrapper.find('[data-testid="returning-player-play-intro"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="returning-player-start-page"]').exists()).toBe(false);
  });
});
