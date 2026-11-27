import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type {
  LeaderboardBoardInfoResponse,
  LeaderboardCategory,
  LeaderboardEntryResponse,
  LeaderboardScope,
  WeeklyWindowResponse,
} from '../api/types';

const DEFAULT_PAGE_SIZE = 25;

/** Weekly boards are the ones with closed windows to step through; the rest are live all-time boards. */
export function isWeeklyCategory(category: LeaderboardCategory | null): boolean {
  return category?.startsWith('weekly') ?? false;
}

export const useLeaderboardStore = defineStore('leaderboard', {
  state: () => ({
    worldId: null as string | null,
    boards: [] as LeaderboardBoardInfoResponse[],
    weeklyWindows: [] as WeeklyWindowResponse[],
    directoryLoading: false,
    directoryError: null as string | null,

    scope: null as LeaderboardScope | null,
    category: null as LeaderboardCategory | null,
    board: null as LeaderboardBoardInfoResponse | null,
    // null = the current board (live all-time, or the most recently closed
    // window for a weekly-only category); otherwise a closed window's start.
    selectedPeriodStart: null as string | null,
    entries: [] as LeaderboardEntryResponse[],
    nextAfterRank: null as number | null,
    boardLoading: false,
    boardError: null as string | null,
    /** Whether the shown page is a closed (final) weekly window. */
    isFinal: false,
    /** Start of the window the "current" board of a weekly category resolves to; `null` until it has loaded. */
    currentPeriodStart: null as string | null,

    /** Ids a board entry can carry when it is the player's own: their settlements and the realms those belong to. */
    ownSubjectIds: [] as string[],

    myRankLoading: false,
    myRankError: null as string | null,
  }),
  getters: {
    boardsByScope(state): Record<LeaderboardScope, LeaderboardBoardInfoResponse[]> {
      const grouped: Record<string, LeaderboardBoardInfoResponse[]> = {};
      for (const board of state.boards) {
        (grouped[board.scope] ??= []).push(board);
      }
      return grouped as Record<LeaderboardScope, LeaderboardBoardInfoResponse[]>;
    },
    /**
     * The weeks a weekly board can be stepped through, oldest first, ending in "current" (`null`). The newest closed
     * window is what "current" shows, so it is not listed twice.
     */
    weekSteps(state): (string | null)[] {
      const windows = state.weeklyWindows
        .map((w) => w.periodStart)
        .filter((start) => start !== state.currentPeriodStart);
      return [...windows, null];
    },
  },
  actions: {
    async loadDirectory(worldId: string) {
      this.worldId = worldId;
      this.directoryLoading = true;
      this.directoryError = null;
      try {
        const response = await api.getLeaderboardDirectory(worldId);
        this.boards = response.boards;
        this.weeklyWindows = response.weeklyWindows;
      } catch (err) {
        this.directoryError = err instanceof ApiError ? err.message : 'Could not load leaderboards.';
      } finally {
        this.directoryLoading = false;
      }
    },
    /**
     * Reads the ids that mark an entry as the player's own on the settlement board (those are realm ids, one of the
     * owner's settlement ids each). Best effort: without them no row is highlighted, the board itself still works.
     */
    async loadOwnSubjects(worldId: string) {
      try {
        const mine = await api.listMySettlements(worldId);
        this.ownSubjectIds = [...new Set(mine.flatMap((s) => [s.id, s.realmId]))];
      } catch (err) {
        console.warn('own settlements for the leaderboard failed', err);
        this.ownSubjectIds = [];
      }
    },
    /** Selects a board and loads its first page, replacing whatever was shown before. */
    async selectBoard(scope: LeaderboardScope, category: LeaderboardCategory) {
      this.scope = scope;
      this.category = category;
      this.board = this.boards.find((b) => b.scope === scope && b.category === category) ?? null;
      this.selectedPeriodStart = null;
      this.currentPeriodStart = null;
      this.isFinal = false;
      this.entries = [];
      this.nextAfterRank = null;
      this.myRankError = null;
      if (!this.board?.available) return;
      await this.loadPage();
    },
    /** Selects a closed weekly window (or `null` for "current") and reloads the board's first page. */
    async selectWindow(periodStart: string | null) {
      this.selectedPeriodStart = periodStart;
      this.entries = [];
      this.nextAfterRank = null;
      this.myRankError = null;
      if (!this.board?.available) return;
      await this.loadPage();
    },
    /** Loads the next page (or the first, if `afterRank` is unset) and appends it. */
    async loadPage() {
      if (!this.worldId || !this.scope || !this.category) return;
      this.boardLoading = true;
      this.boardError = null;
      try {
        const page = await api.getLeaderboardBoard(this.worldId, this.scope, this.category, {
          periodStart: this.selectedPeriodStart ?? undefined,
          afterRank: this.nextAfterRank ?? undefined,
          pageSize: DEFAULT_PAGE_SIZE,
        });
        this.entries = [...this.entries, ...page.items];
        this.nextAfterRank = page.nextAfterRank;
        this.isFinal = page.isFinal;
        if (this.selectedPeriodStart === null) this.currentPeriodStart = page.periodStart;
      } catch (err) {
        this.boardError = err instanceof ApiError ? err.message : 'Could not load this board.';
      } finally {
        this.boardLoading = false;
      }
    },
    /**
     * Keyset pagination can only page forward from a cursor, so it cannot
     * jump straight to an arbitrary rank — instead this fetches the `/me`
     * window (the caller's rank plus `radius` neighbours on each side) and
     * replaces the visible page with it. "Load more" then continues forward
     * from the window's last rank, same as paging normally.
     */
    async jumpToMyRank(subjectId?: string) {
      if (!this.worldId || !this.scope || !this.category) return;
      this.myRankLoading = true;
      this.myRankError = null;
      try {
        const result = await api.getMyLeaderboardRank(this.worldId, this.scope, this.category, { subjectId });
        this.entries = result.items;
        const last = result.items.at(-1);
        this.nextAfterRank = last ? last.rank : null;
      } catch (err) {
        this.myRankError = err instanceof ApiError ? err.message : 'Could not find your rank on this board.';
      } finally {
        this.myRankLoading = false;
      }
    },
  },
});
