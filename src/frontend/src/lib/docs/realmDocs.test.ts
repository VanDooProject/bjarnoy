import { describe, expect, it } from 'vitest';
import { maxTowers } from '../map/buildingEconomy';
import { towerLimitRows } from './realmDocs';

describe('towerLimitRows', () => {
  const rows = towerLimitRows();

  it('starts with one tower at Longhouse 3 and ends with 13 at Longhouse 29-30', () => {
    expect(rows[0]).toEqual({ from: 3, to: 6, towers: 1 });
    expect(rows[1]).toEqual({ from: 7, to: 8, towers: 2 });
    expect(rows[2]).toEqual({ from: 9, to: 10, towers: 3 });
    expect(rows.at(-1)).toEqual({ from: 29, to: 30, towers: 13 });
  });

  it('covers every level from 3 to 30 once and agrees with maxTowers on each', () => {
    const covered: number[] = [];
    for (const row of rows) {
      for (let level = row.from; level <= row.to; level++) {
        covered.push(level);
        expect(maxTowers(level)).toBe(row.towers);
      }
    }
    expect(covered).toEqual(Array.from({ length: 28 }, (_, i) => i + 3));
  });
});
