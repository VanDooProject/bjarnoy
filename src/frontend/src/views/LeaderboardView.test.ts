// @vitest-environment jsdom
//
// The leaderboard dialog content: board rail with the caller's ranks, the open board's table with the own row marked,
// the locked-board body, the week stepper (free vs premium) and the phone's list -> board drill-in.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LeaderboardView from './LeaderboardView.vue';
import { useAuthStore } from '../stores/auth';
import { useWorldStore } from '../stores/world';
import { createTestI18n } from '../test/i18n';
import enLeaderboard from '../i18n/locales/en/leaderboard.json';
import enProfile from '../i18n/locales/en/profile.json';
import type { LeaderboardBoardInfoResponse, LeaderboardEntryResponse, UserResponse } from '../api/types';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: {
    getLeaderboardDirectory: vi.fn(),
    getLeaderboardBoard: vi.fn(),
    getMyLeaderboardRank: vi.fn(),
    listMySettlements: vi.fn(),
  },
}));

import { api } from '../api/client';

const WEEK_1 = '2026-01-01T00:00:00Z';
const WEEK_2 = '2026-01-08T00:00:00Z';
const WEEK_3 = '2026-01-15T00:00:00Z';

function board(over: Partial<LeaderboardBoardInfoResponse>): LeaderboardBoardInfoResponse {
  return {
    scope: 'user',
    category: 'score',
    available: true,
    reason: null,
    computedAt: new Date().toISOString(),
    entryCount: 3,
    myRank: null,
    ...over,
  };
}

const directory = {
  boards: [
    board({ scope: 'user', category: 'score', entryCount: 412, myRank: 2 }),
    board({ scope: 'user', category: 'weeklyScoreGained', entryCount: 3 }),
    board({ scope: 'user', category: 'biggestArmy', available: false, reason: 'noArmySystemYet', computedAt: null, entryCount: null }),
    board({ scope: 'settlement', category: 'biggestSettlement', myRank: 1 }),
  ],
  weeklyWindows: [
    { periodStart: WEEK_1, periodEnd: WEEK_2 },
    { periodStart: WEEK_2, periodEnd: WEEK_3 },
    { periodStart: WEEK_3, periodEnd: '2026-01-22T00:00:00Z' },
  ],
};

function entry(rank: number, subjectId: string, name: string): LeaderboardEntryResponse {
  return { rank, subjectId, subjectName: name, value: 1000 - rank, previousRank: rank, delta: 0 };
}

function page(items: LeaderboardEntryResponse[], periodStart: string | null = null) {
  return {
    scope: 'user',
    category: 'score',
    available: true,
    reason: null,
    isFinal: periodStart !== null,
    periodStart,
    periodEnd: null,
    computedAt: null,
    items,
    nextAfterRank: null,
  };
}

function stubViewport(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isPhone,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function setUser(over: Partial<UserResponse>) {
  useAuthStore().user = { id: 'me', role: 'player', isPremium: false, ...over } as UserResponse;
}

async function mountView(opts: { phone?: boolean } = {}) {
  stubViewport(opts.phone ?? false);
  useWorldStore().worldId = 'w1';
  const close = vi.fn();
  const wrapper = mount(LeaderboardView, {
    props: { close },
    global: { plugins: [createTestI18n({ leaderboard: enLeaderboard, profile: enProfile })] },
  });
  await flushPromises();
  return { wrapper, close };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.mocked(api.getLeaderboardDirectory).mockReset().mockResolvedValue(directory as never);
  vi.mocked(api.getLeaderboardBoard).mockReset().mockResolvedValue(
    page([entry(1, 'rival', 'Rival'), entry(2, 'me', 'Me'), entry(3, 'other', 'Other')]) as never,
  );
  vi.mocked(api.getMyLeaderboardRank).mockReset();
  vi.mocked(api.listMySettlements).mockReset().mockResolvedValue([]);
});

describe('LeaderboardView on desktop', () => {
  it('lists every board grouped by scope with the caller rank, and locks a dark board', async () => {
    setUser({});
    const { wrapper } = await mountView();

    const rail = wrapper.get('nav');
    expect(rail.text()).toContain('Players');
    expect(rail.text()).toContain('Settlements');
    const buttons = rail.findAll('button');
    expect(buttons.map((b) => b.find('.board-name').text())).toEqual([
      'Score',
      'Weekly score gained',
      'Biggest army',
      'Biggest settlement',
    ]);
    expect(buttons[0]!.text()).toContain('#2');
    expect(buttons[3]!.text()).toContain('#1');
    // A dark board has no rank, a lock, and its reason as the accessible description.
    expect(buttons[2]!.text()).not.toContain('#');
    expect(buttons[2]!.classes()).toContain('dark');
    const describedBy = buttons[2]!.attributes('aria-describedby')!;
    expect(wrapper.get(`#${describedBy}`).text()).toBe('Unlocks once armies exist.');
  });

  it('opens the first board by itself and carries one heading, the title and the close action', async () => {
    setUser({});
    const { wrapper, close } = await mountView();

    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h2').text()).toBe('Players · Score');
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);

    await wrapper.get('button.close').trigger('click');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows the lock and the reason instead of a table for a dark board', async () => {
    setUser({});
    const { wrapper } = await mountView();

    await wrapper.findAll('nav button')[2]!.trigger('click');
    await flushPromises();

    expect(wrapper.get('.locked').text()).toBe('Unlocks once armies exist.');
    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.get('h2').text()).toBe('Players · Biggest army');
  });

  it('marks the player own row on the player board', async () => {
    setUser({ id: 'me' });
    const { wrapper } = await mountView();

    const own = wrapper.findAll('tr.my-row');
    expect(own).toHaveLength(1);
    expect(own[0]!.text()).toContain('Me · yours');
  });

  it('marks the realm of any own settlement on the settlement board', async () => {
    setUser({ id: 'me' });
    vi.mocked(api.listMySettlements).mockResolvedValue([{ id: 'second-settlement', realmId: 'realm-1' }] as never);
    const { wrapper } = await mountView();

    vi.mocked(api.getLeaderboardBoard).mockResolvedValue(
      page([entry(1, 'rival', 'Rival'), entry(2, 'realm-1', 'Haugr')]) as never,
    );
    await wrapper.findAll('nav button')[3]!.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('tr.my-row')).toHaveLength(1);
    expect(wrapper.get('tr.my-row').text()).toContain('Haugr · yours');
    expect(wrapper.findAll('th')[1]!.text()).toBe('Settlement');
  });

  it('offers "Jump to my rank" only to a signed-in player who has a rank on the board', async () => {
    setUser({});
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Jump to my rank');

    // The settlement board has a rank too; the weekly board does not.
    await wrapper.findAll('nav button')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Jump to my rank');
  });

  it('hides "Jump to my rank" when signed out', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).not.toContain('Jump to my rank');
  });

  describe('week stepper', () => {
    async function openWeekly(user: Partial<UserResponse> | null) {
      if (user) setUser(user);
      vi.mocked(api.getLeaderboardBoard).mockResolvedValue(
        page([entry(1, 'rival', 'Rival')], WEEK_3) as never,
      );
      const view = await mountView();
      await view.wrapper.findAll('nav button')[1]!.trigger('click');
      await flushPromises();
      return view;
    }

    it('is disabled with a lock and a premium note for a free player', async () => {
      const { wrapper } = await openWeekly({ isPremium: false });

      expect(wrapper.get('.week-label').text()).toBe('Current');
      expect(wrapper.get('[data-testid=week-earlier]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-testid=week-earlier] rect').exists()).toBe(true); // the lock icon
      expect(wrapper.get('[data-testid=week-premium-note]').text()).toBe('Premium: the last 4 weeks');
      expect(wrapper.get('.final').text()).toBe('Final');
    });

    it('steps through the windows for a premium player without listing the current week twice', async () => {
      const { wrapper } = await openWeekly({ isPremium: true });

      expect(wrapper.find('[data-testid=week-premium-note]').exists()).toBe(false);
      // Current IS the newest window (WEEK_3), so the steps are WEEK_1, WEEK_2, current.
      const earlier = wrapper.get('[data-testid=week-earlier]');
      expect(earlier.attributes('disabled')).toBeUndefined();

      await earlier.trigger('click');
      await flushPromises();

      const lastCall = vi.mocked(api.getLeaderboardBoard).mock.calls.at(-1)!;
      expect(lastCall[3]).toMatchObject({ periodStart: WEEK_2 });
      expect(wrapper.get('.week-label').text()).toMatch(/^Week of /);
      expect(wrapper.get('[data-testid=week-later]').attributes('disabled')).toBeUndefined();

      await wrapper.get('[data-testid=week-earlier]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-testid=week-earlier]').attributes('disabled')).toBeDefined();
    });

    it('is open for an admin', async () => {
      const { wrapper } = await openWeekly({ role: 'admin' });
      expect(wrapper.get('[data-testid=week-earlier]').attributes('disabled')).toBeUndefined();
    });
  });
});

describe('LeaderboardView on a phone', () => {
  it('starts on the board list with sublines and the caller ranks, without the desktop rail', async () => {
    setUser({});
    const { wrapper } = await mountView({ phone: true });

    expect(wrapper.find('nav').exists()).toBe(false);
    expect(api.getLeaderboardBoard).not.toHaveBeenCalled();
    const rows = wrapper.findAll('.picker .row');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.text()).toContain('of 412');
    expect(rows[0]!.text()).toContain('#2');
    expect(rows[1]!.text()).toContain('This week');
    expect(rows[2]!.text()).toContain('Unlocks once armies exist.');
  });

  it('opens a board from its row and shows the ranked rows with the own one marked', async () => {
    setUser({ id: 'me' });
    const { wrapper } = await mountView({ phone: true });

    await wrapper.findAll('.picker .row')[0]!.trigger('click');
    await flushPromises();

    expect(wrapper.find('.picker').exists()).toBe(false);
    expect(wrapper.findAll('.rows .row')).toHaveLength(3);
    expect(wrapper.get('.rows .my-row').text()).toContain('Me · yours');
    expect(wrapper.text()).toContain('Jump to my rank');
  });
});
