import { describe, expect, it } from 'vitest';
import { realmFromDiscs, resolveRealm, type RealmSettlementInput } from './realmChain';

// Longhouse level 2 claims radius 3; a level-2 tower claims radius 2 (mirrors ConnectedRealmTests.cs).
const settlement = (id: string, q: number, towerQs: number[] = [], towerLevel = 2): RealmSettlementInput => ({
  id,
  q,
  r: 0,
  level: 2,
  towers: towerQs.map((tq) => ({ q: tq, r: 0, level: towerLevel })),
});
const at = (q: number) => ({ q, r: 0 });

describe('resolveRealm (the chain rule)', () => {
  it('keeps a straight chain from the longhouse connected', () => {
    const realm = resolveRealm([settlement('a', 0, [3, 5, 7])]);
    for (const q of [3, 5, 7]) expect(realm.isTowerConnected('a', at(q))).toBe(true);
    expect(realm.covers(at(9))).toBe(true);
    expect(realm.covers(at(10))).toBe(false);
  });

  it('drops the far side of a chain broken in the middle', () => {
    const realm = resolveRealm([settlement('a', 0, [3, 7])]);
    expect(realm.isTowerConnected('a', at(3))).toBe(true);
    expect(realm.isTowerConnected('a', at(7))).toBe(false);
    expect(realm.covers(at(7))).toBe(false);
    expect(realm.covers(at(9))).toBe(false);
    expect(realm.covers(at(5))).toBe(true);
  });

  it('keeps a chain reached by a second longhouse on the far side', () => {
    const realm = resolveRealm([settlement('a', 0, [3]), settlement('b', 10, [7])]);
    expect(realm.isTowerConnected('b', at(7))).toBe(true);
    expect(realm.covers(at(5))).toBe(true);
    expect(realm.covers(at(9))).toBe(true);
  });

  it('connects a tower standing on another own settlement\'s ground through it', () => {
    const realm = resolveRealm([settlement('a', 0), settlement('b', 20, [2])]);
    expect(realm.isTowerConnected('b', at(2))).toBe(true);
    expect(realm.discsOf('b')).toContainEqual({ q: 2, r: 0, radius: 2 });
    expect(realm.discsOf('a')).not.toContainEqual({ q: 2, r: 0, radius: 2 });
  });

  it('reconnects the far tower once the middle one is rebuilt', () => {
    expect(resolveRealm([settlement('a', 0, [3, 7])]).isTowerConnected('a', at(7))).toBe(false);
    expect(resolveRealm([settlement('a', 0, [3, 5, 7])]).isTowerConnected('a', at(7))).toBe(true);
  });

  it('never lets a level-0 stub connect anything', () => {
    const realm = resolveRealm([
      { id: 'a', q: 0, r: 0, level: 2, towers: [{ q: 3, r: 0, level: 0 }, { q: 6, r: 0, level: 2 }] },
    ]);
    expect(realm.isTowerConnected('a', at(3))).toBe(false);
    expect(realm.isTowerConnected('a', at(6))).toBe(false);
  });

  it('does not connect towers through another player\'s longhouse (separate resolves)', () => {
    const mine = resolveRealm([settlement('a', 0, [8])]);
    const theirs = resolveRealm([settlement('b', 8)]);
    expect(mine.isTowerConnected('a', at(8))).toBe(false);
    expect(theirs.covers(at(8))).toBe(true);
    expect(mine.covers(at(8))).toBe(false);
  });

  it('counts only connected tower hexes against the limit', () => {
    const realm = resolveRealm([settlement('a', 0, [3, 7])]);
    expect(realm.countConnected([at(3), at(7), at(3)])).toBe(1);
  });

  describe('a settlement whose Longhouse is destroyed (level 0)', () => {
    const razed = (id: string, q: number, towerQs: number[] = []): RealmSettlementInput => ({ ...settlement(id, q, towerQs), level: 0 });

    it('contributes no disc, not even its centre hex', () => {
      const realm = resolveRealm([razed('a', 0)]);
      expect(realm.discsOf('a')).toEqual([]);
      expect(realm.allDiscs).toEqual([]);
      expect(realm.covers(at(0))).toBe(false);
    });

    it('keeps its tower connected when another own Longhouse claims the tower\'s hex', () => {
      const realm = resolveRealm([razed('a', 0, [8]), settlement('b', 10)]);
      expect(realm.isTowerConnected('a', at(8))).toBe(true);
      expect(realm.discsOf('a')).toEqual([{ q: 8, r: 0, radius: 2 }]);
      expect(realm.covers(at(0))).toBe(false);
    });

    it('cuts off its tower when only its own gone Longhouse reached it', () => {
      const realm = resolveRealm([razed('a', 0, [2, 4])]);
      expect(realm.isTowerConnected('a', at(2))).toBe(false);
      expect(realm.isTowerConnected('a', at(4))).toBe(false);
      expect(realm.allDiscs).toEqual([]);
    });

    it('is still reached by a chain of another settlement\'s connected towers', () => {
      const realm = resolveRealm([razed('a', 0, [6]), settlement('b', 10, [8])]);
      expect(realm.isTowerConnected('a', at(6))).toBe(true);
      expect(realm.covers(at(4))).toBe(true);
      expect(realm.covers(at(0))).toBe(false);
    });
  });
});

describe('realmFromDiscs (the realm the server resolved)', () => {
  const realm = realmFromDiscs([
    { settlementId: 'a', discs: [{ q: 0, r: 0, radius: 3 }, { q: 5, r: 0, radius: 2 }] },
    { settlementId: 'b', discs: [{ q: 20, r: 0, radius: 3 }] },
  ]);

  it('hands each member its own discs, longhouse disc first', () => {
    expect(realm.discsOf('a')).toEqual([{ q: 0, r: 0, radius: 3 }, { q: 5, r: 0, radius: 2 }]);
    expect(realm.discsOf('b')).toEqual([{ q: 20, r: 0, radius: 3 }]);
    expect(realm.discsOf('unknown')).toEqual([]);
    expect(realm.allDiscs).toHaveLength(3);
  });

  it('connects a tower only for a disc of that member centred on it', () => {
    expect(realm.isTowerConnected('a', at(5))).toBe(true);
    expect(realm.isTowerConnected('b', at(5))).toBe(false); // another member's tower disc
    expect(realm.isTowerConnected('a', at(6))).toBe(false);
  });

  it('covers and counts hexes inside any disc of any member', () => {
    expect(realm.covers(at(7))).toBe(true);
    expect(realm.covers(at(8))).toBe(false);
    expect(realm.covers(at(22))).toBe(true);
    expect(realm.countConnected([at(5), at(5), at(7), at(12)])).toBe(2);
  });
});

describe('realmFromDiscs with a destroyed Longhouse', () => {
  it('reads a tower disc that comes first as connected (there is no longhouse disc to skip)', () => {
    const realm = realmFromDiscs([{ settlementId: 'a', discs: [{ q: 8, r: 0, radius: 2 }] }]);
    expect(realm.isTowerConnected('a', at(8))).toBe(true);
    expect(realm.covers(at(0))).toBe(false);
  });
});
