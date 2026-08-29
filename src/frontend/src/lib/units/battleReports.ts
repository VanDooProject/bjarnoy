// Issue #40 phase 3 (frontend): pure helpers behind the battle-reports
// inbox/detail view (ReportsView.vue, stores/reports.ts) — kept dependency-
// free and unit-testable, same reasoning as lib/units/armyDispatch.ts.
import type { BattleReportAttackerLine, BattleReportDefenderLine, BattleReportSiege, ResourceLine } from '../../api/types';

// Wire building-type names -> a readable label. Mirrors the catalogue in
// `data/building-catalogue.json`/`BuildQueuePanel.vue`'s own `BUILDING_LABELS`
// — duplicated rather than imported, same as every other panel that needs a
// building label (each already keeps its own small map; see BuildQueuePanel.vue's
// comment on why scoped styles/consts aren't shared across components here).
const BUILDING_LABELS: Record<string, string> = {
  longhouse: 'Longhouse',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
  farm: 'Crop farm',
  storagehouse: 'Storehouse',
  tower: 'Watchtower',
  fishinghut: 'Fishing hut',
  magictower: 'Magic tower',
  pumpkinfarm: 'Pumpkin farm',
};

/** A readable label for a wire building-type name, falling back to the raw value for anything unmapped. */
export function buildingLabel(type: string): string {
  return BUILDING_LABELS[type] ?? type;
}

/**
 * `"Attack"` or `"Raid"` — this phase's dispatch UI only ever sends
 * `mission: 'attack'`, but a report can still come back as a Raid (backend
 * phase 7, another player's dispatch), so it's labelled rather than assumed.
 */
export function missionLabel(mission: string): string {
  return mission === 'raid' ? 'Raid' : 'Attack';
}

/** True when the settlement on `viewerSide` of this report came out on top. */
export function isVictoryFor(report: { winner: string }, viewerSide: 'attacker' | 'defender'): boolean {
  return report.winner === viewerSide;
}

/** `"Victory"` / `"Defeat"` from the given side's point of view. */
export function outcomeLabel(report: { winner: string }, viewerSide: 'attacker' | 'defender'): 'Victory' | 'Defeat' {
  return isVictoryFor(report, viewerSide) ? 'Victory' : 'Defeat';
}

/** Sum of every resource in a loot line — a single "how much was taken" number for a summary row. */
export function totalLoot(loot: ResourceLine): number {
  return loot.wood + loot.stone + loot.food + loot.iron;
}

function sumLost(lines: Array<{ lost: number }>): number {
  return lines.reduce((total, l) => total + l.lost, 0);
}

function sumSurvived(lines: Array<{ survived: number }>): number {
  return lines.reduce((total, l) => total + l.survived, 0);
}

/**
 * A one-line summary for a report-inbox row, e.g. `"5 lost, 12 survived, 340
 * looted"` — losses/survivors are counted on `viewerSide`'s own lines, and
 * loot is only mentioned when the attacker actually took some (a defender
 * never "loots" their own losses).
 */
export function reportSummaryLine(
  report: {
    attackerLines: BattleReportAttackerLine[];
    defenderLines: BattleReportDefenderLine[];
    lootTaken: ResourceLine;
  },
  viewerSide: 'attacker' | 'defender',
): string {
  const lines = viewerSide === 'attacker' ? report.attackerLines : report.defenderLines;
  const lost = sumLost(lines);
  const survived = sumSurvived(lines);
  const parts = [`${lost} lost`, `${survived} survived`];

  const loot = totalLoot(report.lootTaken);
  if (viewerSide === 'attacker' && loot > 0) {
    parts.push(`${Math.round(loot)} looted`);
  }
  return parts.join(', ');
}

/** Which side `settlementId` fought on in this report, or `null` if it fought neither (shouldn't happen for reports fetched for that settlement). */
export function sideFor(
  report: { attackerSettlementId: string; defenderSettlementId: string },
  settlementId: string,
): 'attacker' | 'defender' | null {
  if (report.attackerSettlementId === settlementId) return 'attacker';
  if (report.defenderSettlementId === settlementId) return 'defender';
  return null;
}

/** A report counts as unread if it happened after `lastSeenIso` (or nothing has been seen yet). */
export function isUnread(report: { occurredAt: string }, lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return true;
  return new Date(report.occurredAt).getTime() > new Date(lastSeenIso).getTime();
}

/** How many of `reports` are unread as of `lastSeenIso` — the HUD badge count. */
export function unreadCount(reports: Array<{ occurredAt: string }>, lastSeenIso: string | null): number {
  return reports.filter((r) => isUnread(r, lastSeenIso)).length;
}

/**
 * A one-line summary for a report's siege section (issue #40 phase 5),
 * mirroring `reportSummaryLine`'s style — e.g. `"Storehouse destroyed"`,
 * `"Longhouse destroyed — settlement razed"`, or `"Crop farm damaged: level
 * 3 → 1"`. `levelAfter <= 0` means the building was removed entirely (see
 * `BattleReportSiegeResponse`'s backend comment), so it reads as "destroyed"
 * rather than "damaged to level 0".
 */
export function siegeSummaryLine(siege: Pick<BattleReportSiege, 'targetType' | 'levelBefore' | 'levelAfter' | 'settlementRazed'>): string {
  const label = buildingLabel(siege.targetType);
  if (siege.levelAfter <= 0) {
    return siege.settlementRazed ? `${label} destroyed — settlement razed` : `${label} destroyed`;
  }
  return `${label} damaged: level ${siege.levelBefore} → ${siege.levelAfter}`;
}
