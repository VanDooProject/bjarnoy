import { describe, expect, it } from 'vitest';
import { filterInbox, inboxUnreadCount, isInboxItemUnread, mergeInbox } from './inbox';
import type { BattleReportResponse, FieldBattleReportResponse, TradeReportResponse } from '../../api/types';

function battle(id: string, occurredAt: string): BattleReportResponse {
  return {
    id,
    occurredAt,
    attackerArmyId: 'army-1',
    attackerSettlementId: 'atk',
    defenderSettlementId: 'def',
    mission: 'attack',
    winner: 'attacker',
    attackPower: 10,
    defensePower: 5,
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    attackerLines: [],
    defenderLines: [],
    siege: null,
  };
}

function field(id: string, occurredAt: string): FieldBattleReportResponse {
  return {
    id,
    occurredAt,
    hex: { q: 0, r: 0 },
    sideAArmyId: 'army-a',
    sideASettlementId: 'a',
    sideBArmyId: 'army-b',
    sideBSettlementId: 'b',
    winner: 'sidea',
    sideAPower: 10,
    sideBPower: 5,
    sideAWasDefending: false,
    sideBWasDefending: false,
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    lines: [],
  };
}

function trade(id: string, completedAt: string): TradeReportResponse {
  return {
    id,
    offerId: `offer-${id}`,
    completedAt,
    posterSettlementId: 'poster',
    acceptorSettlementId: 'acceptor',
    offeredResource: 'wood',
    offeredAmount: 200,
    requestedResource: 'iron',
    requestedAmount: 100,
    guildTrade: false,
    travelHours: 1,
  };
}

describe('mergeInbox', () => {
  it('sorts both kinds together, newest first', () => {
    const battleReports = [battle('b1', '2026-08-29T10:00:00.000Z')];
    const tradeReports = [trade('t1', '2026-08-29T12:00:00.000Z'), trade('t2', '2026-08-29T08:00:00.000Z')];

    const merged = mergeInbox(battleReports, tradeReports);

    expect(merged.map((item) => item.report.id)).toEqual(['t1', 'b1', 't2']);
    expect(merged.map((item) => item.kind)).toEqual(['trade', 'battle', 'trade']);
  });

  it('is empty when all lists are empty', () => {
    expect(mergeInbox([], [])).toEqual([]);
  });

  it('folds field-battle reports (issue #206) into the same newest-first order', () => {
    const merged = mergeInbox(
      [battle('b1', '2026-08-29T10:00:00.000Z')],
      [trade('t1', '2026-08-29T09:00:00.000Z')],
      [field('f1', '2026-08-29T11:00:00.000Z')],
    );

    expect(merged.map((item) => item.report.id)).toEqual(['f1', 'b1', 't1']);
    expect(merged.map((item) => item.kind)).toEqual(['field', 'battle', 'trade']);
  });
});

describe('filterInbox', () => {
  const items = mergeInbox([battle('b1', '2026-08-29T10:00:00.000Z')], [trade('t1', '2026-08-29T12:00:00.000Z')]);

  it("'all' keeps everything", () => {
    expect(filterInbox(items, 'all')).toHaveLength(2);
  });
  it("'battle' keeps only battle reports", () => {
    expect(filterInbox(items, 'battle').map((i) => i.kind)).toEqual(['battle']);
  });
  it("'trade' keeps only trade reports", () => {
    expect(filterInbox(items, 'trade').map((i) => i.kind)).toEqual(['trade']);
  });

  it("'field' keeps only field-battle reports", () => {
    const withField = mergeInbox(
      [battle('b1', '2026-08-29T10:00:00.000Z')],
      [trade('t1', '2026-08-29T12:00:00.000Z')],
      [field('f1', '2026-08-29T11:00:00.000Z')],
    );
    expect(filterInbox(withField, 'field').map((i) => i.kind)).toEqual(['field']);
  });
});

describe('isInboxItemUnread / inboxUnreadCount', () => {
  const items = mergeInbox(
    [battle('b1', '2026-08-29T09:00:00.000Z')],
    [trade('t1', '2026-08-29T13:00:00.000Z')],
  );

  it('everything is unread when nothing has been seen yet', () => {
    expect(items.every((item) => isInboxItemUnread(item, null))).toBe(true);
  });

  it('counts only items newer than lastSeenIso, across both kinds', () => {
    expect(inboxUnreadCount(items, '2026-08-29T11:00:00.000Z')).toBe(1);
    expect(inboxUnreadCount(items, '2026-08-29T08:00:00.000Z')).toBe(2);
  });
});
