import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
const DEFAULT_PAGE_SIZE = 25;
export const useLeaderboardStore = defineStore('leaderboard', {
    state: () => ({
        worldId: null,
        boards: [],
        weeklyWindows: [],
        directoryLoading: false,
        directoryError: null,
        scope: null,
        category: null,
        board: null,
        // null = the current board (live all-time, or the most recently closed
        // window for a weekly-only category); otherwise a closed window's start.
        selectedPeriodStart: null,
        entries: [],
        nextAfterRank: null,
        boardLoading: false,
        boardError: null,
        // Set once "jump to my rank" resolves, so the table can highlight the
        // caller's own row; cleared on any fresh board load.
        myRank: null,
        myRankLoading: false,
        myRankError: null,
    }),
    getters: {
        boardsByScope(state) {
            const grouped = {};
            for (const board of state.boards) {
                (grouped[board.scope] ??= []).push(board);
            }
            return grouped;
        },
    },
    actions: {
        async loadDirectory(worldId) {
            this.worldId = worldId;
            this.directoryLoading = true;
            this.directoryError = null;
            try {
                const response = await api.getLeaderboardDirectory(worldId);
                this.boards = response.boards;
                this.weeklyWindows = response.weeklyWindows;
            }
            catch (err) {
                this.directoryError = err instanceof ApiError ? err.message : 'Could not load leaderboards.';
            }
            finally {
                this.directoryLoading = false;
            }
        },
        /** Selects a board and loads its first page, replacing whatever was shown before. */
        async selectBoard(scope, category) {
            this.scope = scope;
            this.category = category;
            this.board = this.boards.find((b) => b.scope === scope && b.category === category) ?? null;
            this.selectedPeriodStart = null;
            this.entries = [];
            this.nextAfterRank = null;
            this.myRank = null;
            this.myRankError = null;
            if (!this.board?.available)
                return;
            await this.loadPage();
        },
        /** Selects a closed weekly window (or `null` for "current") and reloads the board's first page. */
        async selectWindow(periodStart) {
            this.selectedPeriodStart = periodStart;
            this.entries = [];
            this.nextAfterRank = null;
            this.myRank = null;
            this.myRankError = null;
            if (!this.board?.available)
                return;
            await this.loadPage();
        },
        /** Loads the next page (or the first, if `afterRank` is unset) and appends it. */
        async loadPage() {
            if (!this.worldId || !this.scope || !this.category)
                return;
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
            }
            catch (err) {
                this.boardError = err instanceof ApiError ? err.message : 'Could not load this board.';
            }
            finally {
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
        async jumpToMyRank(subjectId) {
            if (!this.worldId || !this.scope || !this.category)
                return;
            this.myRankLoading = true;
            this.myRankError = null;
            try {
                const result = await api.getMyLeaderboardRank(this.worldId, this.scope, this.category, { subjectId });
                this.entries = result.items;
                this.myRank = result.myRank;
                const last = result.items.at(-1);
                this.nextAfterRank = last ? last.rank : null;
            }
            catch (err) {
                this.myRankError = err instanceof ApiError ? err.message : 'Could not find your rank on this board.';
            }
            finally {
                this.myRankLoading = false;
            }
        },
    },
});
