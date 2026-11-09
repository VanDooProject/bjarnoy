/** The viewer is always the player the report was written for, so `winner: 'army'` is a win (for a tower report: the tower held). */
export function isCampReportVictory(report) {
    return report.winner === 'army';
}
export function totalCampLoot(loot) {
    return Math.round(loot.wood + loot.stone + loot.food + loot.iron);
}
export function totalUnitsLost(report) {
    return report.units.reduce((sum, u) => sum + u.lost, 0);
}
export function totalBeastsLost(report) {
    return report.beasts.reduce((sum, b) => sum + b.lost, 0);
}
