// Issue #46 phase 3 (frontend): pure helpers behind the trade-report side of
// the shared inbox (ReportsView.vue, stores/reports.ts) — kept dependency-
// free and unit-testable, mirroring lib/units/battleReports.ts's own split.
import type { TradeReportResponse } from '../../api/types';

/** Which side `settlementId` traded on in this report — `null` if it was neither (shouldn't happen for reports fetched for that settlement). */
export function tradeSideFor(
  report: { posterSettlementId: string; acceptorSettlementId: string },
  settlementId: string,
): 'poster' | 'acceptor' | null {
  if (report.posterSettlementId === settlementId) return 'poster';
  if (report.acceptorSettlementId === settlementId) return 'acceptor';
  return null;
}

/**
 * A one-line summary for a report-inbox row, from `viewerSide`'s point of
 * view — the poster gave the offered goods and received the requested
 * goods; the acceptor is the mirror image.
 */
export function tradeSummaryLine(
  report: {
    offeredResource: string;
    offeredAmount: number;
    requestedResource: string;
    requestedAmount: number;
  },
  viewerSide: 'poster' | 'acceptor',
): string {
  const gave = viewerSide === 'poster' ? report.offeredResource : report.requestedResource;
  const gaveAmount = viewerSide === 'poster' ? report.offeredAmount : report.requestedAmount;
  const got = viewerSide === 'poster' ? report.requestedResource : report.offeredResource;
  const gotAmount = viewerSide === 'poster' ? report.requestedAmount : report.offeredAmount;
  return `Gave ${Math.round(gaveAmount)} ${gave} for ${Math.round(gotAmount)} ${got}`;
}

/** A trade report counts as unread if it completed after `lastSeenIso` (or nothing has been seen yet). */
export function isTradeReportUnread(report: { completedAt: string }, lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return true;
  return new Date(report.completedAt).getTime() > new Date(lastSeenIso).getTime();
}

export function tradeUnreadCount(reports: TradeReportResponse[], lastSeenIso: string | null): number {
  return reports.filter((r) => isTradeReportUnread(r, lastSeenIso)).length;
}
