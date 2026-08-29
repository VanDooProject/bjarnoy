import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type { BattleReportResponse, TradeReportResponse } from '../api/types';
import { type InboxItem, inboxUnreadCount, mergeInbox } from '../lib/units/inbox';

// How often the badge/inbox re-polls while a HUD nav is mounted — battle
// reports arrive at unpredictable times (whenever another player's army
// settles a fight), so this is a light poll rather than a websocket/push
// channel, matching ARMY_POLL_MS's own reasoning in stores/world.ts.
const REPORT_POLL_MS = 5000;

const LAST_SEEN_KEY = 'bjarnoy.reportsLastSeenAt';

/**
 * Battle reports for the player's own settlement (issue #40 phase 3). Kept
 * as its own store rather than folded into `stores/world.ts`'s `hud` —
 * reports are read-at-leisure history, not part of the live settlement
 * snapshot, and this store's own polling only needs to run while a HUD nav
 * badge or the reports view is actually mounted (see `startPolling`/
 * `stopPolling`), unlike `hud.garrison`/`armies` which poll for as long as
 * the settlement/world view itself is open.
 *
 * "Unread" is a purely client-side notion — the backend does not track a
 * per-player read state for reports (see `BattleReportService`) — so it's
 * just "occurred after the last time this browser looked at the inbox",
 * persisted in `localStorage` (per `lastSeenAt`'s own comment).
 *
 * Issue #46 phase 3 folds `TradeReport`s into the same inbox/badge — see
 * the design doc's §7 note that both kinds share one per-player inbox.
 * Rather than duplicating the polling/localStorage plumbing in a second
 * store, `tradeItems` is fetched alongside `items` in the same `load`/poll
 * cycle, and `inboxItems`/`unreadCount` below are computed over the merge
 * of both (see `lib/units/inbox.ts`).
 */
export const useReportsStore = defineStore('reports', {
  state: () => ({
    settlementId: null as string | null,
    items: [] as BattleReportResponse[],
    tradeItems: [] as TradeReportResponse[],
    loading: false,
    error: null as string | null,
    lastSeenAt: (() => {
      try {
        return localStorage.getItem(LAST_SEEN_KEY);
      } catch {
        return null;
      }
    })() as string | null,
    pollHandle: null as ReturnType<typeof setInterval> | null,
  }),
  getters: {
    /** Both report kinds, merged newest-first — see `lib/units/inbox.ts`. */
    inboxItems(state): InboxItem[] {
      return mergeInbox(state.items, state.tradeItems);
    },
    unreadCount(state): number {
      return inboxUnreadCount(mergeInbox(state.items, state.tradeItems), state.lastSeenAt);
    },
  },
  actions: {
    /** Fetches (or re-fetches) this settlement's battle and trade reports, each newest first. */
    async load(settlementId: string) {
      this.settlementId = settlementId;
      this.loading = true;
      this.error = null;
      try {
        const [battleItems, tradeItems] = await Promise.all([
          api.getSettlementReports(settlementId),
          api.getSettlementTradeReports(settlementId),
        ]);
        this.items = [...battleItems].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );
        this.tradeItems = [...tradeItems].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
        );
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : 'Could not load reports.';
      } finally {
        this.loading = false;
      }
    },
    /** A single report by id — served from the already-loaded list when possible (e.g. inbox → detail navigation), else fetched directly (a deep link). */
    async getById(reportId: string): Promise<BattleReportResponse | null> {
      const cached = this.items.find((r) => r.id === reportId);
      if (cached) return cached;
      try {
        return await api.getReport(reportId);
      } catch {
        return null;
      }
    },
    /** Marks every currently-known report as seen — call when the player opens the inbox. */
    markAllSeen() {
      this.lastSeenAt = new Date().toISOString();
      try {
        localStorage.setItem(LAST_SEEN_KEY, this.lastSeenAt);
      } catch {
        // Private-browsing/storage-disabled: unread badge just won't persist across reloads.
      }
    },
    /** Starts (or restarts, if already polling for a different settlement) the light background poll HudNav's badge relies on. */
    startPolling(settlementId: string) {
      this.stopPolling();
      void this.load(settlementId);
      this.pollHandle = setInterval(() => void this.load(settlementId), REPORT_POLL_MS);
    },
    stopPolling() {
      if (this.pollHandle) clearInterval(this.pollHandle);
      this.pollHandle = null;
    },
  },
});
