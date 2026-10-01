import { describe, expect, it } from 'vitest';
import { buildingAllowedOnHex, isBogBoundBuilding, isLakeShoreHut, isWaterOnlyBuilding, tileIsBuildable, cropAllowedHere, formatBuildTime, formatMissingResources, longhouseLock, riverBuildingAllowedHere, shrineLimitLock, storageHouseLock, towerLimitLock } from './ringCatalogue';

describe('formatBuildTime', () => {
  it('renders the level-1 catalogue durations the way the design card shows them', () => {
    // BuildingCatalogue.cs: Producer 4 min, Tower 8 min, Longhouse 10, Shrine 12.
    expect(formatBuildTime(240)).toBe('4:00');
    expect(formatBuildTime(480)).toBe('8:00');
    expect(formatBuildTime(600)).toBe('10:00');
    expect(formatBuildTime(720)).toBe('12:00');
  });

  it('grows an hours field rather than showing 90 minutes', () => {
    // Duration(base, level) = base * 1.5^(level-1), so upgrades pass an hour
    // quickly — a shrine is already 1:31:00 at level 4.
    expect(formatBuildTime(3600)).toBe('1:00:00');
    expect(formatBuildTime(5460)).toBe('1:31:00');
  });

  it('pads seconds and floors a negative to zero', () => {
    expect(formatBuildTime(65)).toBe('1:05');
    expect(formatBuildTime(-10)).toBe('0:00');
  });
});

describe('longhouseLock', () => {
  it('locks a building the settlement has not levelled up to yet', () => {
    // The watchtower is RequiredLonghouseLevel 2 at level 1.
    expect(longhouseLock(2, 1)).toBe('Requires longhouse 2');
    expect(longhouseLock(3, 1)).toBe('Requires longhouse 3');
  });

  it('does not lock a building the settlement already qualifies for', () => {
    expect(longhouseLock(1, 1)).toBeUndefined();
    expect(longhouseLock(2, 3)).toBeUndefined();
  });

  it('does not lock a type with no catalogue entry at all', () => {
    // "hut" is demo-only and has no backend definition, so there is no gate to
    // report — it must not read as locked.
    expect(longhouseLock(undefined, 1)).toBeUndefined();
  });
});

describe('storageHouseLock', () => {
  it('states the requirement: 1 at L10, 2 at L15, 3 at L20, 4 at L25', () => {
    expect(storageHouseLock(1, [1])).toBe('Needs 1 Storehouse at level 10');
    expect(storageHouseLock(2, [15, 14])).toBe('Needs 2 Storehouses at level 15');
    expect(storageHouseLock(3, [20, 20, 19])).toBe('Needs 3 Storehouses at level 20');
    expect(storageHouseLock(4, [25, 25, 25, 24])).toBe('Needs 4 Storehouses at level 25');
    expect(storageHouseLock(7, [25, 25, 25, 24, 1, 1, 1])).toBe('Needs 4 Storehouses at level 25');
  });

  it('never locks the first storage house, nor once the requirement is met', () => {
    expect(storageHouseLock(0, [])).toBeUndefined();
    expect(storageHouseLock(1, [10])).toBeUndefined();
    expect(storageHouseLock(2, [15, 15])).toBeUndefined();
    expect(storageHouseLock(3, [25, 20, 20])).toBeUndefined();
    expect(storageHouseLock(5, [25, 25, 25, 25, 1])).toBeUndefined();
  });

  it('counts a queued (not yet standing) house as held but not as meeting the level', () => {
    // two held (one standing L10, one queued): the third needs two at L15
    expect(storageHouseLock(2, [10])).toBe('Needs 2 Storehouses at level 15');
  });
});

describe('towerLimitLock', () => {
  it('explains the limit once the settlement holds as many towers as its longhouse level allows', () => {
    expect(towerLimitLock(1, 3)).toBe('Tower limit reached (1/1) — level up the longhouse for more');
    expect(towerLimitLock(2, 8)).toBe('Tower limit reached (2/2) — level up the longhouse for more');
  });

  it('stays open while there is room', () => {
    expect(towerLimitLock(0, 3)).toBeUndefined();
    expect(towerLimitLock(1, 7)).toBeUndefined();
  });

  it('leaves the "longhouse too low" case to longhouseLock', () => {
    expect(towerLimitLock(0, 2)).toBeUndefined();
  });
});

describe('riverBuildingAllowedHere on streams', () => {
  it('only offers the river buildings on river-width tiles, never on a stream or widening hex', () => {
    expect(riverBuildingAllowedHere('sawmill', 'straight', 'plain', 'river')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'straight', 'plain')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'straight', 'plain', 'stream')).toBe(false);
    expect(riverBuildingAllowedHere('cropmill', 'straight', 'plain', 'widen')).toBe(false);
    // Buildings with no river requirement are unaffected by the hex's width.
    expect(riverBuildingAllowedHere('farm', undefined, 'plain', undefined)).toBe(true);
  });
});

describe('riverBuildingAllowedHere', () => {
  it('excludes a sawmill from a hex with no river tile at all', () => {
    expect(riverBuildingAllowedHere('sawmill', undefined)).toBe(false);
  });

  it('allows a sawmill on a straight, bend, or tight (bend60) river hex', () => {
    expect(riverBuildingAllowedHere('sawmill', 'straight')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'bend')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'bend60')).toBe(true);
  });

  it('excludes a sawmill from a non-matching river shape', () => {
    expect(riverBuildingAllowedHere('sawmill', 'confluence')).toBe(false);
  });

  it('allows a sawmill on a straight/bend meander or island variant', () => {
    expect(riverBuildingAllowedHere('sawmill', 'straight', 'meander')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'straight', 'island')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'bend', 'meander')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'bend', 'island')).toBe(true);
  });

  it('allows a sawmill on a plain bend60 hex but excludes the loop variant', () => {
    expect(riverBuildingAllowedHere('sawmill', 'bend60', 'plain')).toBe(true);
    expect(riverBuildingAllowedHere('sawmill', 'bend60')).toBe(true); // default variant is 'plain'
    expect(riverBuildingAllowedHere('sawmill', 'bend60', 'loop')).toBe(false);
  });

  it('allows a crop mill on every straight river variant', () => {
    expect(riverBuildingAllowedHere('cropmill', 'straight', 'plain')).toBe(true);
    expect(riverBuildingAllowedHere('cropmill', 'straight', 'meander')).toBe(true);
    expect(riverBuildingAllowedHere('cropmill', 'straight', 'island')).toBe(true);
  });

  it('only allows a crop mill on a straight river hex, unlike the sawmill', () => {
    expect(riverBuildingAllowedHere('cropmill', 'straight')).toBe(true);
    expect(riverBuildingAllowedHere('cropmill', 'bend')).toBe(false);
    expect(riverBuildingAllowedHere('cropmill', 'bend60')).toBe(false);
    expect(riverBuildingAllowedHere('cropmill', undefined)).toBe(false);
  });

  it('is a no-op for every other buildable type', () => {
    expect(riverBuildingAllowedHere('farm', undefined)).toBe(true);
    expect(riverBuildingAllowedHere('quarry', undefined)).toBe(true);
  });
});

describe('cropAllowedHere', () => {
  it('only allows pumpkinfarm on pumpkin soil', () => {
    expect(cropAllowedHere('pumpkinfarm', 'pumpkin')).toBe(true);
    expect(cropAllowedHere('pumpkinfarm', 'wheat')).toBe(false);
  });

  it('is permissive when the soil is unresolvable (undefined)', () => {
    expect(cropAllowedHere('pumpkinfarm', undefined)).toBe(true);
  });

  it('never refuses farm, on either soil or unresolvable soil', () => {
    expect(cropAllowedHere('farm', 'wheat')).toBe(true);
    expect(cropAllowedHere('farm', 'pumpkin')).toBe(true);
    expect(cropAllowedHere('farm', undefined)).toBe(true);
  });

  it('is a no-op for every other buildable type', () => {
    expect(cropAllowedHere('quarry', 'wheat')).toBe(true);
    expect(cropAllowedHere('sawmill', 'wheat')).toBe(true);
  });
});

describe('formatMissingResources', () => {
  it('lists only the shortfall, not the full cost', () => {
    const cost = { wood: 100, stone: 50, food: 0, iron: 0 };
    const stock = { wood: 60, stone: 50, food: 200, iron: 10 };
    expect(formatMissingResources(cost, stock)).toBe('40 Wood');
  });

  it('lists every short resource, in wood/stone/food/iron order', () => {
    const cost = { wood: 100, stone: 50, food: 30, iron: 10 };
    const stock = { wood: 0, stone: 0, food: 0, iron: 0 };
    expect(formatMissingResources(cost, stock)).toBe('100 Wood, 50 Stone, 30 Food, 10 Iron');
  });

  it('is empty when the stock already covers the cost', () => {
    const cost = { wood: 10, stone: 10, food: 10, iron: 10 };
    const stock = { wood: 10, stone: 10, food: 10, iron: 10 };
    expect(formatMissingResources(cost, stock)).toBe('');
  });
});

describe('isWaterOnlyBuilding / tileIsBuildable', () => {
  it.each(['fishinghut', 'dockyard', 'shrineofnjord'])('treats %s as a coastal-water building', (type) => {
    expect(isWaterOnlyBuilding(type)).toBe(true);
    expect(tileIsBuildable({ terrain: 'sea', buildingType: type })).toBe(true);
  });

  it('does not treat land buildings or the removed fisherhut as water buildings', () => {
    expect(isWaterOnlyBuilding('farm')).toBe(false);
    expect(isWaterOnlyBuilding('fisherhut')).toBe(false);
    expect(isWaterOnlyBuilding(undefined)).toBe(false);
  });

  it('keeps empty open water and land-building-on-sea unbuildable, land always buildable', () => {
    expect(tileIsBuildable({ terrain: 'sea' })).toBe(false);
    expect(tileIsBuildable({ terrain: 'sea', buildingType: 'farm' })).toBe(false);
    expect(tileIsBuildable({ terrain: 'grass' })).toBe(true);
  });
});

describe('tileIsBuildable on a wildlife camp hex', () => {
  it('refuses a guarded camp, accepts a cleared one, never Fenrir\'s brood', () => {
    expect(tileIsBuildable({ terrain: 'grass', camp: { family: 'wolfden' } })).toBe(false);
    expect(tileIsBuildable({ terrain: 'grass', camp: { family: 'wolfden', empty: false } })).toBe(false);
    expect(tileIsBuildable({ terrain: 'grass', camp: { family: 'wolfden', empty: true } })).toBe(true);
    expect(tileIsBuildable({ terrain: 'sand', camp: { family: 'fenrirbrood', empty: true } })).toBe(false);
  });
});

describe('shrineLimitLock', () => {
  it('locks every shrine once the settlement holds one, whichever god', () => {
    expect(shrineLimitLock(1)).toBe('This settlement already has a shrine');
    expect(shrineLimitLock(2)).toBe('This settlement already has a shrine');
  });

  it('never locks the first shrine', () => {
    expect(shrineLimitLock(0)).toBeUndefined();
  });
});

// Mirrors BogBuildingTests.cs in the domain tests: where each bog building may stand (BuildingDefinition.AllowsHex).
describe('buildingAllowedOnHex', () => {
  const ALL_KINDS = ['bog', 'lake', 'inlet', 'shore', 'half', 'mouth', 'creek', 'creekspring'] as const;
  const bogHex = (kind: (typeof ALL_KINDS)[number]) => ({ terrain: kind === 'lake' ? 'lake' : 'bog', bog: { kind } });

  it.each(['claybrickworks', 'bogoreworks'])('%s stands on plain moss only', (type) => {
    expect(buildingAllowedOnHex(type, bogHex('bog'))).toBe(true);
    for (const kind of ALL_KINDS.filter((k) => k !== 'bog')) {
      expect(buildingAllowedOnHex(type, bogHex(kind)), `${type} on ${kind}`).toBe(false);
    }
    expect(buildingAllowedOnHex(type, { terrain: 'grass' })).toBe(false);
    expect(buildingAllowedOnHex(type, { terrain: 'bog' })).toBe(false); // bog kind unknown
  });

  it('the Hammer Forge stands on a creek and nothing else', () => {
    expect(buildingAllowedOnHex('hammerschmiede', bogHex('creek'))).toBe(true);
    for (const kind of ALL_KINDS.filter((k) => k !== 'creek')) {
      expect(buildingAllowedOnHex('hammerschmiede', bogHex(kind)), `on ${kind}`).toBe(false);
    }
    expect(buildingAllowedOnHex('hammerschmiede', { terrain: 'grass' })).toBe(false);
    expect(buildingAllowedOnHex('hammerschmiede', { terrain: 'sea', isCoastalWater: true })).toBe(false);
  });

  it('the Fishing Hut keeps the coast and also stands on a lake half shore, nowhere else on the bog', () => {
    expect(buildingAllowedOnHex('fishinghut', { terrain: 'sea', isCoastalWater: true })).toBe(true);
    expect(buildingAllowedOnHex('fishinghut', { terrain: 'sea', isCoastalWater: false })).toBe(false);
    expect(buildingAllowedOnHex('fishinghut', bogHex('half'))).toBe(true);
    for (const kind of ALL_KINDS.filter((k) => k !== 'half')) {
      expect(buildingAllowedOnHex('fishinghut', bogHex(kind)), `on ${kind}`).toBe(false);
    }
    // A coastal hut on land is not a thing: grass is not water (the caller filters non-coastal terrain separately).
    expect(buildingAllowedOnHex('fishinghut', { terrain: 'grass' })).toBe(false);
  });

  it('the other water buildings never stand on the bog', () => {
    for (const type of ['dockyard', 'shrineofnjord']) {
      expect(buildingAllowedOnHex(type, { terrain: 'sea', isCoastalWater: true })).toBe(true);
      for (const kind of ALL_KINDS) expect(buildingAllowedOnHex(type, bogHex(kind)), `${type} on ${kind}`).toBe(false);
    }
  });

  it('nothing at all stands on a lake, and no grass building stands on any bog hex', () => {
    for (const type of ['farm', 'tower', 'storagehouse', 'lumberjack', 'quarry', 'townsquare', 'sawmill', 'fishinghut', 'bogoreworks', 'claybrickworks']) {
      expect(buildingAllowedOnHex(type, bogHex('lake')), `${type} on a lake`).toBe(false);
    }
    for (const type of ['farm', 'tower', 'storagehouse', 'lumberjack', 'quarry', 'townsquare', 'smithy', 'barracks', 'meadery', 'longhouse']) {
      for (const kind of ALL_KINDS) expect(buildingAllowedOnHex(type, bogHex(kind)), `${type} on ${kind}`).toBe(false);
    }
  });

  it('is unchanged for the buildings on grass, forest, mountain and sand', () => {
    expect(buildingAllowedOnHex('farm', { terrain: 'grass' })).toBe(true);
    expect(buildingAllowedOnHex('lumberjack', { terrain: 'forest' })).toBe(true);
    expect(buildingAllowedOnHex('quarry', { terrain: 'mountain' })).toBe(true);
    expect(buildingAllowedOnHex('tower', { terrain: 'sand' })).toBe(true);
    expect(buildingAllowedOnHex('farm', { terrain: 'sea', isCoastalWater: true })).toBe(false);
  });

  it('names the bog-bound buildings and tells a lake hut from a coastal one', () => {
    expect(['claybrickworks', 'bogoreworks', 'hammerschmiede'].every(isBogBoundBuilding)).toBe(true);
    expect(isBogBoundBuilding('fishinghut')).toBe(false);
    expect(isLakeShoreHut({ buildingType: 'fishinghut', bog: { kind: 'half' } })).toBe(true);
    expect(isLakeShoreHut({ buildingType: 'fishinghut' })).toBe(false);
    expect(isLakeShoreHut({ buildingType: 'farm', bog: { kind: 'half' } })).toBe(false);
  });
});
