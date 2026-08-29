import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type {
  LeaderboardBoardInfoResponse,
  LeaderboardCategory,
  LeaderboardEntryResponse,
  LeaderboardScope,
} from '../api/types';

const DEFAULT_PAGE_SIZE = 25;

export const useLeaderboardStore = defineStore('leaderboard', {
  state: () => ({
    worldId: null as string | null,
    boards: [] as LeaderboardBoardInfoResponse[],
    directoryLoading: false,
    directoryError: null as string | null,

    scope: null as LeaderboardScope | null,
    category: null as LeaderboardCategory | null,
    board: null as LeaderboardBoardInfoResponse | null,
    entries: [] as LeaderboardEntryResponse[],
    nextAfterRank: null as number | null,
    boardLoading: false,
    boardError: null as string | null,

    // Set once "jump to my rank" resolves, so the table can highlight the
    // caller's own row; cleared on any fresh board load.
    myRank: null as number | null,
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
  },
  actions: {
    async loadDirectory(worldId: string) {
      this.worldId = worldId;
      this.directoryLoading = true;
      this.directoryError = null;
      try {
        const response = await api.getLeaderboardDirectory(worldId);
        this.boards = response.boards;
      } catch (err) {
        this.directoryError = err instanceof ApiError ? err.message : 'Could not load leaderboards.';
      } finally {
        this.directoryLoading = false;
      }
    },
    /** Selects a board and loads its first page, replacing whatever was shown before. */
    async selectBoard(scope: LeaderboardScope, category: LeaderboardCategory) {
      this.scope = scope;
      this.category = category;
      this.board = this.boards.find((b) => b.scope === scope && b.category === category) ?? null;
      this.entries = [];
      this.nextAfterRank = null;
      this.myRank = null;
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
          afterRank: this.nextAfterRank ?? undefined,
          pageSize: DEFAULT_PAGE_SIZE,
        });
        this.entries = [...this.entries, ...page.items];
        this.nextAfterRank = page.nextAfterRank;
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
        this.myRank = result.myRank;
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
