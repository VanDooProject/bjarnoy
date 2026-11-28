import { describe, expect, it } from 'vitest';
import {
  filterInbox,
  inboxKey,
  inboxLocation,
  inboxTone,
  inboxUnreadByKind,
  inboxUnreadCount,
  isInboxItemUnread,
  mergeInbox,
} from './inbox';
import type { ArmyReportResponse, BattleReportResponse, CampReportResponse, FieldBattleReportResponse, TradeReportResponse } from '../../api/types';

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
    attackerVolleyPower: 0,
    defenderVolleyPower: 0,
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    attackerLines: [],
    defenderLines: [],
    siege: null,
    shipFight: null,
    drowned: [],
    fireShipsBurned: 0,
    fireSiege: null,
    viewerSide: 'attacker',
    read: false,
  };
}

function field(id: string, occurredAt: string): FieldBattleReportResponse {
  return {
    id,
    occurredAt,
    hex: { q: 0, r: 0 },
    sideAArmyId: 'army-a',
    sideASettlementId: 'a',
    sideAName: 'Alpha',
    sideAOwnerName: 'Ann',
    sideBArmyId: 'army-b',
    sideBSettlementId: 'b',
    sideBName: 'Beta',
    sideBOwnerName: 'Ben',
    winner: 'sidea',
    sideAPower: 10,
    sideAVolleyPower: 0,
    sideBVolleyPower: 0,
    sideBPower: 5,
    sideAWasDefending: false,
    sideBWasDefending: false,
    seed: 1,
    lootTaken: { wood: 0, stone: 0, food: 0, iron: 0 },
    lines: [],
    viewerSide: 'sidea',
    read: false,
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
    viewerSide: 'poster',
    read: false,
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

  it('an item is unread until the server says read or it was opened here', () => {
    expect(items.every((item) => isInboxItemUnread(item, {}))).toBe(true);
    expect(inboxUnreadCount(items, {})).toBe(2);
    expect(inboxUnreadCount(items, { [inboxKey(items[0]!)]: true })).toBe(1);
    const serverRead = mergeInbox([{ ...battle('b1', '2026-08-29T09:00:00.000Z'), read: true }], []);
    expect(isInboxItemUnread(serverRead[0]!, {})).toBe(false);
  });

  it('keys an item by kind and id, so equal ids of two kinds do not collide', () => {
    expect(inboxKey(items[0]!)).toBe('trade:t1');
    expect(inboxKey(items[1]!)).toBe('battle:b1');
  });

  it('counts unread per kind', () => {
    expect(inboxUnreadByKind(items, {})).toEqual({ battle: 1, field: 0, camp: 0, army: 0, trade: 1 });
    expect(inboxUnreadByKind(items, { 'trade:t1': true })).toEqual({ battle: 1, field: 0, camp: 0, army: 0, trade: 0 });
  });
});

describe('inboxTone', () => {
  it('reads a battle from the viewer side', () => {
    const [won] = mergeInbox([battle('b1', '2026-01-01T00:00:00Z')], []);
    expect(inboxTone(won!)).toBe('win');
    const [lost] = mergeInbox([{ ...battle('b2', '2026-01-01T00:00:00Z'), viewerSide: 'defender' }], []);
    expect(inboxTone(lost!)).toBe('loss');
  });

  it('a field battle can be a tie', () => {
    const [tie] = mergeInbox([], [], [{ ...field('f1', '2026-01-01T00:00:00Z'), winner: 'tie' }]);
    expect(inboxTone(tie!)).toBe('tie');
    const [won] = mergeInbox([], [], [field('f2', '2026-01-01T00:00:00Z')]);
    expect(inboxTone(won!)).toBe('win');
  });

  it('a trade is its own tone', () => {
    const [t] = mergeInbox([], [trade('t1', '2026-01-01T00:00:00Z')]);
    expect(inboxTone(t!)).toBe('trade');
  });
});

describe('inboxLocation', () => {
  it('uses the siege target of a battle, none when it has no siege, and none for a trade', () => {
    const siege = { targetCoord: { q: 4, r: -2 }, targetType: 'storehouse', levelBefore: 1, levelAfter: 0, settlementRazed: false };
    const [withSiege] = mergeInbox([{ ...battle('b1', '2026-01-01T00:00:00Z'), siege }], []);
    expect(inboxLocation(withSiege!)).toEqual({ q: 4, r: -2 });
    const [fire] = mergeInbox([{ ...battle('b2', '2026-01-01T00:00:00Z'), fireSiege: siege }], []);
    expect(inboxLocation(fire!)).toEqual({ q: 4, r: -2 });
    const [plain] = mergeInbox([battle('b3', '2026-01-01T00:00:00Z')], []);
    expect(inboxLocation(plain!)).toBeNull();
    const [t] = mergeInbox([], [trade('t1', '2026-01-01T00:00:00Z')]);
    expect(inboxLocation(t!)).toBeNull();
  });

  it('uses the hex of a field battle', () => {
    const [f] = mergeInbox([], [], [{ ...field('f1', '2026-01-01T00:00:00Z'), hex: { q: 3, r: 5 } }]);
    expect(inboxLocation(f!)).toEqual({ q: 3, r: 5 });
  });
});

describe('inbox camp reports', () => {
  const camp = (id: string, occurredAt: string): CampReportResponse => ({
    id,
    kind: 'hunt',
    occurredAt,
    camp: { q: 1, r: 2, family: 'wolfden', effectiveLevel: 1 },
    settlementId: 's',
    armyId: 'a',
    winner: 'army',
    armyPower: 300,
    campPower: 195,
    armyVolleyPower: 0,
    units: [],
    beasts: [],
    loot: { wood: 0, stone: 0, food: 0, iron: 0 },
    campCleared: true,
    tower: null,
    towerBurned: false,
    read: false,
  });

  it('merges camp reports newest-first with the other kinds and filters them under "camp"', () => {
    const items = mergeInbox([battle('b1', '2026-01-01T00:00:00Z')], [], [], [camp('c1', '2026-01-03T00:00:00Z'), camp('c2', '2026-01-02T00:00:00Z')]);
    expect(items.map((i) => i.report.id)).toEqual(['c1', 'c2', 'b1']);
    expect(filterInbox(items, 'camp').map((i) => i.kind)).toEqual(['camp', 'camp']);
    expect(filterInbox(items, 'battle').map((i) => i.kind)).toEqual(['battle']);
  });

  it('counts camp reports as unread like the other kinds', () => {
    const items = mergeInbox([], [], [], [camp('c1', '2026-01-03T00:00:00Z'), camp('c2', '2026-01-01T00:00:00Z')]);
    expect(inboxUnreadCount(items, {})).toBe(2);
    expect(inboxUnreadCount(items, { 'camp:c1': true })).toBe(1);
  });
});

describe('inbox army reports', () => {
  const army = (id: string, occurredAt: string): ArmyReportResponse => ({
    id,
    kind: 'starved',
    occurredAt,
    armyId: 'army-1',
    hex: { q: 1, r: 2 },
    mission: 'move',
    units: [{ type: 'axeman', count: 3 }],
    read: false,
  });

  it('merges army reports newest-first with the other kinds and filters them under "army"', () => {
    const items = mergeInbox(
      [battle('b1', '2026-01-01T00:00:00Z')], [], [], [],
      [army('a1', '2026-01-03T00:00:00Z'), army('a2', '2026-01-02T00:00:00Z')],
    );
    expect(items.map((i) => i.report.id)).toEqual(['a1', 'a2', 'b1']);
    expect(filterInbox(items, 'army').map((i) => i.kind)).toEqual(['army', 'army']);
    expect(filterInbox(items, 'battle').map((i) => i.kind)).toEqual(['battle']);
  });

  it('counts army reports as unread like the other kinds', () => {
    const items = mergeInbox([], [], [], [], [army('a1', '2026-01-03T00:00:00Z'), army('a2', '2026-01-01T00:00:00Z')]);
    expect(inboxUnreadCount(items, { 'army:a1': true })).toBe(1);
  });
});
