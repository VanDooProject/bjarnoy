import { describe, expect, it } from 'vitest';
import { resolveRealm, type RealmSettlementInput } from './realmChain';

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
});
