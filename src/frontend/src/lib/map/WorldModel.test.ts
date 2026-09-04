// Regression coverage for border-anchoring buildings (docs/design decision:
// "Border radius grows with longhouse level and with border-anchoring
// buildings (watchtower)"): a settlement's owned-tile silhouette should stop
// being a pure hex-radius disc once a tower claims ground around itself near
// the edge — this also exercises the border-rendering code path
// (HexMapRenderer's outerEdgesOf) against a non-convex shape, not just the
// perfect hexagon every other settlement in the demo produces.
import { describe, expect, it } from 'vitest';
import { hexDistance, hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';
import { WorldModel } from './WorldModel';
import type { RiverTile } from './types';

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
      capacity: settlement.resources,
      buildings: [
        { q: lumberjackCoord.q, r: lumberjackCoord.r, type: 'lumberjack', level: 1 },
        { q: quarryCoord.q, r: quarryCoord.r, type: 'quarry', level: 1 },
      ],
    });

    expect(model.getTile(lumberjackCoord.q, lumberjackCoord.r).buildingType).toBe('lumberjack');
    expect(model.getTile(quarryCoord.q, quarryCoord.r).buildingType).toBe('quarry');
  });

  it('places a barracks, fisher hut and sawmill from a snapshot', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const coords = neighbors(at).slice(0, 3);

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: settlement.resources,
      buildings: [
        { q: coords[0].q, r: coords[0].r, type: 'barracks', level: 1 },
        { q: coords[1].q, r: coords[1].r, type: 'fisherhut', level: 1 },
        { q: coords[2].q, r: coords[2].r, type: 'sawmill', level: 1 },
      ],
    });

    expect(model.getTile(coords[0].q, coords[0].r).buildingType).toBe('barracks');
    expect(model.getTile(coords[1].q, coords[1].r).buildingType).toBe('fisherhut');
    expect(model.getTile(coords[2].q, coords[2].r).buildingType).toBe('sawmill');
  });
});

// Issue #97: the backend now stakes a level-0 foundation for a brand-new
// building the instant it's queued (Settlement.Enqueue), rather than the
// frontend having to derive "under construction" from the separate build
// queue — so a snapshot's `buildings` array is the single source of truth
// for what should render on a hex, completed or not.
describe('WorldModel applyServerSnapshot renders under-construction buildings', () => {
  it('shows a queued buildings level-0 foundation, then its completed level, then clears it once cancelled/gone', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const coord = { q: at.q + 1, r: at.r };

    const snapshot = (buildings: { q: number; r: number; type: string; level: number }[]) => ({
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: settlement.resources,
      buildings,
    });

    model.applyServerSnapshot(settlement.id, snapshot([{ q: coord.q, r: coord.r, type: 'farm', level: 0 }]));
    let tile = model.getTile(coord.q, coord.r);
    expect(tile.buildingType).toBe('farm');
    expect(tile.buildingLevel).toBe(0);

    model.applyServerSnapshot(settlement.id, snapshot([{ q: coord.q, r: coord.r, type: 'farm', level: 1 }]));
    tile = model.getTile(coord.q, coord.r);
    expect(tile.buildingType).toBe('farm');
    expect(tile.buildingLevel).toBe(1);

    model.applyServerSnapshot(settlement.id, snapshot([]));
    tile = model.getTile(coord.q, coord.r);
    expect(tile.buildingType).toBeUndefined();
    expect(tile.buildingLevel).toBeUndefined();
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

// A minimal RiverTile, filling in only the shape this test cares about —
// setRiverTiles/sawmillArtVariantOf never look at inDirections/outDirection.
function riverTile(at: AxialCoord, shape: RiverTile['shape']): RiverTile {
  return { q: at.q, r: at.r, shape, inDirections: [], outDirection: null };
}

describe('WorldModel.sawmillArtVariantOf', () => {
  it('is the flat family when no neighbour has a river', () => {
    const model = new WorldModel(20260825);
    expect(model.sawmillArtVariantOf({ q: 0, r: 0 })).toBe('sawmill');
  });

  it('is the riverside family when a neighbour has a straight river', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    model.setRiverTiles([riverTile(neighbors(at)[0], 'straight')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmillriver');
  });

  it('is the bend family when a neighbour has a river bend, even alongside a straight one', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    const around = neighbors(at);
    model.setRiverTiles([riverTile(around[0], 'straight'), riverTile(around[1], 'bend')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmillbend');
  });

  it('ignores a river tile on its own hex — a building tile is never itself a river tile', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    model.setRiverTiles([riverTile(at, 'bend')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmill');
  });
});

describe('WorldModel.seaFacingDirectionOf', () => {
  it('finds the real sea neighbour reported disconnected in-game: seed 783131215, island Jarlskar, mouth tile (-8,4)', () => {
    // Confirmed against the backend's own TerrainSampler for this seed: of
    // (-8,4)'s six neighbours, only SE (-8,5) is sea — E/NE/NW are sand and
    // W/SW are forest. Before this fix, the mouth tile rendered a straight
    // line toward W/SW (the inflow's geometric opposite) instead of curving
    // toward the sea at SE.
    const model = new WorldModel(783131215);
    expect(model.seaFacingDirectionOf({ q: -8, r: 4 })).toBe('SE');
  });

  it('returns null when no neighbour is sea', () => {
    // Same seed/island as above, but (-4,2) — Jarlskar's interior, well
    // inland — confirmed against the backend's TerrainSampler to have all
    // six neighbours as land (grass/forest).
    const model = new WorldModel(783131215);
    expect(model.seaFacingDirectionOf({ q: -4, r: 2 })).toBeNull();
  });
});
