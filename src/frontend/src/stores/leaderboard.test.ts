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
  },
}));

import { ApiError, api } from '../api/client';

const directoryFixture = {
  boards: [
    { scope: 'user', category: 'score', available: true, reason: null, computedAt: '2026-01-01T00:00:00Z', entryCount: 3 },
    { scope: 'settlement', category: 'biggestSettlement', available: true, reason: null, computedAt: '2026-01-01T00:00:00Z', entryCount: 2 },
    { scope: 'guild', category: 'score', available: false, reason: 'noGuildSystemYet', computedAt: null, entryCount: null },
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

    expect(store.myRank).toBe(118);
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
});
