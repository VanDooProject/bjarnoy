// Issue #46 phase 3 (frontend): the shared report inbox merges two report
// kinds — battle reports (issue #40) and trade reports — into one
// newest-first list with a Kind discriminator, per the design doc's §7
// note that both are delivered to "the same per-player inbox". Kept as
// pure, dependency-free helpers (mirroring lib/units/battleReports.ts)
// rather than folded into stores/reports.ts directly, so the merge/sort/
// unread logic is unit-testable without Pinia.
import type { BattleReportResponse, TradeReportResponse } from '../../api/types';

export type InboxItem =
  | { kind: 'battle'; report: BattleReportResponse }
  | { kind: 'trade'; report: TradeReportResponse };

export type InboxKindFilter = 'all' | 'battle' | 'trade';

/** The timestamp each report kind sorts/reads-unread by — `occurredAt` for battle, `completedAt` for trade. */
export function inboxTimestamp(item: InboxItem): string {
  return item.kind === 'battle' ? item.report.occurredAt : item.report.completedAt;
}

/** Combines both report lists into one newest-first inbox. */
export function mergeInbox(
  battleReports: BattleReportResponse[],
  tradeReports: TradeReportResponse[],
): InboxItem[] {
  const items: InboxItem[] = [
    ...battleReports.map((report): InboxItem => ({ kind: 'battle', report })),
    ...tradeReports.map((report): InboxItem => ({ kind: 'trade', report })),
  ];
  return items.sort((a, b) => new Date(inboxTimestamp(b)).getTime() - new Date(inboxTimestamp(a)).getTime());
}

/** Applies the inbox's Kind filter (All / Battle / Trade tabs). */
export function filterInbox(items: InboxItem[], filter: InboxKindFilter): InboxItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.kind === filter);
}

/** An inbox item counts as unread if it happened/completed after `lastSeenIso` (or nothing has been seen yet). */
export function isInboxItemUnread(item: InboxItem, lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return true;
  return new Date(inboxTimestamp(item)).getTime() > new Date(lastSeenIso).getTime();
}

/** How many of `items` (of either kind) are unread as of `lastSeenIso` — the HUD badge count. */
export function inboxUnreadCount(items: InboxItem[], lastSeenIso: string | null): number {
  return items.filter((item) => isInboxItemUnread(item, lastSeenIso)).length;
}
