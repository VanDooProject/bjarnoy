// Issue #206 (frontend): pure helpers behind the field-battle report detail
// view — the army-vs-army sibling of lib/units/battleReports.ts. Field
// battles are symmetric (side A / side B, no attacker/defender asymmetry —
// see FieldBattleReportResponse's backend comment), so these helpers take a
// `viewerSide` of `'sidea' | 'sideb'` rather than `'attacker' | 'defender'`.
import type { FieldBattleReportLine, FieldBattleReportResponse, ResourceLine } from '../../api/types';
import { i18n } from '../../i18n';

export type FieldBattleSide = 'sidea' | 'sideb';

/** The side opposite `side` — every symmetric helper below needs it once. */
export function otherFieldBattleSide(side: FieldBattleSide): FieldBattleSide {
  return side === 'sidea' ? 'sideb' : 'sidea';
}

/** True when `viewerSide` won outright — false for the other side's win and for a tie. */
export function isFieldBattleVictoryFor(report: { winner: string }, viewerSide: FieldBattleSide): boolean {
  return report.winner === viewerSide;
}

/** `"Won"` / `"Lost"` / `"Tied"` from `viewerSide`'s point of view. */
export function fieldBattleOutcomeLabel(report: { winner: string }, viewerSide: FieldBattleSide): string {
  if (report.winner === 'tie') return i18n.global.t('hud.fieldBattleReport.tied');
  return isFieldBattleVictoryFor(report, viewerSide)
    ? i18n.global.t('hud.fieldBattleReport.won')
    : i18n.global.t('hud.fieldBattleReport.lost');
}

/** Sum of every resource in a loot line — a single "how much was taken" number for a summary row. */
export function totalFieldBattleLoot(loot: ResourceLine): number {
  return loot.wood + loot.stone + loot.food + loot.iron;
}

function linesFor(lines: FieldBattleReportLine[], side: FieldBattleSide): FieldBattleReportLine[] {
  return lines.filter((l) => l.side === side);
}

/**
 * `side`'s loss and survivor lines merged into one row per unit type (the
 * backend stores them as separate `isLoss` rows — see
 * `FieldBattleReportLineEntity` — but the card renders "unit / lost /
 * survived" per row like `BattleReportAttackerLine` does).
 */
export function groupFieldBattleLinesByUnit(
  lines: FieldBattleReportLine[],
  side: FieldBattleSide,
): Array<{ unit: string; lost: number; survived: number }> {
  const byUnit = new Map<string, { unit: string; lost: number; survived: number }>();
  for (const line of linesFor(lines, side)) {
    const row = byUnit.get(line.unit) ?? { unit: line.unit, lost: 0, survived: 0 };
    if (line.isLoss) row.lost += line.count;
    else row.survived += line.count;
    byUnit.set(line.unit, row);
  }
  return [...byUnit.values()];
}

/** How many units `side` lost in this report (summed across unit types). */
export function fieldBattleLossCount(lines: FieldBattleReportLine[], side: FieldBattleSide): number {
  return linesFor(lines, side)
    .filter((l) => l.isLoss)
    .reduce((total, l) => total + l.count, 0);
}

/** How many of `side`'s units survived this report (summed across unit types). */
export function fieldBattleSurvivorCount(lines: FieldBattleReportLine[], side: FieldBattleSide): number {
  return linesFor(lines, side)
    .filter((l) => !l.isLoss)
    .reduce((total, l) => total + l.count, 0);
}

/**
 * A one-line summary for a report-inbox row, e.g. `"Won, 3 lost, 40 looted"`
 * — the outcome and own losses are from `viewerSide`'s point of view, and
 * loot is only mentioned when `viewerSide` actually won it (the loser's own
 * carried loot being reduced doesn't count as "looting" here).
 */
export function fieldBattleSummaryLine(
  report: Pick<FieldBattleReportResponse, 'winner' | 'lines' | 'lootTaken'>,
  viewerSide: FieldBattleSide,
): string {
  const lost = fieldBattleLossCount(report.lines, viewerSide);
  const key =
    report.winner === 'tie'
      ? 'hud.fieldBattleReport.summaryTied'
      : isFieldBattleVictoryFor(report, viewerSide)
        ? 'hud.fieldBattleReport.summaryWon'
        : 'hud.fieldBattleReport.summaryLost';
  const parts = [i18n.global.t(key, { n: lost })];

  const loot = totalFieldBattleLoot(report.lootTaken);
  if (report.winner === viewerSide && loot > 0) {
    parts.push(i18n.global.t('hud.fieldBattleReport.summaryLooted', { n: Math.round(loot) }));
  }
  return parts.join(', ');
}

/** Which side `settlementId` fought on in this report, or `null` if it fought neither (shouldn't happen for reports fetched for that settlement). */
export function fieldBattleSideFor(
  report: { sideASettlementId: string; sideBSettlementId: string },
  settlementId: string,
): FieldBattleSide | null {
  if (report.sideASettlementId === settlementId) return 'sidea';
  if (report.sideBSettlementId === settlementId) return 'sideb';
  return null;
}

/** A report counts as unread if it happened after `lastSeenIso` (or nothing has been seen yet). */
export function isFieldBattleReportUnread(report: { occurredAt: string }, lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return true;
  return new Date(report.occurredAt).getTime() > new Date(lastSeenIso).getTime();
}
