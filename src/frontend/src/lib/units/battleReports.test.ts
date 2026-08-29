import { describe, expect, it } from 'vitest';
import {
  isUnread,
  isVictoryFor,
  missionLabel,
  outcomeLabel,
  reportSummaryLine,
  sideFor,
  totalLoot,
  unreadCount,
} from './battleReports';

const baseReport = {
  attackerSettlementId: 'atk',
  defenderSettlementId: 'def',
  winner: 'attacker',
  mission: 'attack',
  attackerLines: [
    { unit: 'spearman', sent: 10, lost: 4, survived: 6 },
    { unit: 'axeman', sent: 5, lost: 1, survived: 4 },
  ],
  defenderLines: [{ unit: 'thrall', lost: 8, survived: 2 }],
  lootTaken: { wood: 50, stone: 0, food: 20, iron: 0 },
};

describe('missionLabel', () => {
  it('labels attack', () => {
    expect(missionLabel('attack')).toBe('Attack');
  });
  it('labels raid', () => {
    expect(missionLabel('raid')).toBe('Raid');
  });
});

describe('isVictoryFor / outcomeLabel', () => {
  it('the attacker won this report', () => {
    expect(isVictoryFor(baseReport, 'attacker')).toBe(true);
    expect(isVictoryFor(baseReport, 'defender')).toBe(false);
    expect(outcomeLabel(baseReport, 'attacker')).toBe('Victory');
    expect(outcomeLabel(baseReport, 'defender')).toBe('Defeat');
  });

  it('flips when the defender won instead', () => {
    const defenderWon = { ...baseReport, winner: 'defender' };
    expect(outcomeLabel(defenderWon, 'attacker')).toBe('Defeat');
    expect(outcomeLabel(defenderWon, 'defender')).toBe('Victory');
  });
});

describe('totalLoot', () => {
  it('sums every resource', () => {
    expect(totalLoot({ wood: 10, stone: 5, food: 2, iron: 1 })).toBe(18);
  });
});

describe('reportSummaryLine', () => {
  it("summarises the attacker's own losses/survivors and mentions loot", () => {
    expect(reportSummaryLine(baseReport, 'attacker')).toBe('5 lost, 10 survived, 70 looted');
  });

  it("summarises the defender's own losses/survivors and never mentions loot", () => {
    expect(reportSummaryLine(baseReport, 'defender')).toBe('8 lost, 2 survived');
  });

  it('omits the loot phrase when nothing was taken', () => {
    const noLoot = { ...baseReport, lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 } };
    expect(reportSummaryLine(noLoot, 'attacker')).toBe('5 lost, 10 survived');
  });
});

describe('sideFor', () => {
  it('identifies the attacker side', () => {
    expect(sideFor(baseReport, 'atk')).toBe('attacker');
  });
  it('identifies the defender side', () => {
    expect(sideFor(baseReport, 'def')).toBe('defender');
  });
  it('returns null for an unrelated settlement', () => {
    expect(sideFor(baseReport, 'someone-else')).toBeNull();
  });
});

describe('isUnread / unreadCount', () => {
  const earlier = { occurredAt: '2026-08-29T10:00:00.000Z' };
  const later = { occurredAt: '2026-08-29T12:00:00.000Z' };

  it('everything is unread when nothing has been seen yet', () => {
    expect(isUnread(earlier, null)).toBe(true);
  });

  it('a report before the last-seen timestamp is read', () => {
    expect(isUnread(earlier, '2026-08-29T11:00:00.000Z')).toBe(false);
  });

  it('a report after the last-seen timestamp is unread', () => {
    expect(isUnread(later, '2026-08-29T11:00:00.000Z')).toBe(true);
  });

  it('counts only the unread ones', () => {
    expect(unreadCount([earlier, later], '2026-08-29T11:00:00.000Z')).toBe(1);
  });
});
