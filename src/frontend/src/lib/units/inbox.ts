// Issue #46 phase 3 (frontend): the shared report inbox merges two report
// kinds — battle reports (issue #40) and trade reports — into one
// newest-first list with a Kind discriminator, per the design doc's §7
// note that both are delivered to "the same per-player inbox". Kept as
// pure, dependency-free helpers (mirroring lib/units/battleReports.ts)
// rather than folded into stores/reports.ts directly, so the merge/sort/
// unread logic is unit-testable without Pinia.
import type {
  ArmyReportResponse,
  BattleReportResponse,
  CampReportResponse,
  FieldBattleReportResponse,
  TradeReportResponse,
} from '../../api/types';
import { isVictoryFor } from './battleReports';
import { isCampReportVictory } from './campReports';
import { isFieldBattleVictoryFor } from './fieldBattleReports';

// Issue #206 folds field-battle reports into the same inbox as a third kind
// — `report.id`/`.occurredAt` line up with a battle report's own shape, so
// this is a small addition on top of issue #46 phase 3's existing merge
// rather than a parallel structure.
export type InboxItem =
  | { kind: 'battle'; report: BattleReportResponse }
  | { kind: 'field'; report: FieldBattleReportResponse }
  | { kind: 'camp'; report: CampReportResponse }
  | { kind: 'army'; report: ArmyReportResponse }
  | { kind: 'trade'; report: TradeReportResponse };

export const INBOX_KINDS = ['battle', 'field', 'camp', 'army', 'trade'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];
export type InboxKindFilter = 'all' | InboxKind;

/** How many of the newest reports the Reports panel (desktop) and sheet (phone) list. */
export const REPORTS_PANEL_ROWS = 5;

/** What an inbox row's icon tile, border and title are tinted by. */
export type InboxTone = 'win' | 'loss' | 'tie' | 'trade';

/** The timestamp each report kind sorts/reads-unread by — `occurredAt` for battle/field, `completedAt` for trade. */
export function inboxTimestamp(item: InboxItem): string {
  return item.kind === 'trade' ? item.report.completedAt : item.report.occurredAt;
}

/** Combines all three report lists into one newest-first inbox. */
export function mergeInbox(
  battleReports: BattleReportResponse[],
  tradeReports: TradeReportResponse[],
  fieldReports: FieldBattleReportResponse[] = [],
  campReports: CampReportResponse[] = [],
  armyReports: ArmyReportResponse[] = [],
): InboxItem[] {
  const items: InboxItem[] = [
    ...battleReports.map((report): InboxItem => ({ kind: 'battle', report })),
    ...fieldReports.map((report): InboxItem => ({ kind: 'field', report })),
    ...campReports.map((report): InboxItem => ({ kind: 'camp', report })),
    ...armyReports.map((report): InboxItem => ({ kind: 'army', report })),
    ...tradeReports.map((report): InboxItem => ({ kind: 'trade', report })),
  ];
  return items.sort((a, b) => new Date(inboxTimestamp(b)).getTime() - new Date(inboxTimestamp(a)).getTime());
}

/** Applies the inbox's Kind filter (All / Battle / Field / Camps / Armies / Trade tabs). */
export function filterInbox(items: InboxItem[], filter: InboxKindFilter): InboxItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.kind === filter);
}

// The side comes from the server (`viewerSide`): a player's inbox covers all their settlements, so it cannot be told from one settlement id.
export function sideOf(report: BattleReportResponse): 'attacker' | 'defender' {
  return report.viewerSide ?? 'attacker';
}

export function fieldSideOf(report: FieldBattleReportResponse): 'sidea' | 'sideb' {
  return report.viewerSide ?? 'sidea';
}

export function tradeSideOf(report: TradeReportResponse): 'poster' | 'acceptor' {
  return report.viewerSide ?? 'poster';
}

/** Identifies an inbox item across kinds (report ids are only unique within a kind). */
export function inboxKey(item: InboxItem): string {
  return `${item.kind}:${item.report.id}`;
}

/** Unread = the server has no read time for the viewer's side yet and the player did not just open it here (`localRead`, the optimistic overlay). */
export function isInboxItemUnread(item: InboxItem, localRead: Readonly<Record<string, true>>): boolean {
  return !item.report.read && !localRead[inboxKey(item)];
}

/** How many of `items` are unread — the HUD badge count. */
export function inboxUnreadCount(items: InboxItem[], localRead: Readonly<Record<string, true>>): number {
  return items.filter((item) => isInboxItemUnread(item, localRead)).length;
}

/** Unread count per report kind — the kind tabs' corner badges. */
export function inboxUnreadByKind(items: InboxItem[], localRead: Readonly<Record<string, true>>): Record<InboxKind, number> {
  const counts: Record<InboxKind, number> = { battle: 0, field: 0, camp: 0, army: 0, trade: 0 };
  for (const item of items) if (isInboxItemUnread(item, localRead)) counts[item.kind] += 1;
  return counts;
}

/** The tone of an item from the viewer's side: won, lost, a draw / stuck army, or a trade. */
export function inboxTone(item: InboxItem): InboxTone {
  switch (item.kind) {
    case 'battle':
      return isVictoryFor(item.report, sideOf(item.report)) ? 'win' : 'loss';
    case 'field':
      if (item.report.winner === 'tie') return 'tie';
      return isFieldBattleVictoryFor(item.report, fieldSideOf(item.report)) ? 'win' : 'loss';
    case 'camp':
      return isCampReportVictory(item.report) ? 'win' : 'loss';
    case 'army':
      return item.report.kind === 'stuck' ? 'tie' : 'loss';
    case 'trade':
      return 'trade';
  }
}

/** The hex an item happened at, for its "show on map" link; none for trades. */
export function inboxLocation(item: InboxItem): { q: number; r: number } | null {
  switch (item.kind) {
    case 'battle': {
      const target = item.report.siege?.targetCoord ?? item.report.fireSiege?.targetCoord ?? null;
      return target ? { q: target.q, r: target.r } : null;
    }
    case 'field':
      return { q: item.report.hex.q, r: item.report.hex.r };
    case 'camp':
      return { q: item.report.camp.q, r: item.report.camp.r };
    case 'army':
      return { q: item.report.hex.q, r: item.report.hex.r };
    case 'trade':
      return null;
  }
}
