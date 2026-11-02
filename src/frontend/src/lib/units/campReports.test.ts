import { describe, expect, it } from 'vitest';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from './campReports';

describe('campReports', () => {
  it('scores the army as the viewer', () => {
    expect(isCampReportVictory({ winner: 'army' })).toBe(true);
    expect(isCampReportVictory({ winner: 'camp' })).toBe(false);
  });
  it('totals loot and losses', () => {
    expect(totalCampLoot({ wood: 1, stone: 2, food: 3.4, iron: 4 })).toBe(10);
    expect(totalUnitsLost({ units: [{ type: 'a', sent: 5, lost: 2 }, { type: 'b', sent: 1, lost: 1 }] })).toBe(3);
    expect(totalBeastsLost({ beasts: [{ tier: 'young', before: 3, lost: 3 }, { tier: 'adult', before: 6, lost: 1 }] })).toBe(4);
  });
});
