// Pure helpers behind the army report card and the reports inbox rows (army stuck / army starved —
// `ArmyReportResponse`). Kept dependency-free beside `campReports.ts` so the logic is testable without Pinia or a DOM.
import type { ArmyReportResponse } from '../../api/types';

/** The hex an army report is about, as shown in its text: "(q, r)". */
export function armyReportHex(report: Pick<ArmyReportResponse, 'hex'>): string {
  return `(${report.hex.q}, ${report.hex.r})`;
}

/** How many troops the report counts: the troops lost (`starved`) or the troops in the army (`stuck`). */
export function armyReportTroops(report: Pick<ArmyReportResponse, 'units'>): number {
  return report.units.reduce((sum, u) => sum + u.count, 0);
}
