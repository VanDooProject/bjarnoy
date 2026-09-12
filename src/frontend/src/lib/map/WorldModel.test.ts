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

// Regression: findLandfall used to return the literal nearest land hex to
// the click, which for some seeds (see the demo seed, 20260824 — the case
// that surfaced this after WorldGenerationOptions.IslandMinRadius/
// IslandMaxRadius grew) can be a lone tile at an island's tip: almost every
// hex in the settlement's own realm ends up sea. findLandfall now prefers a
// hex meeting the same quality bar the backend's own FindStartPositions
// enforces (Grass, >=1 Forest and >=2 Grass neighbours, no sea within two
// hexes) over the merely-nearest land hex.
describe('WorldModel.findLandfall', () => {
  it.each([1, 7, 42, 20260824, 20260826])(
    'prefers a start-quality hex over the merely-nearest land hex (seed %i)',
    (seed) => {
      const model = new WorldModel(seed);
      const at = model.findLandfall({ q: 0, r: 0 });
      if (!at) throw new Error(`no land found near origin for seed ${seed} — pick a different test seed`);

      const tile = model.getTile(at.q, at.r);
      expect(tile.terrain).toBe('grass');

      let forest = 0;
      let grass = 0;
      for (const n of neighbors(at)) {
        const t = model.getTile(n.q, n.r).terrain;
        if (t === 'forest') forest++;
        else if (t === 'grass') grass++;
      }
      expect(forest).toBeGreaterThanOrEqual(1);
      expect(grass).toBeGreaterThanOrEqual(2);

      for (const c of hexesInRadius(at, 2)) {
        expect(model.isLand(c.q, c.r)).toBe(true);
      }
    },
  );
});

// Regression: the landing-page "empty plot" preview used to show other
// players' already-existing buildings because `registerSettlement` painted
// a settlement's home tile unconditionally. Registration and territory
// painting are now separate steps so a caller can know about a settlement
// without rendering it.
describe('WorldModel.registerSettlement / claimTerritory', () => {
  it('registerSettlement alone paints nothing; claimTerritory paints, idempotently', () => {
    const model = new WorldModel();
    const rival = model.registerSettlement({
      id: 'rival-1',
      ownerId: 'rival-1',
      ownerName: 'Astrid',
      name: "Astrid's realm",
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: 'island-1',
    });

    expect(model.countBuildings(rival.id)).toBe(0);
    expect(model.claimedHexCount(rival.id)).toBe(0);
    expect(model.getTile(0, 0).ownerId).toBeUndefined();

    model.claimTerritory(rival.id);
    const claimedAfterFirst = model.claimedHexCount(rival.id);
    expect(model.countBuildings(rival.id)).toBe(1);
    expect(claimedAfterFirst).toBeGreaterThan(0);
    expect(model.getTile(0, 0).ownerId).toBe(rival.id);

    model.claimTerritory(rival.id);
    expect(model.countBuildings(rival.id)).toBe(1);
    expect(model.claimedHexCount(rival.id)).toBe(claimedAfterFirst);
  });

  it('claimTerritoryOnIsland only paints settlements on the given island', () => {
    const model = new WorldModel();
    const home = model.registerSettlement({
      id: 'home-1',
      ownerId: 'home-1',
      ownerName: 'Ulf',
      name: "Ulf's realm",
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: 'island-home',
    });
    const away = model.registerSettlement({
      id: 'away-1',
      ownerId: 'away-1',
      ownerName: 'Bjorn',
      name: "Bjorn's realm",
      q: 40,
      r: 40,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: 'island-away',
    });

    model.claimTerritoryOnIsland('island-home');

    expect(model.countBuildings(home.id)).toBe(1);
    expect(model.countBuildings(away.id)).toBe(0);
  });
});

// Regression coverage for the guided onboarding checklist (zip 6a follow-up):
// it needs to know *which* of the two guided buildings (farm, lumberjack) is
// standing, not just a count, so either can be ticked off no matter which one
// the player placed first.
describe('WorldModel.listPlacedBuildings', () => {
  it('lists the longhouse from founding, then each placed type once, in any build order', () => {
    const model = new WorldModel(20260824);
    const { settlement, at } = foundLandedSettlement(model);
    expect(model.listPlacedBuildings(settlement.id)).toEqual(['longhouse']);

    const radius = model.borderRadius(settlement);
    const spots = hexesInRadius(at, radius).filter(
      (c) => (c.q !== at.q || c.r !== at.r) && model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    if (spots.length < 2) throw new Error('not enough empty land in claim radius — pick a different test seed');

    // Lumberjack first, farm second — the reverse of the checklist's own
    // visual order, proving the list reflects what's built, not a fixed step.
    expect(model.placeBuilding(settlement.id, spots[0], 'lumberjack')).toBe(true);
    expect(new Set(model.listPlacedBuildings(settlement.id))).toEqual(new Set(['longhouse', 'lumberjack']));

    expect(model.placeBuilding(settlement.id, spots[1], 'farm')).toBe(true);
    expect(new Set(model.listPlacedBuildings(settlement.id))).toEqual(
      new Set(['longhouse', 'lumberjack', 'farm']),
    );
  });

  it('an unknown settlement id lists nothing', () => {
    const model = new WorldModel();
    expect(model.listPlacedBuildings('does-not-exist')).toEqual([]);
  });
});

describe('WorldModel border-anchoring (watchtower)', () => {
  it('a freshly placed (level-1) tower claims one extra ring of ground — Settlement.TowerClaimRadius(1) == 1', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const edge = findLandBorderEdge(model, at, radius);

    expect(model.placeBuilding(settlement.id, edge, 'tower')).toBe(true);

    // One hex past the centre disc's own radius, in the tower's own
    // direction, is newly claimed — a level-1 tower's own satellite disc
    // now has radius 1 (one hex of reach per level, starting at level 1).
    const beyond = hexesInRadius(edge, 1).filter((c) => hexDistance(at, c) === radius + 1);
    expect(beyond.length).toBeGreaterThan(0);
    expect(beyond.some((c) => model.getTile(c.q, c.r).ownerId === settlement.id)).toBe(true);
  });

  it('refuses to place a tower outside the existing border, so it can only bump the shape outward, never teleport it', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const outside = findLandBorderEdge(model, at, radius + 3);

    expect(model.placeBuilding(settlement.id, outside, 'tower')).toBe(false);
    expect(model.getTile(outside.q, outside.r).ownerId).toBeUndefined();
  });

  // Regression: applyServerSnapshot (the live-mode poll path, not
  // placeBuilding's demo-only path) used to ignore Tower buildings
  // entirely — a settlement's realm border rendered as the longhouse's
  // centre disc alone no matter how many towers stood, even though the
  // backend's own claim (Settlement.Claims/ClaimDiscsFor) already counted
  // each Tower's satellite disc. That mismatch is what let the frontend
  // show a tile as "inside the realm" while the backend rejected building
  // there.
  it('applyServerSnapshot extends the claimed territory by a live Tower satellite disc, breaking the pure-hex border', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const towerAt = findLandBorderEdge(model, at, radius);

    // A level-4 tower's own satellite disc has radius 4 (TowerClaimRadius(4)
    // == 4), reaching well past the centre disc alone from a tower sitting
    // right on the border's own edge — checking only its inner radius-2 ring
    // below is a deliberately conservative subset of the true, larger disc.
    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: settlement.capacity ?? { wood: 0, stone: 0, food: 0, iron: 0 },
      buildings: [{ q: towerAt.q, r: towerAt.r, type: 'tower', level: 4 }],
    });

    const beyondCentreDisc = hexesInRadius(towerAt, 2).filter((c) => hexDistance(at, c) > radius);
    expect(beyondCentreDisc.length).toBeGreaterThan(0);
    const nowOwned = beyondCentreDisc.filter((c) => model.getTile(c.q, c.r).ownerId === settlement.id);
    expect(nowOwned.length).toBeGreaterThan(0);

    // The silhouette is no longer a pure hex-radius disc: some hexes past
    // the centre disc's radius (in the tower's direction) are owned, others
    // at the same distance elsewhere around the settlement are not.
    const untouchedFarSide = hexesInRadius(at, radius + 1).filter(
      (c) => hexDistance(at, c) === radius + 1 && !beyondCentreDisc.some((b) => b.q === c.q && b.r === c.r),
    );
    expect(untouchedFarSide.some((c) => model.getTile(c.q, c.r).ownerId !== settlement.id)).toBe(true);
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

// The first owned hex matching `predicate`, or throws — same "pick a
// different seed if this starts failing" shape as findLandBorderEdge above.
function findOwnedHex(
  model: WorldModel,
  settlement: ReturnType<WorldModel['foundSettlement']>,
  radius: number,
  predicate: (c: AxialCoord) => boolean,
): AxialCoord {
  for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, radius)) {
    if (model.getTile(c.q, c.r).ownerId === settlement.id && predicate(c)) return c;
  }
  throw new Error('no matching owned hex found — pick a different test seed');
}

describe('WorldModel.placeBuilding — fisher hut and sawmill', () => {
  it('places a fisher hut directly on a coastal-water hex, like the fishing hut/dockyard', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    // A settlement's *founding* spot is guaranteed no sea within two hexes
    // (findLandfall/the backend's FindStartPositions both enforce this), so
    // a level-1 realm (claimRadiusForLevel(1) === 2) never actually reaches
    // the coast — levelling up first grows the claimed radius far enough to
    // reach real coastal water, same as a settlement would need to in play.
    settlement.level = 6;
    model.claimTerritory(settlement.id);
    const radius = model.borderRadius(settlement);
    const coastal = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).isCoastalWater === true);

    expect(model.placeBuilding(settlement.id, coastal, 'fisherhut')).toBe(true);
    expect(model.getTile(coastal.q, coastal.r).buildingType).toBe('fisherhut');
  });

  it('refuses a fisher hut on plain land, even a buildable Grass hex', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass');

    expect(model.placeBuilding(settlement.id, grass, 'fisherhut')).toBe(false);
    expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
  });

  it('places a sawmill directly on a straight or bend river tile', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass');
    model.setRiverTiles([riverTile(grass, 'bend')]);

    expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(true);
    expect(model.getTile(grass.q, grass.r).buildingType).toBe('sawmill');
  });

  it('refuses a sawmill on plain grass with no river at all', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass');

    expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(false);
    expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
  });

  it.each(['spring', 'confluence', 'mouth'] as const)(
    'refuses a sawmill on a %s river tile — only straight/bend have matching art',
    (shape) => {
      const model = new WorldModel(20260825);
      const { settlement } = foundLandedSettlement(model);
      const radius = model.borderRadius(settlement);
      const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass');
      model.setRiverTiles([riverTile(grass, shape)]);

      expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(false);
      expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
    },
  );
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
  // A Sawmill is built directly on a river tile (placeBuilding only accepts
  // a straight/bend one), so this reads that same hex's own river shape —
  // not a neighbour's.
  it('falls back to the riverside family when its own hex has no river at all (a Sawmill is never actually placed here, but the query has to answer something)', () => {
    const model = new WorldModel(20260825);
    expect(model.sawmillArtVariantOf({ q: 0, r: 0 })).toBe('sawmillriver');
  });

  it('is the riverside family on a straight river tile', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    model.setRiverTiles([riverTile(at, 'straight')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmillriver');
  });

  it('is the bend family on a bend river tile', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    model.setRiverTiles([riverTile(at, 'bend')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmillbend');
  });

  it('ignores a river tile on a neighbouring hex — only its own hex counts', () => {
    const model = new WorldModel(20260825);
    const at = { q: 0, r: 0 };
    model.setRiverTiles([riverTile(neighbors(at)[0], 'bend')]);
    expect(model.sawmillArtVariantOf(at)).toBe('sawmillriver');
  });

  it.each(['spring', 'confluence', 'mouth', 'bend60'] as const)(
    'falls back to the riverside family on a %s river tile — no dedicated art exists for it (also not a valid Sawmill placement to begin with)',
    (shape) => {
      const model = new WorldModel(20260825);
      const at = { q: 0, r: 0 };
      model.setRiverTiles([riverTile(at, shape)]);
      expect(model.sawmillArtVariantOf(at)).toBe('sawmillriver');
    },
  );
});

describe('WorldModel.seaFacingDirectionOf', () => {
  it('finds the real sea neighbour of a coastal tile', () => {
    // Confirmed against DEFAULT_GENERATION's own terrainAt for this seed: of
    // (-70,-31)'s six neighbours, only SW is sea — the rest are land.
    // Originally reproduced a real in-game bug where a mouth tile rendered a
    // straight line toward the inflow's geometric opposite instead of
    // curving toward the actual sea neighbour; the coordinates here were
    // re-picked when the island generator's defaults were de-rounded (see
    // WorldGenerationOptions's IslandMaxElongation/IslandCellSize doc
    // comments), which moved every seed's terrain.
    const model = new WorldModel(783131215);
    expect(model.seaFacingDirectionOf({ q: -70, r: -31 })).toBe('SW');
  });

  it('returns null when no neighbour is sea', () => {
    // Same seed as above; (-70,-36) confirmed to have all six neighbours as
    // land.
    const model = new WorldModel(783131215);
    expect(model.seaFacingDirectionOf({ q: -70, r: -36 })).toBeNull();
  });
});
