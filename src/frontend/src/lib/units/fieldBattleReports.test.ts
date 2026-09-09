import { describe, expect, it } from 'vitest';
import {
  fieldBattleLossCount,
  fieldBattleOutcomeLabel,
  fieldBattleSideFor,
  fieldBattleSummaryLine,
  fieldBattleSurvivorCount,
  groupFieldBattleLinesByUnit,
  isFieldBattleReportUnread,
  isFieldBattleVictoryFor,
  otherFieldBattleSide,
  totalFieldBattleLoot,
} from './fieldBattleReports';

const baseReport = {
  sideASettlementId: 'a-settlement',
  sideBSettlementId: 'b-settlement',
  winner: 'sidea',
  lines: [
    { side: 'sidea' as const, isLoss: true, unit: 'axeman', count: 2 },
    { side: 'sidea' as const, isLoss: false, unit: 'axeman', count: 8 },
    { side: 'sideb' as const, isLoss: true, unit: 'spearman', count: 5 },
  ],
  lootTaken: { wood: 10, stone: 0, food: 0, iron: 0 },
};

describe('otherFieldBattleSide', () => {
  it('flips sideA and sideB', () => {
    expect(otherFieldBattleSide('sidea')).toBe('sideb');
    expect(otherFieldBattleSide('sideb')).toBe('sidea');
  });
});

describe('isFieldBattleVictoryFor / fieldBattleOutcomeLabel', () => {
  it('side A won this report', () => {
    expect(isFieldBattleVictoryFor(baseReport, 'sidea')).toBe(true);
    expect(isFieldBattleVictoryFor(baseReport, 'sideb')).toBe(false);
    expect(fieldBattleOutcomeLabel(baseReport, 'sidea')).toBe('Won');
    expect(fieldBattleOutcomeLabel(baseReport, 'sideb')).toBe('Lost');
  });

  it('reports a tie identically for both sides', () => {
    const tied = { ...baseReport, winner: 'tie' };
    expect(isFieldBattleVictoryFor(tied, 'sidea')).toBe(false);
    expect(fieldBattleOutcomeLabel(tied, 'sidea')).toBe('Tied');
    expect(fieldBattleOutcomeLabel(tied, 'sideb')).toBe('Tied');
  });
});

describe('totalFieldBattleLoot', () => {
  it('sums every resource', () => {
    expect(totalFieldBattleLoot({ wood: 10, stone: 5, food: 2, iron: 1 })).toBe(18);
  });
});

describe('fieldBattleLossCount / fieldBattleSurvivorCount', () => {
  it('sums only the matching side and loss/survivor flag', () => {
    expect(fieldBattleLossCount(baseReport.lines, 'sidea')).toBe(2);
    expect(fieldBattleSurvivorCount(baseReport.lines, 'sidea')).toBe(8);
    expect(fieldBattleLossCount(baseReport.lines, 'sideb')).toBe(5);
    expect(fieldBattleSurvivorCount(baseReport.lines, 'sideb')).toBe(0);
  });
});

describe('fieldBattleSummaryLine', () => {
  it("summarises side A's own losses and mentions loot on the winning side", () => {
    expect(fieldBattleSummaryLine(baseReport, 'sidea')).toBe('won, 2 lost, 10 looted');
  });

  it("summarises side B's own losses and never mentions loot for the losing side", () => {
    expect(fieldBattleSummaryLine(baseReport, 'sideb')).toBe('lost, 5 lost');
  });

  it('reads as tied for either side on a tie, with no loot mentioned', () => {
    const tied = { ...baseReport, winner: 'tie' };
    expect(fieldBattleSummaryLine(tied, 'sidea')).toBe('tied, 2 lost');
    expect(fieldBattleSummaryLine(tied, 'sideb')).toBe('tied, 5 lost');
  });
});

describe('groupFieldBattleLinesByUnit', () => {
  it('merges a unit type\'s loss and survivor lines into one row', () => {
    const lines = [
      { side: 'sidea' as const, isLoss: true, unit: 'axeman', count: 2 },
      { side: 'sidea' as const, isLoss: false, unit: 'axeman', count: 8 },
      { side: 'sidea' as const, isLoss: true, unit: 'spearman', count: 1 },
      { side: 'sideb' as const, isLoss: true, unit: 'axeman', count: 9 },
    ];
    expect(groupFieldBattleLinesByUnit(lines, 'sidea')).toEqual([
      { unit: 'axeman', lost: 2, survived: 8 },
      { unit: 'spearman', lost: 1, survived: 0 },
    ]);
    expect(groupFieldBattleLinesByUnit(lines, 'sideb')).toEqual([{ unit: 'axeman', lost: 9, survived: 0 }]);
  });

  it('returns an empty array for a side with no lines', () => {
    expect(groupFieldBattleLinesByUnit([], 'sidea')).toEqual([]);
  });
});

describe('fieldBattleSideFor', () => {
  it('identifies side A', () => {
    expect(fieldBattleSideFor(baseReport, 'a-settlement')).toBe('sidea');
  });
  it('identifies side B', () => {
    expect(fieldBattleSideFor(baseReport, 'b-settlement')).toBe('sideb');
  });
  it('returns null for an unrelated settlement', () => {
    expect(fieldBattleSideFor(baseReport, 'someone-else')).toBeNull();
  });
});

describe('isFieldBattleReportUnread', () => {
  const earlier = { occurredAt: '2026-08-29T10:00:00.000Z' };
  const later = { occurredAt: '2026-08-29T12:00:00.000Z' };

  it('everything is unread when nothing has been seen yet', () => {
    expect(isFieldBattleReportUnread(earlier, null)).toBe(true);
  });

  it('a report before the last-seen timestamp is read', () => {
    expect(isFieldBattleReportUnread(earlier, '2026-08-29T11:00:00.000Z')).toBe(false);
  });

  it('a report after the last-seen timestamp is unread', () => {
    expect(isFieldBattleReportUnread(later, '2026-08-29T11:00:00.000Z')).toBe(true);
  });
});
