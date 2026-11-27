import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaderboardStore } from './leaderboard';

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, problem?: { detail?: string; title?: string }) {
      super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
      this.status = status;
    }
  },
  api: {
    getLeaderboardDirectory: vi.fn(),
    getLeaderboardBoard: vi.fn(),
    getMyLeaderboardRank: vi.fn(),
    listMySettlements: vi.fn(),
  },
}));

import { ApiError, api } from '../api/client';

const directoryFixture = {
  boards: [
    { scope: 'user', category: 'score', available: true, reason: null, computedAt: '2026-01-01T00:00:00Z', entryCount: 3, myRank: 2 },
    { scope: 'settlement', category: 'biggestSettlement', available: true, reason: null, computedAt: '2026-01-01T00:00:00Z', entryCount: 2, myRank: null },
    { scope: 'guild', category: 'score', available: false, reason: 'noGuildSystemYet', computedAt: null, entryCount: null, myRank: null },
  ],
  weeklyWindows: [],
};

function entry(rank: number, previousRank: number | null) {
  return {
    rank,
    subjectId: `subject-${rank}`,
    subjectName: `Subject ${rank}`,
    value: 100 - rank,
    previousRank,
    delta: previousRank === null ? null : previousRank - rank,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(api.getLeaderboardDirectory).mockReset();
  vi.mocked(api.getLeaderboardBoard).mockReset();
  vi.mocked(api.getMyLeaderboardRank).mockReset();
  vi.mocked(api.listMySettlements).mockReset();
});

describe('useLeaderboardStore', () => {
  it('groups the directory by scope', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
    const store = useLeaderboardStore();

    await store.loadDirectory('world-1');

    expect(store.boardsByScope.user).toHaveLength(1);
    expect(store.boardsByScope.settlement).toHaveLength(1);
    expect(store.boardsByScope.guild?.[0]?.available).toBe(false);
  });

  it('surfaces the load error and keeps boards empty on failure', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockRejectedValue(new ApiError(500, { title: 'boom' }));
    const store = useLeaderboardStore();

    await store.loadDirectory('world-1');

    expect(store.boards).toEqual([]);
    expect(store.directoryError).toBe('boom');
  });

  it('does not fetch a page when selecting a dark board', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
    const store = useLeaderboardStore();
    await store.loadDirectory('world-1');

    await store.selectBoard('guild', 'score');

    expect(api.getLeaderboardBoard).not.toHaveBeenCalled();
    expect(store.entries).toEqual([]);
  });

  it('advances the keyset cursor and appends entries across pages', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
    vi.mocked(api.getLeaderboardBoard)
      .mockResolvedValueOnce({
        scope: 'user',
        category: 'score',
        available: true,
        reason: null,
        isFinal: false,
        periodStart: null,
        periodEnd: null,
        computedAt: '2026-01-01T00:00:00Z',
        items: [entry(1, 2), entry(2, 1)],
        nextAfterRank: 2,
      } as never)
      .mockResolvedValueOnce({
        scope: 'user',
        category: 'score',
        available: true,
        reason: null,
        isFinal: false,
        periodStart: null,
        periodEnd: null,
        computedAt: '2026-01-01T00:00:00Z',
        items: [entry(3, null)],
        nextAfterRank: null,
      } as never);
    const store = useLeaderboardStore();
    await store.loadDirectory('world-1');

    await store.selectBoard('user', 'score');
    expect(store.entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(store.nextAfterRank).toBe(2);

    await store.loadPage();
    expect(store.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(store.nextAfterRank).toBeNull();
    expect(api.getLeaderboardBoard).toHaveBeenLastCalledWith('world-1', 'user', 'score', {
      afterRank: 2,
      pageSize: 25,
    });
  });

  it('selecting a window reloads the board with that periodStart and resets on the next board switch', async () => {
    const withWindows = {
      ...directoryFixture,
      weeklyWindows: [{ periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-01-08T00:00:00Z' }],
    };
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(withWindows as never);
    vi.mocked(api.getLeaderboardBoard).mockResolvedValue({
      scope: 'user',
      category: 'score',
      available: true,
      reason: null,
      isFinal: false,
      periodStart: null,
      periodEnd: null,
      computedAt: '2026-01-01T00:00:00Z',
      items: [entry(1, 1)],
      nextAfterRank: null,
    } as never);
    const store = useLeaderboardStore();
    await store.loadDirectory('world-1');
    expect(store.weeklyWindows).toHaveLength(1);

    await store.selectBoard('user', 'score');
    expect(api.getLeaderboardBoard).toHaveBeenLastCalledWith('world-1', 'user', 'score', {
      periodStart: undefined,
      afterRank: undefined,
      pageSize: 25,
    });

    await store.selectWindow('2026-01-01T00:00:00Z');
    expect(store.selectedPeriodStart).toBe('2026-01-01T00:00:00Z');
    expect(api.getLeaderboardBoard).toHaveBeenLastCalledWith('world-1', 'user', 'score', {
      periodStart: '2026-01-01T00:00:00Z',
      afterRank: undefined,
      pageSize: 25,
    });

    // Switching boards resets back to "current".
    await store.selectBoard('settlement', 'biggestSettlement');
    expect(store.selectedPeriodStart).toBeNull();
  });

  it('jumping to my rank replaces the visible page with the /me window', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
    vi.mocked(api.getLeaderboardBoard).mockResolvedValue({
      scope: 'user',
      category: 'score',
      available: true,
      reason: null,
      isFinal: false,
      periodStart: null,
      periodEnd: null,
      computedAt: '2026-01-01T00:00:00Z',
      items: [entry(1, 1)],
      nextAfterRank: null,
    } as never);
    vi.mocked(api.getMyLeaderboardRank).mockResolvedValue({
      myRank: 118,
      items: [entry(116, 116), entry(117, 117), entry(118, 119), entry(119, 118)],
    } as never);
    const store = useLeaderboardStore();
    await store.loadDirectory('world-1');
    await store.selectBoard('user', 'score');

    await store.jumpToMyRank();

    expect(store.entries.map((e) => e.rank)).toEqual([116, 117, 118, 119]);
    expect(store.nextAfterRank).toBe(119);
  });

  it('surfaces a myRankError when the caller has no entry on the board', async () => {
    vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
    vi.mocked(api.getLeaderboardBoard).mockResolvedValue({
      scope: 'user',
      category: 'score',
      available: true,
      reason: null,
      isFinal: false,
      periodStart: null,
      periodEnd: null,
      computedAt: '2026-01-01T00:00:00Z',
      items: [],
      nextAfterRank: null,
    } as never);
    vi.mocked(api.getMyLeaderboardRank).mockRejectedValue(new ApiError(404, { title: 'not on this board' }));
    const store = useLeaderboardStore();
    await store.loadDirectory('world-1');
    await store.selectBoard('user', 'score');

    await store.jumpToMyRank();

    expect(store.myRankError).toBe('not on this board');
  });
  describe('week steps', () => {
    const W1 = '2026-01-01T00:00:00Z';
    const W2 = '2026-01-08T00:00:00Z';

    function weeklyPage(periodStart: string | null) {
      return {
        scope: 'user',
        category: 'weeklyScoreGained',
        available: true,
        reason: null,
        isFinal: periodStart !== null,
        periodStart,
        periodEnd: null,
        computedAt: '2026-01-01T00:00:00Z',
        items: [entry(1, 1)],
        nextAfterRank: null,
      };
    }

    it('ends in "current" and lists the newest closed window only once, as that current board', async () => {
      vi.mocked(api.getLeaderboardDirectory).mockResolvedValue({
        boards: [
          { scope: 'user', category: 'weeklyScoreGained', available: true, reason: null, computedAt: null, entryCount: 1, myRank: null },
        ],
        weeklyWindows: [
          { periodStart: W1, periodEnd: W2 },
          { periodStart: W2, periodEnd: '2026-01-15T00:00:00Z' },
        ],
      } as never);
      // The current board of a weekly category resolves to the newest closed window.
      vi.mocked(api.getLeaderboardBoard).mockResolvedValue(weeklyPage(W2) as never);
      const store = useLeaderboardStore();
      await store.loadDirectory('world-1');
      await store.selectBoard('user', 'weeklyScoreGained');

      expect(store.isFinal).toBe(true);
      expect(store.currentPeriodStart).toBe(W2);
      expect(store.weekSteps).toEqual([W1, null]);
    });

    it('forgets the current window when another board is selected', async () => {
      vi.mocked(api.getLeaderboardDirectory).mockResolvedValue(directoryFixture as never);
      vi.mocked(api.getLeaderboardBoard).mockResolvedValue(weeklyPage(W2) as never);
      const store = useLeaderboardStore();
      await store.loadDirectory('world-1');
      await store.selectBoard('user', 'score');
      expect(store.currentPeriodStart).toBe(W2);

      await store.selectBoard('guild', 'score'); // dark: nothing is fetched
      expect(store.currentPeriodStart).toBeNull();
      expect(store.isFinal).toBe(false);
    });
  });

  describe('own subjects', () => {
    it('keeps the ids and realm ids of the player settlements', async () => {
      vi.mocked(api.listMySettlements).mockResolvedValue([
        { id: 's1', realmId: 's1' },
        { id: 's2', realmId: 's1' },
      ] as never);
      const store = useLeaderboardStore();

      await store.loadOwnSubjects('world-1');

      expect(store.ownSubjectIds.sort()).toEqual(['s1', 's2']);
    });

    it('falls back to no own rows when the read fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.mocked(api.listMySettlements).mockRejectedValue(new Error('offline'));
      const store = useLeaderboardStore();

      await store.loadOwnSubjects('world-1');

      expect(store.ownSubjectIds).toEqual([]);
    });
  });
});
