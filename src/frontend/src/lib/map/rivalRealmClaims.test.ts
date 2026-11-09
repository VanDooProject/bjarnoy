// A rival's realm as the client draws it (docs/design/map-fog-v2.md section 1g): its Longhouse disc plus the full disc of every
// tower the server delivered, with no chain check; where two rivals' discs overlap the oldest settlement (smallest UUIDv7 id)
// wins; and a hex outside every claim disc of its realm (a stray building, a wall outside the realm) has no border at all.
import { describe, expect, it } from 'vitest';
import { hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import { WorldModel } from './WorldModel';
import type { Settlement } from './types';

// UUIDv7 ids sort by creation time: OLDER < NEWER.
const OLDER = '01900000-0000-7000-8000-000000000001';
const NEWER = '01980000-0000-7000-8000-000000000002';

function rival(id: string, at: AxialCoord, level = 1): Settlement {
  return {
    id,
    ownerId: id,
    ownerName: `Owner ${id.slice(-1)}`,
    name: `Realm ${id.slice(-1)}`,
    q: at.q,
    r: at.r,
    level,
    resources: { wood: 0, stone: 0, food: 0, iron: 0 },
    rates: { wood: 0, stone: 0, food: 0, iron: 0 },
    foundedAt: 0,
    islandId: 'island-1',
  };
}

const building = (settlementId: string, q: number, r: number, type: string, level = 1, outsideRealm?: boolean) => ({
  q, r, type, level, settlementId, ownerUserId: `user-${settlementId.slice(-1)}` as string | null, outsideRealm,
});

function modelWith(...settlements: Settlement[]): WorldModel {
  const model = new WorldModel(20260825);
  for (const s of settlements) model.registerSettlement(s);
  return model;
}

describe('a rival\'s claim', () => {
  it('is its Longhouse disc plus the full disc of every delivered tower, with no chain check', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }));
    // A level 2 tower 6 hexes from the Longhouse (radius 2): well outside its disc, so a chain rule would cut it off.
    model.applyRivalBuildings([building(OLDER, 6, 0, 'tower', 2)]);
    model.claimAllTerritory();

    const discs = model.claimDiscsOf(OLDER);
    expect(discs).toEqual([
      { q: 0, r: 0, radius: 2 },
      { q: 6, r: 0, radius: 2 },
    ]);
    for (const c of hexesInRadius({ q: 6, r: 0 }, 2)) expect(model.realmBorderOwnerAt(c.q, c.r)).toBe(OLDER);
    for (const c of hexesInRadius({ q: 0, r: 0 }, 2)) expect(model.realmBorderOwnerAt(c.q, c.r)).toBe(OLDER);
    expect(model.realmBorderOwnerAt(3, 0)).toBeUndefined();
  });

  it('takes its radii from the catalogue helpers: the tower disc grows with the tower level, the Longhouse disc with its level', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }, 2));
    model.applyRivalBuildings([building(OLDER, 8, 0, 'tower', 3), building(OLDER, -8, 0, 'tower', 1)]);
    model.claimAllTerritory();

    expect(model.claimDiscsOf(OLDER)).toEqual([
      { q: 0, r: 0, radius: 3 },
      { q: 8, r: 0, radius: 3 },
      { q: -8, r: 0, radius: 1 },
    ]);
  });

  it('forgets a tower the server no longer delivers', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }));
    model.applyRivalBuildings([building(OLDER, 6, 0, 'tower', 2)]);
    model.claimAllTerritory();
    model.applyRivalBuildings([]);
    model.claimAllTerritory();

    expect(model.claimDiscsOf(OLDER)).toEqual([{ q: 0, r: 0, radius: 2 }]);
    expect(model.realmBorderOwnerAt(6, 0)).toBeUndefined();
  });

  it('does not count a level 0 foundation or any other building type as a tower', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }));
    model.applyRivalBuildings([building(OLDER, 6, 0, 'tower', 0), building(OLDER, 7, 0, 'palisade', 3)]);
    model.claimAllTerritory();

    expect(model.claimDiscsOf(OLDER)).toEqual([{ q: 0, r: 0, radius: 2 }]);
  });

  it('gives the oldest settlement a hex two rivals\' discs both cover, whatever the order they were registered or claimed in', () => {
    const model = modelWith(rival(NEWER, { q: 0, r: 0 }), rival(OLDER, { q: 3, r: 0 }));
    model.claimAllTerritory();

    const shared = hexesInRadius({ q: 0, r: 0 }, 2).filter((c) => hexDistance(c, { q: 3, r: 0 }) <= 2);
    expect(shared.length).toBeGreaterThan(0);
    for (const c of shared) expect(model.realmBorderOwnerAt(c.q, c.r)).toBe(OLDER);
    // Hexes only the newer one covers stay its own.
    expect(model.realmBorderOwnerAt(-2, 0)).toBe(NEWER);
  });

  it('keeps one owner per hex when a delivered tower of the newer rival reaches into the older one\'s disc', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }), rival(NEWER, { q: 12, r: 0 }));
    model.applyRivalBuildings([building(NEWER, 4, 0, 'tower', 2)]);
    model.claimAllTerritory();

    expect(model.realmBorderOwnerAt(2, 0)).toBe(OLDER);
    expect(model.realmBorderOwnerAt(5, 0)).toBe(NEWER);
  });

  it('gives a building that lies outside every claim disc of its realm no border, while the building itself stays', () => {
    const model = modelWith(rival(OLDER, { q: 0, r: 0 }));
    model.applyRivalBuildings([building(OLDER, 9, 0, 'palisade', 1, true), building(OLDER, 1, 0, 'farm')]);
    model.claimAllTerritory();

    expect(model.getTile(9, 0)).toMatchObject({ buildingType: 'palisade', ownerId: OLDER });
    expect(model.realmBorderOwnerAt(9, 0)).toBeUndefined();
    expect(model.realmBorderOwnerAt(1, 0)).toBe(OLDER);
  });
});
