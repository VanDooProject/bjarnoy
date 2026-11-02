// What the realm docs page (RealmView.vue) lists beyond the example map: how many towers each Longhouse level allows.
// The rule itself is `maxTowers` (buildingEconomy.ts), mirrored from `BuildingCatalogue.MaxTowers`; this only groups it.
import { maxLevelFor, maxTowers } from '../map/buildingEconomy';

/** The first Longhouse level that allows a tower. */
export const FIRST_TOWER_LONGHOUSE_LEVEL = 3;

export interface TowerLimitRow {
  /** The Longhouse levels the row covers. */
  from: number;
  to: number;
  /** How many towers those levels allow. */
  towers: number;
}

/** One row per run of Longhouse levels that allow the same number of towers, from the first level with a tower up to the last. */
export function towerLimitRows(): TowerLimitRow[] {
  const rows: TowerLimitRow[] = [];
  for (let level = FIRST_TOWER_LONGHOUSE_LEVEL; level <= maxLevelFor('longhouse'); level++) {
    const towers = maxTowers(level);
    const last = rows.at(-1);
    if (last && last.towers === towers) last.to = level;
    else rows.push({ from: level, to: level, towers });
  }
  return rows;
}
