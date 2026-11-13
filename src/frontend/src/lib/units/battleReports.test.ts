import { describe, expect, it } from 'vitest';
import {
  buildingLabel,
  isUnread,
  isVictoryFor,
  missionLabel,
  outcomeLabel,
  reportSummaryLine,
  siegeSummaryLine,
  totalLoot,
  unreadCount,
} from './battleReports';

const baseReport = {
  attackerSettlementId: 'atk',
  defenderSettlementId: 'def',
  winner: 'attacker',
  mission: 'attack',
  attackerLines: [
    { unit: 'spearman', sent: 10, lost: 4, survived: 6, volleyLost: 0 },
    { unit: 'axeman', sent: 5, lost: 1, survived: 4, volleyLost: 0 },
  ],
  defenderLines: [{ unit: 'thrall', lost: 8, survived: 2, volleyLost: 0 }],
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

describe('reportSummaryLine for a fleet', () => {
  const fleet = {
    ...baseReport,
    shipFight: {
      attackerLines: [{ unit: 'fireship', sent: 30, lost: 4, survived: 26, volleyLost: 0 }],
      defenderLines: [{ unit: 'longship', lost: 2, survived: 0, volleyLost: 0 }],
    },
    drowned: [{ count: 20 }],
    fireShipsBurned: 10,
  };

  it('counts both fights, the burned Fire Ships as losses, and names the drowned', () => {
    expect(reportSummaryLine(fleet, 'attacker')).toBe('19 lost, 26 survived, 20 drowned, 70 looted');
  });

  it('counts each unit once: lost plus survived is what was sent, burned Fire Ships included', () => {
    // 15 land units sent (5 lost, 10 survived) and 30 Fire Ships sent (4 lost in the ship fight, 26 survived, 10 of those burned).
    expect(reportSummaryLine(fleet, 'attacker')).toContain('19 lost, 26 survived');
  });

  it("counts the defender's ships and land units together and never the drowned", () => {
    expect(reportSummaryLine(fleet, 'defender')).toBe('10 lost, 2 survived');
  });

  it('reads as before when the report has no ship fight', () => {
    expect(reportSummaryLine({ ...baseReport, shipFight: null, drowned: [], fireShipsBurned: 0 }, 'attacker')).toBe('5 lost, 10 survived, 70 looted');
  });
});

describe('buildingLabel', () => {
  it('labels a known building type', () => {
    expect(buildingLabel('storagehouse')).toBe('Storehouse');
    expect(buildingLabel('longhouse')).toBe('Longhouse');
  });

  it('falls back to the raw value for an unmapped type', () => {
    expect(buildingLabel('mystery-shed')).toBe('mystery-shed');
  });
});

describe('siegeSummaryLine', () => {
  it('describes a damaged-but-standing building', () => {
    expect(
      siegeSummaryLine({ targetType: 'farm', levelBefore: 3, levelAfter: 1, settlementRazed: false }),
    ).toBe('Crop farm damaged: level 3 → 1');
  });

  it('describes a destroyed non-longhouse building', () => {
    expect(
      siegeSummaryLine({ targetType: 'quarry', levelBefore: 1, levelAfter: 0, settlementRazed: false }),
    ).toBe('Quarry destroyed');
  });

  it('calls out a razed settlement when the longhouse is destroyed', () => {
    expect(
      siegeSummaryLine({ targetType: 'longhouse', levelBefore: 1, levelAfter: 0, settlementRazed: true }),
    ).toBe('Longhouse destroyed — settlement razed');
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
