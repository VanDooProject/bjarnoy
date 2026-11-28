import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type {
  ArmyReportResponse,
  BattleReportResponse,
  CampReportResponse,
  FieldBattleReportResponse,
  TradeReportResponse,
} from '../api/types';
import { DEMO_MODE } from '../config';
import {
  type InboxItem,
  type InboxKind,
  inboxKey,
  inboxUnreadByKind,
  inboxUnreadCount,
  isInboxItemUnread,
  mergeInbox,
} from '../lib/units/inbox';

// How often the badge/inbox re-polls while a HUD nav is mounted — battle
// reports arrive at unpredictable times (whenever another player's army
// settles a fight), so this is a light poll rather than a websocket/push
// channel, matching ARMY_POLL_MS's own reasoning in stores/world.ts.
const REPORT_POLL_MS = 5000;

/**
 * Battle reports of the player in the current world (issue #40 phase 3). Kept
 * as its own store rather than folded into `stores/world.ts`'s `hud` —
 * reports are read-at-leisure history, not part of the live settlement
 * snapshot, and this store's own polling only needs to run while a HUD nav
 * badge or the reports view is actually mounted (see `startPolling`/
 * `stopPolling`), unlike `hud.garrison`/`armies` which poll for as long as
 * the settlement/world view itself is open.
 *
 * Whether a report was read is kept by the backend per player (each report
 * response carries `read`), so it follows the player across browsers and
 * devices. `localRead` is only an optimistic overlay: opening a report marks
 * it here at once and a poll that still says `read: false` (it raced the
 * request) cannot flip it back; `load` clears the overlay when the world or
 * owner changes. A failed request takes the report out of the overlay again.
 *
 * Issue #46 phase 3 folds `TradeReport`s into the same inbox/badge — see
 * the design doc's §7 note that both kinds share one per-player inbox.
 * Rather than duplicating the polling/localStorage plumbing in a second
 * store, `tradeItems` is fetched alongside `items` in the same `load`/poll
 * cycle, and `inboxItems`/`unreadCount` below are computed over the merge
 * of both (see `lib/units/inbox.ts`).
 *
 * Issue #206 folds in a third kind, `fieldItems` (in-flight interceptions),
 * the same way — fetched alongside the other two rather than given its own
 * store/polling loop.
 */
export const useReportsStore = defineStore('reports', {
  state: () => ({
    worldId: null as string | null,
    // The client-local owner id these reports were last loaded under — see
    // `load`'s own comment. Needed again by `getById`/`getFieldById`'s deep
    // links, which don't otherwise carry it.
    ownerId: null as string | null,
    items: [] as BattleReportResponse[],
    tradeItems: [] as TradeReportResponse[],
    fieldItems: [] as FieldBattleReportResponse[],
    campItems: [] as CampReportResponse[],
    armyItems: [] as ArmyReportResponse[],
    loading: false,
    error: null as string | null,
    // Reports marked read in this session, keyed by `inboxKey` — see the store comment.
    localRead: {} as Record<string, true>,
    pollHandle: null as ReturnType<typeof setInterval> | null,
  }),
  getters: {
    /** All report kinds, merged newest-first — see `lib/units/inbox.ts`. */
    inboxItems(state): InboxItem[] {
      return mergeInbox(state.items, state.tradeItems, state.fieldItems, state.campItems, state.armyItems);
    },
    isUnread(state): (item: InboxItem) => boolean {
      return (item) => isInboxItemUnread(item, state.localRead);
    },
    unreadCount(state): number {
      return inboxUnreadCount(mergeInbox(state.items, state.tradeItems, state.fieldItems, state.campItems, state.armyItems), state.localRead);
    },
    unreadCountByKind(state): Record<InboxKind, number> {
      return inboxUnreadByKind(mergeInbox(state.items, state.tradeItems, state.fieldItems, state.campItems, state.armyItems), state.localRead);
    },
  },
  actions: {
    /**
     * Fetches (or re-fetches) the player's battle, field-battle, camp and
     * trade reports in a world, each newest first — one inbox across all their
     * settlements, because reports belong to the player. `ownerId` is the
     * caller's own client-local id (`stores/player.ts`'s `id`) — the backend
     * resolves the player's realm in `worldId` from it; remembered so
     * `getById`/`getFieldById` can reuse it for a deep-linked report not in
     * the already-loaded list.
     */
    async load(worldId: string, ownerId?: string) {
      if (this.worldId !== (worldId ?? null) || this.ownerId !== (ownerId ?? null)) this.localRead = {};
      this.ownerId = ownerId ?? null;
      this.worldId = worldId ?? null;
      this.loading = true;
      this.error = null;
      try {
        // Wildlife camp fights exist only against a live backend (the demo has no army simulation).
        const [battleItems, tradeItems, fieldItems, campItems, armyItems] = await Promise.all([
          api.getWorldReports(worldId, ownerId),
          api.getWorldTradeReports(worldId, ownerId),
          api.getWorldFieldReports(worldId, ownerId),
          DEMO_MODE ? Promise.resolve([] as CampReportResponse[]) : api.getWorldCampReports(worldId, ownerId),
          DEMO_MODE ? Promise.resolve([] as ArmyReportResponse[]) : api.getWorldArmyReports(worldId, ownerId),
        ]);
        this.armyItems = [...armyItems].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );
        this.campItems = [...campItems].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );
        this.items = [...battleItems].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );
        this.tradeItems = [...tradeItems].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
        );
        // The backend already returns these newest-first (FieldBattleReportService),
        // but sorting client-side too keeps this store's own invariant explicit
        // regardless of that.
        this.fieldItems = [...fieldItems].sort(
          (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
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
        return await api.getReport(reportId, this.ownerId ?? undefined);
      } catch {
        return null;
      }
    },
    /** The field-battle sibling of `getById` — see its own comment. */
    async getFieldById(reportId: string): Promise<FieldBattleReportResponse | null> {
      const cached = this.fieldItems.find((r) => r.id === reportId);
      if (cached) return cached;
      try {
        return await api.getFieldReport(reportId, this.ownerId ?? undefined);
      } catch {
        return null;
      }
    },
    /** The camp-report sibling of `getById` — see its own comment. */
    async getCampById(reportId: string): Promise<CampReportResponse | null> {
      const cached = this.campItems.find((r) => r.id === reportId);
      if (cached) return cached;
      try {
        return await api.getCampReport(reportId, this.ownerId ?? undefined);
      } catch {
        return null;
      }
    },
    /** The army-report sibling of `getById` — see its own comment. */
    async getArmyById(reportId: string): Promise<ArmyReportResponse | null> {
      const cached = this.armyItems.find((r) => r.id === reportId);
      if (cached) return cached;
      try {
        return await api.getArmyReport(reportId, this.ownerId ?? undefined);
      } catch {
        return null;
      }
    },
    /** Marks one report read for the player: optimistic, undone when the request fails. No-op in the demo, without a world, or when it is already read. */
    async markRead(item: InboxItem) {
      const worldId = this.worldId;
      if (DEMO_MODE || !worldId || !isInboxItemUnread(item, this.localRead)) return;
      const key = inboxKey(item);
      this.localRead = { ...this.localRead, [key]: true };
      try {
        await api.markReportRead(worldId, item.kind, item.report.id, this.ownerId ?? undefined);
      } catch {
        const { [key]: _undone, ...rest } = this.localRead;
        this.localRead = rest;
      }
    },
    /** Marks every unread report read for the player: optimistic, undone for the whole batch when the request fails. */
    async markAllRead() {
      const worldId = this.worldId;
      if (DEMO_MODE || !worldId) return;
      const unread = this.inboxItems.filter((item) => isInboxItemUnread(item, this.localRead));
      if (!unread.length) return;
      const keys = unread.map(inboxKey);
      this.localRead = { ...this.localRead, ...Object.fromEntries(keys.map((key) => [key, true as const])) };
      try {
        await api.markAllReportsRead(worldId, this.ownerId ?? undefined);
      } catch {
        const rest = { ...this.localRead };
        for (const key of keys) delete rest[key];
        this.localRead = rest;
      }
    },
    /** Starts (or restarts, if already polling for a different world) the light background poll HudNav's badge relies on. */
    startPolling(worldId: string, ownerId?: string) {
      this.stopPolling();
      void this.load(worldId, ownerId);
      this.pollHandle = setInterval(() => void this.load(worldId, ownerId), REPORT_POLL_MS);
    },
    stopPolling() {
      if (this.pollHandle) clearInterval(this.pollHandle);
      this.pollHandle = null;
    },
  },
});
