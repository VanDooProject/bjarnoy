// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileModal from './ProfileModal.vue';
import type { ProfileResponse } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import enProfile from '../../i18n/locales/en/profile.json';

const { getProfileByName, updateMyBio, reportProfile } = vi.hoisted(() => ({
  getProfileByName: vi.fn(),
  updateMyBio: vi.fn(),
  reportProfile: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { getProfileByName, updateMyBio, reportProfile },
  };
});

function profile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 'user-1',
    userName: 'ragnar',
    displayName: null,
    bio: 'hello',
    createdAt: '2026-01-15T00:00:00Z',
    settlementCount: 3,
    ...overrides,
  };
}

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settlement', name: 'settlement', component: { template: '<div />' } },
      { path: '/profile', name: 'own-profile', component: { template: '<div />' } },
      { path: '/profile/:userName', name: 'profile', component: { template: '<div />' } },
    ],
  });
}

async function mountModal(router: Router) {
  const wrapper = mount(ProfileModal, {
    global: { plugins: [router, createTestI18n({ profile: enProfile })] },
  });
  await flushPromises();
  return wrapper;
}

function ownProfileAuth() {
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
  return auth;
}

let matchMediaSpy: ReturnType<typeof vi.fn>;

function setIsMobile(matches: boolean) {
  matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.matchMedia = matchMediaSpy as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  setIsMobile(false);
});

afterEach(() => {
  // @ts-expect-error test-only cleanup
  delete window.matchMedia;
});

describe('ProfileModal', () => {
  it('closes on backdrop click, going back to the stashed backgroundView', async () => {
    getProfileByName.mockResolvedValue(profile());
    ownProfileAuth();

    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('.modal-backdrop').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('closes on Escape when the report dialog is not open', async () => {
    getProfileByName.mockResolvedValue(profile());
    const auth = useAuthStore();
    auth.user = {
      id: 'user-2',
      userName: 'floki',
      role: 'player',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };

    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile/ragnar', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('Escape closes only the report dialog, not the whole profile modal, while it is open', async () => {
    getProfileByName.mockResolvedValue(profile());
    const auth = useAuthStore();
    auth.user = {
      id: 'user-2',
      userName: 'floki',
      role: 'player',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };

    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile/ragnar', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.findAll('button').find((b) => b.text() === 'Report')!.trigger('click');
    expect(wrapper.find('.report-dialog').exists()).toBe(true);

    await wrapper.find('.report-dialog').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    // The report dialog closed, but the profile modal (and the route) did not.
    expect(wrapper.find('.report-dialog').exists()).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(router.currentRoute.value.path).toBe('/profile/ragnar');
  });

  it('closing on a directly-loaded route (no backgroundView) replaces with /settlement', async () => {
    getProfileByName.mockResolvedValue(profile({ userName: 'floki' }));

    const router = testRouter();
    await router.push('/profile/floki');
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('.modal-backdrop').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });

  it('shows a close (X) button, no back chevron, on desktop', async () => {
    getProfileByName.mockResolvedValue(profile());
    ownProfileAuth();
    setIsMobile(false);

    const router = testRouter();
    await router.push('/profile');
    await router.isReady();

    const wrapper = await mountModal(router);

    expect(wrapper.find('.close-button').exists()).toBe(true);
    expect(wrapper.find('.back-button').exists()).toBe(false);
  });

  it('shows a back chevron (labeled Back), no close button, and a title, on mobile', async () => {
    getProfileByName.mockResolvedValue(profile());
    ownProfileAuth();
    setIsMobile(true);

    const router = testRouter();
    await router.push('/profile');
    await router.isReady();

    const wrapper = await mountModal(router);
    await flushPromises();

    expect(wrapper.find('.back-button').exists()).toBe(true);
    expect(wrapper.find('.back-button').attributes('aria-label')).toBe('Back');
    expect(wrapper.find('.close-button').exists()).toBe(false);
    expect(wrapper.find('.mobile-title').text()).toBe('ragnar');
  });

  it('back chevron closes the modal the same way as the close button', async () => {
    getProfileByName.mockResolvedValue(profile());
    ownProfileAuth();
    setIsMobile(true);

    const router = testRouter();
    await router.push('/settlement');
    await router.push({ path: '/profile', state: { backgroundView: '/settlement' } });
    await router.isReady();

    const wrapper = await mountModal(router);
    await wrapper.find('.back-button').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settlement');
  });
});
