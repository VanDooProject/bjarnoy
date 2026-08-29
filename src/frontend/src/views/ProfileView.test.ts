// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView.vue';
import type { ProfileResponse } from '../api/types';
import { useAuthStore } from '../stores/auth';

const { getProfileByName, updateMyBio, reportProfile } = vi.hoisted(() => ({
  getProfileByName: vi.fn(),
  updateMyBio: vi.fn(),
  reportProfile: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: { getProfileByName, updateMyBio, reportProfile },
  };
});

const routeParams: { userName?: string } = {};

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({ params: routeParams }),
  };
});

const ASCII_ART = '  /\\_/\\\n ( o.o )\n  > ^ <';

function profile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 'user-1',
    userName: 'ragnar',
    displayName: null,
    bio: ASCII_ART,
    createdAt: '2026-01-15T00:00:00Z',
    settlementCount: 3,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  routeParams.userName = 'ragnar';
});

describe('ProfileView', () => {
  it('renders the bio verbatim in a pre block, with joined date and settlement count', async () => {
    getProfileByName.mockResolvedValue(profile());

    const wrapper = mount(ProfileView);
    await flushPromises();

    // Whitespace/line breaks survive exactly — that's what makes ASCII art work.
    const pre = wrapper.find('pre.bio');
    expect(pre.exists()).toBe(true);
    expect(pre.text()).toBe(ASCII_ART.trim());
    expect(pre.element.textContent).toBe(ASCII_ART);

    expect(wrapper.text()).toContain('Joined');
    expect(wrapper.text()).toContain('Settlements');
    expect(wrapper.text()).toContain('3');
  });

  it('escapes HTML in a bio instead of rendering it', async () => {
    getProfileByName.mockResolvedValue(profile({ bio: '<img src=x onerror=alert(1)>' }));

    const wrapper = mount(ProfileView);
    await flushPromises();

    // The markup appears as text; no element is created from it.
    expect(wrapper.find('pre.bio').element.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(wrapper.find('pre.bio img').exists()).toBe(false);
  });

  it('lets the owner edit their bio, but shows no report button on their own profile', async () => {
    getProfileByName.mockResolvedValue(profile());
    updateMyBio.mockResolvedValue(profile({ bio: 'new bio' }));

    const auth = useAuthStore();
    auth.user = { id: 'user-1', userName: 'ragnar', role: 'player', status: 'active', displayName: null };

    const wrapper = mount(ProfileView);
    await flushPromises();

    expect(wrapper.findAll('button').some((b) => b.text() === 'Report')).toBe(false);

    const editButton = wrapper.findAll('button').find((b) => b.text() === 'Edit bio')!;
    await editButton.trigger('click');

    await wrapper.find('textarea.bio-editor').setValue('new bio');
    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')!;
    await saveButton.trigger('click');
    await flushPromises();

    expect(updateMyBio).toHaveBeenCalledWith({ bio: 'new bio' });
    expect(wrapper.find('pre.bio').text()).toBe('new bio');
  });

  it('lets a logged-in visitor report the profile with a reason and note', async () => {
    getProfileByName.mockResolvedValue(profile());
    reportProfile.mockResolvedValue({});

    const auth = useAuthStore();
    auth.user = { id: 'user-2', userName: 'floki', role: 'player', status: 'active', displayName: null };

    const wrapper = mount(ProfileView);
    await flushPromises();

    const reportButton = wrapper.findAll('button').find((b) => b.text() === 'Report')!;
    await reportButton.trigger('click');

    await wrapper.find('.report-dialog input').setValue('Offensive bio');
    await wrapper.find('.report-dialog textarea').setValue('The ASCII art is rude.');
    const sendButton = wrapper.findAll('button').find((b) => b.text() === 'Send report')!;
    await sendButton.trigger('click');
    await flushPromises();

    expect(reportProfile).toHaveBeenCalledWith('user-1', {
      reason: 'Offensive bio',
      note: 'The ASCII art is rude.',
    });
    expect(wrapper.text()).toContain('Report sent');
  });

  it('shows no report button to an anonymous visitor', async () => {
    getProfileByName.mockResolvedValue(profile());

    const wrapper = mount(ProfileView);
    await flushPromises();

    expect(wrapper.findAll('button').some((b) => b.text() === 'Report')).toBe(false);
  });
});
