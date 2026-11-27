// @vitest-environment jsdom
//
// On a phone the dialog's back chevron steps from an open board back to the board list first, and only from the list
// closes the modal; the header names the open board.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import LeaderboardModal from './LeaderboardModal.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enLeaderboard from '../../i18n/locales/en/leaderboard.json';
import enProfile from '../../i18n/locales/en/profile.json';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: {
    getLeaderboardDirectory: vi.fn(),
    getLeaderboardBoard: vi.fn(),
    getMyLeaderboardRank: vi.fn(),
    listMySettlements: vi.fn(),
  },
}));

import { api } from '../../api/client';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.mocked(api.getLeaderboardDirectory).mockResolvedValue({
    boards: [{ scope: 'user', category: 'score', available: true, reason: null, computedAt: null, entryCount: 1, myRank: null }],
    weeklyWindows: [],
  } as never);
  vi.mocked(api.getLeaderboardBoard).mockResolvedValue({
    scope: 'user',
    category: 'score',
    available: true,
    reason: null,
    isFinal: false,
    periodStart: null,
    periodEnd: null,
    computedAt: null,
    items: [{ rank: 1, subjectId: 'a', subjectName: 'Alma', value: 10, previousRank: 1, delta: 0 }],
    nextAfterRank: null,
  } as never);
  vi.mocked(api.listMySettlements).mockResolvedValue([]);
});

describe('LeaderboardModal on a phone', () => {
  it('drills into a board and steps back to the list before closing', async () => {
    useWorldStore().worldId = 'w1';
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settlement', component: { template: '<div />' } },
        { path: '/leaderboards', component: { template: '<div />' } },
      ],
    });
    await router.push('/leaderboards');
    await router.isReady();
    const wrapper = mount(LeaderboardModal, {
      global: { plugins: [router, createTestI18n({ leaderboard: enLeaderboard, profile: enProfile })] },
    });
    await flushPromises();

    expect(wrapper.get('.mobile-title').text()).toBe('Leaderboards');
    expect(wrapper.findAll('.picker .row')).toHaveLength(1);

    await wrapper.get('.picker .row').trigger('click');
    await flushPromises();
    expect(wrapper.get('.mobile-title').text()).toBe('Players · Score');
    expect(wrapper.find('.picker').exists()).toBe(false);
    expect(wrapper.text()).toContain('Alma');

    // First back: from the board to the list; the modal stays open.
    await wrapper.get('.back-button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/leaderboards');
    expect(wrapper.get('.mobile-title').text()).toBe('Leaderboards');
    expect(wrapper.find('.picker').exists()).toBe(true);

    // Second back: from the list, closes as any modal does.
    await wrapper.get('.back-button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settlement');
  });
});
