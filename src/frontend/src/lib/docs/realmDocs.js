// What the realm docs page (RealmView.vue) lists beyond the example map: how many towers each Longhouse level allows.
// The rule itself is `maxTowers` (buildingEconomy.ts), mirrored from `BuildingCatalogue.MaxTowers`; this only groups it.
import { maxLevelFor, maxTowers } from '../map/buildingEconomy';
/** The first Longhouse level that allows a tower. */
export const FIRST_TOWER_LONGHOUSE_LEVEL = 3;
/** One row per run of Longhouse levels that allow the same number of towers, from level 1 (no towers) up to the last level. */
export function towerLimitRows() {
    const rows = [];
    for (let level = 1; level <= maxLevelFor('longhouse'); level++) {
        const towers = maxTowers(level);
        const last = rows.at(-1);
        if (last && last.towers === towers)
            last.to = level;
        else
            rows.push({ from: level, to: level, towers });
    }
    return rows;
}
