// @vitest-environment jsdom
// RouteModal.vue's own dialog chrome/close logic — extracted from
// ProfileModal.vue, which keeps its own tests (backdrop click, Escape, the
// nested report dialog) covering this same code as used by a real modal
// route. This file covers the generic behaviour once, independent of any
// one caller: the desktop/mobile switch, the title, and the
// back-vs-replace close logic.
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteModal from './RouteModal.vue';
import { createTestI18n } from '../../test/i18n';
import enProfile from '../../i18n/locales/en/profile.json';

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/leaderboards', name: 'leaderboards', component: { template: '<div />' } },
    ],
  });
}

function mountModal(router: Router, title = 'Leaderboards') {
  return mount(RouteModal, {
    props: { title },
    slots: { default: '<div class="modal-body-content">content</div>' },
    global: { plugins: [router, createTestI18n({ profile: enProfile })] },
  });
}

function setIsMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setActivePinia(createPinia());
  setIsMobile(false);
});

afterEach(() => {
  // @ts-expect-error test-only cleanup
  delete window.matchMedia;
});

describe('RouteModal', () => {
  it('renders the slotted content', async () => {
    const router = testRouter();
    await router.push('/leaderboards');
    await router.isReady();

    const wrapper = mountModal(router);
    expect(wrapper.find('.modal-body-content').text()).toBe('content');
  });

  it('closes on backdrop click, going back to the stashed backgroundView', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/leaderboards', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = mountModal(router);
    await wrapper.find('.modal-backdrop').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('closing on a directly-loaded route (no backgroundView) replaces with /settlement', async () => {
    const router = testRouter();
    await router.push('/leaderboards');
    await router.isReady();

    const wrapper = mountModal(router);
    await wrapper.find('.modal-backdrop').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('closes on Escape', async () => {
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/leaderboards', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = mountModal(router);
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('shows a close (X) button, no back chevron, on desktop', async () => {
    setIsMobile(false);
    const router = testRouter();
    await router.push('/leaderboards');
    await router.isReady();

    const wrapper = mountModal(router);

    expect(wrapper.find('.close-button').exists()).toBe(true);
    expect(wrapper.find('.back-button').exists()).toBe(false);
  });

  it('shows a back chevron and the title, no close button, on mobile', async () => {
    setIsMobile(true);
    const router = testRouter();
    await router.push('/leaderboards');
    await router.isReady();

    const wrapper = mountModal(router, 'Leaderboards');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.back-button').exists()).toBe(true);
    expect(wrapper.find('.close-button').exists()).toBe(false);
    expect(wrapper.find('.mobile-title').text()).toBe('Leaderboards');
  });

  it('back chevron closes the modal the same way as the close button', async () => {
    setIsMobile(true);
    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/leaderboards', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = mountModal(router);
    await wrapper.vm.$nextTick();
    await wrapper.find('.back-button').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });
});
