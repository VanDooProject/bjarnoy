// Pure helpers behind the camp-fight report card and the reports inbox rows (hunt, ambush and
// tower attack — `CampReportResponse`). Kept dependency-free beside `battleReports.ts` /
// `fieldBattleReports.ts` so the logic is testable without Pinia or a DOM.
import type { CampReportResponse, ResourceLine } from '../../api/types';

/** The viewer is always the player the report was written for, so `winner: 'army'` is a win (for a tower report: the tower held). */
export function isCampReportVictory(report: Pick<CampReportResponse, 'winner'>): boolean {
  return report.winner === 'army';
}

export function totalCampLoot(loot: ResourceLine): number {
  return Math.round(loot.wood + loot.stone + loot.food + loot.iron);
}

export function totalUnitsLost(report: Pick<CampReportResponse, 'units'>): number {
  return report.units.reduce((sum, u) => sum + u.lost, 0);
}

export function totalBeastsLost(report: Pick<CampReportResponse, 'beasts'>): number {
  return report.beasts.reduce((sum, b) => sum + b.lost, 0);
}
