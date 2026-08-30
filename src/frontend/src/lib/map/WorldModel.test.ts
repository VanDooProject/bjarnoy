// Regression coverage for border-anchoring buildings (docs/design decision:
// "Border radius grows with longhouse level and with border-anchoring
// buildings (watchtower)"): a settlement's owned-tile silhouette should stop
// being a pure hex-radius disc once a tower claims ground around itself near
// the edge — this also exercises the border-rendering code path
// (HexMapRenderer's outerEdgesOf) against a non-convex shape, not just the
// perfect hexagon every other settlement in the demo produces.
import { describe, expect, it } from 'vitest';
import { hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import { WorldModel } from './WorldModel';

function foundLandedSettlement(model: WorldModel) {
  const at = model.findLandfall({ q: 0, r: 0 });
  if (!at) throw new Error('no land found near origin for this seed — pick a different test seed');
  return { settlement: model.foundSettlement('p1', 'Tester', 'Testerhold', at), at };
}

// Any land hex at exactly the settlement's border radius — the only place a
// tower can be placed (placeBuilding rejects anything past the border) that
// can still push new ground beyond that radius.
function findLandBorderEdge(model: WorldModel, settlementCenter: AxialCoord, radius: number): AxialCoord {
  for (const c of hexesInRadius(settlementCenter, radius)) {
    if (hexDistance(settlementCenter, c) === radius && model.isLand(c.q, c.r)) return c;
  }
  throw new Error('no land border-edge hex found — pick a different test seed');
}

describe('WorldModel border-anchoring (watchtower)', () => {
  it('placing a tower claims a ring beyond the settlement itself, breaking the pure-hex border', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const edge = findLandBorderEdge(model, at, radius);

    const placed = model.placeBuilding(settlement.id, edge, 'tower');
    expect(placed).toBe(true);

    const beyond = hexesInRadius(edge, 1).filter((c) => hexDistance(at, c) === radius + 1);
    expect(beyond.length).toBeGreaterThan(0);
    const nowOwned = beyond.filter((c) => model.getTile(c.q, c.r).ownerId === settlement.id);
    expect(nowOwned.length).toBeGreaterThan(0);

    // The silhouette is no longer a pure hex-radius disc: some hexes at
    // radius+1 (in the tower's direction) are owned, others at the same
    // radius+1 (elsewhere around the settlement) are not.
    const untouchedFarSide = hexesInRadius(at, radius + 1).filter(
      (c) => hexDistance(at, c) === radius + 1 && !beyond.some((b) => b.q === c.q && b.r === c.r),
    );
    expect(untouchedFarSide.some((c) => model.getTile(c.q, c.r).ownerId !== settlement.id)).toBe(true);
  });

  it('refuses to place a tower outside the existing border, so it can only bump the shape outward, never teleport it', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const outside = findLandBorderEdge(model, at, radius + 3);

    expect(model.placeBuilding(settlement.id, outside, 'tower')).toBe(false);
    expect(model.getTile(outside.q, outside.r).ownerId).toBeUndefined();
  });
});

describe('WorldModel applyServerSnapshot renders every backend building type', () => {
  it('places a lumberjack and a quarry from a snapshot, not just the pre-existing types', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const lumberjackCoord = { q: at.q + 1, r: at.r };
    const quarryCoord = { q: at.q, r: at.r + 1 };

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [
        { q: lumberjackCoord.q, r: lumberjackCoord.r, type: 'lumberjack', level: 1 },
        { q: quarryCoord.q, r: quarryCoord.r, type: 'quarry', level: 1 },
      ],
    });

    expect(model.getTile(lumberjackCoord.q, lumberjackCoord.r).buildingType).toBe('lumberjack');
    expect(model.getTile(quarryCoord.q, quarryCoord.r).buildingType).toBe('quarry');
  });
});

describe('WorldModel applyServerSnapshot renders queued (under-construction) orders — issue #91', () => {
  it('renders a queued new building at level 0, then promotes it once completed, then clears it if cancelled', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const farmCoord = { q: at.q + 1, r: at.r };

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [],
      queue: [{ q: farmCoord.q, r: farmCoord.r, building: 'farm', targetLevel: 1 }],
    });
    let tile = model.getTile(farmCoord.q, farmCoord.r);
    expect(tile.buildingType).toBe('farm');
    expect(tile.buildingLevel).toBe(0);
    expect(tile.underConstruction).toBe(true);

    // Completed: the buildings loop should overwrite level 0 -> 1 and clear the flag.
    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [{ q: farmCoord.q, r: farmCoord.r, type: 'farm', level: 1 }],
      queue: [],
    });
    tile = model.getTile(farmCoord.q, farmCoord.r);
    expect(tile.buildingType).toBe('farm');
    expect(tile.buildingLevel).toBe(1);
    expect(tile.underConstruction).toBe(false);
  });

  it('clears a phantom under-construction tile if its order is cancelled before completing', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const farmCoord = { q: at.q + 1, r: at.r };

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [],
      queue: [{ q: farmCoord.q, r: farmCoord.r, building: 'farm', targetLevel: 1 }],
    });
    expect(model.getTile(farmCoord.q, farmCoord.r).buildingType).toBe('farm');

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [],
      queue: [],
    });
    const tile = model.getTile(farmCoord.q, farmCoord.r);
    expect(tile.buildingType).toBeUndefined();
    expect(tile.buildingLevel).toBeUndefined();
    expect(tile.underConstruction).toBeFalsy();
  });

  it('leaves an in-progress upgrade tile alone rather than downgrading it to level 0', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const farmCoord = { q: at.q + 1, r: at.r };

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      buildings: [{ q: farmCoord.q, r: farmCoord.r, type: 'farm', level: 2 }],
      queue: [{ q: farmCoord.q, r: farmCoord.r, building: 'farm', targetLevel: 3 }],
    });
    const tile = model.getTile(farmCoord.q, farmCoord.r);
    expect(tile.buildingLevel).toBe(2);
  });
});

describe('WorldModel storageCapFor — issue #91', () => {
  it('uses the settlement capacity from the backend snapshot rather than a client-derived guess, once one is known', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: { wood: 750, stone: 750, food: 750, iron: 750 },
      buildings: [],
    });

    expect(model.storageCapFor(settlement.id)).toEqual({ wood: 750, stone: 750, food: 750, iron: 750 });
  });
});

describe('WorldModel longhouse placement', () => {
  it('refuses to place a longhouse on an otherwise-buildable owned hex — founding is the only source of one', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const edge = findLandBorderEdge(model, at, radius);

    expect(model.placeBuilding(settlement.id, edge, 'longhouse')).toBe(false);
    expect(model.getTile(edge.q, edge.r).buildingType).toBeUndefined();
  });
});
