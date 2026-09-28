// @vitest-environment jsdom
// The background-route pattern (App.vue + lib/profileRoute.ts + components/
// profile/ProfileModal.vue): opening a profile pushes the own-profile/
// profile route, but the page that was showing before keeps rendering
// underneath, through the very same <router-view> element — never a second,
// separately-mounted one — so a persistent renderer (MapView's Pixi canvas
// in real use) survives the modal opening and closing. AccountRestrictedBanner/
// DemoModeBadge/ProfileModal are stubbed out here: this file is only about
// which route <router-view> renders and whether it remounts, not about
// those components' own content.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

const settlementMounted = vi.fn();
const SettlementStub = {
  name: 'SettlementStub',
  template: '<div class="settlement-stub" />',
  mounted: settlementMounted,
};
const WorldStub = { name: 'WorldStub', template: '<div class="world-stub" />' };

function testRouter(initialPath = '/settlement', { lazySettlement = false } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      // The real router loads MapView lazily; `lazySettlement` mirrors that.
      { path: '/settlement', name: 'settlement', component: lazySettlement ? () => Promise.resolve(SettlementStub) : SettlementStub },
      { path: '/world', name: 'world', component: WorldStub },
      { path: '/profile', name: 'own-profile', component: WorldStub },
      { path: '/profile/:userName', name: 'profile', component: WorldStub },
      { path: '/leaderboards', name: 'leaderboards', component: WorldStub },
      { path: '/guild', name: 'guild', component: WorldStub },
    ],
  });
  router.push(initialPath);
  return router;
}

function mountApp(router: ReturnType<typeof testRouter>) {
  return mount(App, {
    global: {
      plugins: [router],
      stubs: {
        AccountRestrictedBanner: true,
        DemoModeBadge: true,
        ProfileModal: true,
        LeaderboardModal: true,
        GuildModal: true,
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  settlementMounted.mockClear();
});

describe('App background-route pattern', () => {
  it('renders a normal route (no profile) through router-view as before, with no modal', async () => {
    const router = testRouter('/world');
    await router.isReady();
    const wrapper = mountApp(router);

    expect(wrapper.find('.world-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(false);
  });

  it('keeps the background view mounted, unremounted, while the profile modal opens and closes', async () => {
    const router = testRouter('/settlement');
    await router.isReady();
    const wrapper = mountApp(router);
    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(settlementMounted).toHaveBeenCalledTimes(1);

    // Same navigation profileLocation() would produce for an in-app "go to
    // profile" click from /settlement.
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(true);
    // The critical assertion: still the same instance, not a fresh mount.
    expect(settlementMounted).toHaveBeenCalledTimes(1);

    await router.push('/settlement');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(false);
    expect(settlementMounted).toHaveBeenCalledTimes(1);
  });

  it('renders the settlement view behind a directly-loaded profile route (no backgroundView state)', async () => {
    const router = testRouter('/profile/floki');
    await router.isReady();
    const wrapper = mountApp(router);

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(true);
  });

  it('loads a lazy settlement route before rendering it behind a directly-loaded profile', async () => {
    // Regression: resolve() leaves a lazy route's `() => import()` loader in
    // place, and <router-view> rendered its Promise as the text
    // "[object Promise]" behind the modal.
    const router = testRouter('/profile/floki', { lazySettlement: true });
    await router.isReady();
    const wrapper = mountApp(router);
    await flushPromises();

    expect(wrapper.text()).not.toContain('[object Promise]');
    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(true);
  });

  it('renders leaderboards as a modal over the background view, keeping it mounted', async () => {
    const router = testRouter('/settlement');
    await router.isReady();
    const wrapper = mountApp(router);
    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(settlementMounted).toHaveBeenCalledTimes(1);

    await router.push({ path: '/leaderboards', state: { backgroundView: '/settlement' } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LeaderboardModal' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'GuildModal' }).exists()).toBe(false);
    expect(settlementMounted).toHaveBeenCalledTimes(1);

    await router.push('/settlement');
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: 'LeaderboardModal' }).exists()).toBe(false);
    expect(settlementMounted).toHaveBeenCalledTimes(1);
  });

  it('renders guild as a modal over the background view', async () => {
    const router = testRouter('/settlement');
    await router.isReady();
    const wrapper = mountApp(router);

    await router.push({ path: '/guild', state: { backgroundView: '/settlement' } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'GuildModal' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LeaderboardModal' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ProfileModal' }).exists()).toBe(false);
  });

  it('renders the settlement view behind a directly-loaded leaderboards route (no backgroundView state)', async () => {
    const router = testRouter('/leaderboards');
    await router.isReady();
    const wrapper = mountApp(router);

    expect(wrapper.find('.settlement-stub').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LeaderboardModal' }).exists()).toBe(true);
  });
});
