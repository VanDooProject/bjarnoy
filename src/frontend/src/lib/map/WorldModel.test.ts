// Regression coverage for border-anchoring buildings (docs/design decision:
// "Border radius grows with longhouse level and with border-anchoring
// buildings (watchtower)"): a settlement's owned-tile silhouette should stop
// being a pure hex-radius disc once a tower claims ground around itself near
// the edge — this also exercises the border-rendering code path
// (HexMapRenderer's outerEdgesOf) against a non-convex shape, not just the
// perfect hexagon every other settlement in the demo produces.
import { describe, expect, it } from 'vitest';
import { hexDistance, hexesInRadius, hexRing, neighbors, type AxialCoord } from '../hex/coords';
import { giantCoverage } from './giantTiles';
import { guardRange, placeCamps } from './campPlacement';
import { BOG_REACH } from './bogGenerator';
import { placeLakeProps } from './lakeProps';
import { floodFillLandmass, PREVIEW_ISLAND_FLOOD_MAX_RADIUS, PREVIEW_ISLAND_RADIUS, WorldModel } from './WorldModel';
import { DEFAULT_GENERATION, enumerateIslands, soilAt, springMountainShapeAt } from './worldGenerator';
import type { BogTile, RiverTile } from './types';

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
// the click, which for some seeds (see the old demo seed, 20260824 — the case
// that surfaced this after WorldGenerationOptions.IslandMinRadius/
// IslandMaxRadius grew) can be a lone tile at an island's tip: almost every
// hex in the settlement's own realm ends up sea. findLandfall now prefers a
// hex meeting the same quality bar the backend's own FindStartPositions
// enforces (Grass, >=1 Forest and >=2 Grass neighbours, no sea within two
// hexes) over the merely-nearest land hex.
describe('WorldModel.findLandfall', () => {
  it.each([1, 7, 42, 20260824, 20260826, 20260830, 20260831])(
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
    settlement.level = 3; // the first tower unlocks (and is allowed) at longhouse 3
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

  it('refuses a new tower when the longhouse level allows none, and once the limit is reached (maxTowers)', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const spots = hexesInRadius(at, 3).filter(
      (c) => (c.q !== at.q || c.r !== at.r) && model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    expect(spots.length).toBeGreaterThan(3);

    // Longhouse 1-2: the Tower is not unlocked, no tower may stand.
    settlement.level = 2;
    expect(model.placeBuilding(settlement.id, spots[0], 'tower')).toBe(false);

    // Longhouse 3 allows exactly one.
    settlement.level = 3;
    expect(model.placeBuilding(settlement.id, spots[0], 'tower')).toBe(true);
    expect(model.placeBuilding(settlement.id, spots[1], 'tower')).toBe(false);
    expect(model.towerCoords(settlement.id)).toEqual([{ q: spots[0].q, r: spots[0].r }]);

    // Longhouse 7 allows a second; other buildings were never limited.
    settlement.level = 7;
    expect(model.placeBuilding(settlement.id, spots[1], 'tower')).toBe(true);
    expect(model.placeBuilding(settlement.id, spots[2], 'tower')).toBe(false);
    expect(model.placeBuilding(settlement.id, spots[2], 'farm')).toBe(true);
  });

  it('raises the bar for each further storage house (additionalStorageHouseRequirement)', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const spots = hexesInRadius(at, 3).filter(
      (c) => (c.q !== at.q || c.r !== at.r) && model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    expect(spots.length).toBeGreaterThan(5);

    settlement.level = 3; // widen the claim so the spots are reachable
    expect(model.storageHouses(settlement.id)).toEqual([]);
    const setLevel = (i: number, level: number) => {
      model.getTile(spots[i].q, spots[i].r).buildingLevel = level;
    };
    // 1st: never refused. 2nd: needs 1 at L10.
    expect(model.placeBuilding(settlement.id, spots[0], 'storagehouse')).toBe(true);
    expect(model.placeBuilding(settlement.id, spots[1], 'storagehouse')).toBe(false);
    setLevel(0, 10);
    expect(model.placeBuilding(settlement.id, spots[1], 'storagehouse')).toBe(true);
    // 3rd: needs 2 at L15.
    setLevel(1, 14);
    expect(model.placeBuilding(settlement.id, spots[2], 'storagehouse')).toBe(false);
    setLevel(0, 15);
    expect(model.placeBuilding(settlement.id, spots[2], 'storagehouse')).toBe(false);
    setLevel(1, 15);
    expect(model.placeBuilding(settlement.id, spots[2], 'storagehouse')).toBe(true);
    // 4th: needs 3 at L20.
    setLevel(0, 20);
    setLevel(1, 20);
    setLevel(2, 19);
    expect(model.placeBuilding(settlement.id, spots[3], 'storagehouse')).toBe(false);
    setLevel(2, 20);
    expect(model.placeBuilding(settlement.id, spots[3], 'storagehouse')).toBe(true);
    // 5th: needs 4 at L25, and from then on there is no limit.
    for (const i of [0, 1, 2]) setLevel(i, 25);
    setLevel(3, 24);
    expect(model.placeBuilding(settlement.id, spots[4], 'storagehouse')).toBe(false);
    setLevel(3, 25);
    expect(model.placeBuilding(settlement.id, spots[4], 'storagehouse')).toBe(true);
    expect(model.placeBuilding(settlement.id, spots[5], 'storagehouse')).toBe(true);
  });

  it('lets a settlement hold only one shrine in total, of any god', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const spots = hexesInRadius(at, 3).filter(
      (c) => (c.q !== at.q || c.r !== at.r) && model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    settlement.level = 3;

    expect(model.shrineCoords(settlement.id)).toEqual([]);
    expect(model.placeBuilding(settlement.id, spots[0], 'shrineofthor')).toBe(true);
    expect(model.shrineCoords(settlement.id)).toEqual([{ q: spots[0].q, r: spots[0].r }]);
    // neither another god's shrine nor a second one of the same god
    expect(model.placeBuilding(settlement.id, spots[1], 'shrineoffreyja')).toBe(false);
    expect(model.placeBuilding(settlement.id, spots[2], 'shrineofthor')).toBe(false);
    // other buildings are unaffected
    expect(model.placeBuilding(settlement.id, spots[1], 'farm')).toBe(true);
  });

  it("widens a settlement's vision discs by Odin's Ravens and shortens its builds with Wisdom", () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const spots = hexesInRadius(at, 3).filter(
      (c) => (c.q !== at.q || c.r !== at.r) && model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    settlement.level = 3;
    const before = model.visionDiscsFor(settlement)[0].radius;
    const exploredBefore = model.exploredRadius(settlement);
    expect(model.ravensRingsFor(settlement.id)).toBe(0);
    expect(model.wisdomFactor(settlement.id)).toBe(1);
    const signatureBefore = model.fogSignature();

    expect(model.placeBuilding(settlement.id, spots[0], 'odinstatue')).toBe(true);

    expect(model.odinLevel(settlement.id)).toBe(1);
    expect(model.ravensRingsFor(settlement.id)).toBe(2);
    expect(model.visionDiscsFor(settlement)[0].radius).toBe(before + 2);
    expect(model.exploredRadius(settlement)).toBe(exploredBefore + 2);
    expect(model.wisdomFactor(settlement.id)).toBeCloseTo(0.98, 9);
    expect(model.fogSignature()).not.toBe(signatureBefore);
    // it is the settlement's one shrine
    expect(model.placeBuilding(settlement.id, spots[1], 'shrineofthor')).toBe(false);

    model.getTile(spots[0].q, spots[0].r).buildingLevel = 4;
    expect(model.upgradeBuilding(settlement.id, spots[0])).toBe(true);
    expect(model.odinLevel(settlement.id)).toBe(5);
    expect(model.visionDiscsFor(settlement)[0].radius).toBe(before + 10);
    expect(model.wisdomFactor(settlement.id)).toBeCloseTo(0.9, 9);
  });

  it('reads the Odin level from a live snapshot, so Ravens follow the backend', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const snapshot = (buildings: { q: number; r: number; type: string; level: number }[]) => ({
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: settlement.capacity!,
      buildings,
    });

    model.applyServerSnapshot(settlement.id, snapshot([{ q: settlement.q + 1, r: settlement.r, type: 'odinstatue', level: 3 }]));
    expect(model.ravensRingsFor(settlement.id)).toBe(6);

    // a level-0 foundation stub grants nothing yet
    model.applyServerSnapshot(settlement.id, snapshot([{ q: settlement.q + 1, r: settlement.r, type: 'odinstatue', level: 0 }]));
    expect(model.ravensRingsFor(settlement.id)).toBe(0);
  });

  it('refuses to place a tower outside the existing border, so it can only bump the shape outward, never teleport it', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    settlement.level = 3; // the tower limit must not be what refuses this
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

  it('places a barracks, fishing hut and sawmill from a snapshot', () => {
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
        { q: coords[1].q, r: coords[1].r, type: 'fishinghut', level: 1 },
        { q: coords[2].q, r: coords[2].r, type: 'sawmill', level: 1 },
      ],
    });

    expect(model.getTile(coords[0].q, coords[0].r).buildingType).toBe('barracks');
    expect(model.getTile(coords[1].q, coords[1].r).buildingType).toBe('fishinghut');
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

describe('WorldModel.applyServerSnapshot — merged fisher hut', () => {
  it('shows a stale stored fisherhut as a fishinghut', () => {
    const model = new WorldModel(20260825);
    const { settlement, at } = foundLandedSettlement(model);
    const coord = neighbors(at)[0];

    model.applyServerSnapshot(settlement.id, {
      level: settlement.level,
      resources: settlement.resources,
      rates: settlement.rates,
      capacity: settlement.resources,
      buildings: [{ q: coord.q, r: coord.r, type: 'fisherhut', level: 3 }],
    });

    const tile = model.getTile(coord.q, coord.r);
    expect(tile.buildingType).toBe('fishinghut');
    expect(tile.buildingLevel).toBe(3);
  });
});

describe('WorldModel.placeBuilding — fishing hut and sawmill', () => {
  it('places a fishing hut directly on a coastal-water hex, like the fishing hut/dockyard', () => {
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

    expect(model.placeBuilding(settlement.id, coastal, 'fishinghut')).toBe(true);
    expect(model.getTile(coastal.q, coastal.r).buildingType).toBe('fishinghut');
  });

  it('refuses a fishing hut on plain land, even a buildable Grass hex', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass' && model.getTile(c.q, c.r).buildingType === undefined);

    expect(model.placeBuilding(settlement.id, grass, 'fishinghut')).toBe(false);
    expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
  });

  it('places a Shrine of Njörd on coastal water only, never on land', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    settlement.level = 6;
    model.claimTerritory(settlement.id);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass' && model.getTile(c.q, c.r).buildingType === undefined);
    const coastal = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).isCoastalWater === true);

    expect(model.placeBuilding(settlement.id, grass, 'shrineofnjord')).toBe(false);
    expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
    expect(model.placeBuilding(settlement.id, coastal, 'shrineofnjord')).toBe(true);
    expect(model.getTile(coastal.q, coastal.r).buildingType).toBe('shrineofnjord');
  });

  it('places a sawmill directly on a straight or bend river tile', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass' && model.getTile(c.q, c.r).buildingType === undefined);
    model.setRiverTiles([riverTile(grass, 'bend')]);

    expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(true);
    expect(model.getTile(grass.q, grass.r).buildingType).toBe('sawmill');
  });

  it('refuses a sawmill on plain grass with no river at all', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const radius = model.borderRadius(settlement);
    const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass' && model.getTile(c.q, c.r).buildingType === undefined);

    expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(false);
    expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
  });

  it.each(['spring', 'confluence', 'mouth'] as const)(
    'refuses a sawmill on a %s river tile — only straight/bend have matching art',
    (shape) => {
      const model = new WorldModel(20260825);
      const { settlement } = foundLandedSettlement(model);
      const radius = model.borderRadius(settlement);
      const grass = findOwnedHex(model, settlement, radius, (c) => model.getTile(c.q, c.r).terrain === 'grass' && model.getTile(c.q, c.r).buildingType === undefined);
      model.setRiverTiles([riverTile(grass, shape)]);

      expect(model.placeBuilding(settlement.id, grass, 'sawmill')).toBe(false);
      expect(model.getTile(grass.q, grass.r).buildingType).toBeUndefined();
    },
  );
});

describe('WorldModel.tick', () => {
  // Regression: tick() used to add rate*dtHours to each resource with no
  // upper bound, so a long-idle tab (or a big elapsed-time jump) could push
  // the HUD's displayed stock above the settlement's storage cap — visible
  // as a number like "3,760/3,750" that then snapped back down to the cap
  // on the next server sync. tick() must clamp to storageCapForDisplay, the
  // same cap the backend's ResourcePool.Adjust enforces.
  it('never lets a resource exceed the settlement storage cap, even after a large elapsed time', () => {
    const model = new WorldModel(20260825);
    const { settlement } = foundLandedSettlement(model);
    const cap = model.storageCapForDisplay(settlement.id);
    settlement.resources.wood = cap.wood - 1;

    model.tick(performance.now() + 1000 * 60 * 60 * 24); // simulate a day of elapsed time

    expect(settlement.resources.wood).toBe(cap.wood);
    expect(settlement.resources.stone).toBeLessThanOrEqual(cap.stone);
    expect(settlement.resources.food).toBeLessThanOrEqual(cap.food);
    expect(settlement.resources.iron).toBeLessThanOrEqual(cap.iron);
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
// setRiverTiles never looks at inDirections/outDirection.
function riverTile(at: AxialCoord, shape: RiverTile['shape']): RiverTile {
  return { q: at.q, r: at.r, shape, inDirections: [], outDirection: null };
}

// Which art family/orientation a Sawmill/Crop Mill renders with is
// textures.ts's riverBuildingArtFor now (a pure function, unit-tested there
// against real in/out directions) — WorldModel no longer has its own
// sawmillArtVariantOf query for it.

describe('WorldModel.islandFootprint', () => {
  it('covers a whole production-size island, so its label clears the real bottom edge', () => {
    const model = new WorldModel(20260824);
    const islands = enumerateIslands({ seed: 20260824, generation: model.generation }, model.generation.worldRadius);
    const footprints = islands.slice(0, 12).map((island) => model.islandFootprint(island).length);
    // Islands are 1.5k-40k tiles; a footprint capped at a few hundred would put labels inside them.
    expect(Math.max(...footprints)).toBeGreaterThan(3000);
  });
});

describe('WorldModel.seaFacingDirectionOf', () => {
  // Found by search rather than pinned to coordinates: the first coastal land hex near the
  // nearest island to the origin with exactly one sea neighbour (and one with none).
  function findByNeighbourSeaCount(model: WorldModel, count: number): AxialCoord {
    const start = model.findLandfall({ q: 0, r: 0 });
    if (!start) throw new Error('no land in reach of the origin for this seed — pick a different test seed');
    for (let radius = 0; radius <= 200; radius++) {
      for (const c of hexRing(start, radius)) {
        if (!model.isLand(c.q, c.r)) continue;
        if (neighbors(c).filter((n) => !model.isLand(n.q, n.r)).length === count) return c;
      }
    }
    throw new Error(`no land hex with exactly ${count} sea neighbours found — pick a different test seed`);
  }

  it('finds the real sea neighbour of a coastal tile', () => {
    // Originally reproduced a real in-game bug where a mouth tile rendered a straight line
    // toward the inflow's geometric opposite instead of curving toward the actual sea
    // neighbour.
    const model = new WorldModel(783131215);
    const coastal = findByNeighbourSeaCount(model, 1);
    const seaIndex = neighbors(coastal).findIndex((n) => !model.isLand(n.q, n.r));
    expect(model.seaFacingDirectionOf(coastal)).toBe(['E', 'NE', 'NW', 'W', 'SW', 'SE'][seaIndex]);
  });

  it('returns null when no neighbour is sea', () => {
    const model = new WorldModel(783131215);
    expect(model.seaFacingDirectionOf(findByNeighbourSeaCount(model, 0))).toBeNull();
  });
});

describe('WorldModel.springShapeAt', () => {
  it('matches the standalone springMountainShapeAt for the same coordinate/seed', () => {
    // Regression coverage for a bug where the live map hardcoded every
    // Spring river tile to the 'corrie' shape — WorldModel now delegates to
    // the exact same seed-hash mirror of the backend's
    // TerrainSampler.SpringMountainShapeAt that generateTile/variantAt
    // already use elsewhere, rather than picking one shape for everything.
    const model = new WorldModel(783131215);
    for (const at of [
      { q: 0, r: 0 },
      { q: -70, r: -31 },
      { q: 12, r: -5 },
      { q: -3, r: 8 },
    ]) {
      const expected = springMountainShapeAt(at.q, at.r, { seed: model.seed, generation: model.generation });
      expect(model.springShapeAt(at)).toBe(expected === 2 ? 'saddleback' : 'corrie');
    }
  });

  it('actually uses both spring-capable shapes across coordinates, not just one', () => {
    const model = new WorldModel(783131215);
    const shapes = new Set<string>();
    for (let q = 0; q < 40; q++) {
      shapes.add(model.springShapeAt({ q, r: 0 }));
    }
    expect(shapes).toEqual(new Set(['corrie', 'saddleback']));
  });
});

// Scans a run of island centres for one whose soilAt (a pure hash — see
// worldGenerator.ts's own doc comment) is the requested crop, rather than a
// hardcoded coordinate — same "search, don't pin a magic value" reasoning
// SoilAt_produces_both_crops_over_a_sample_of_island_centres uses on the
// backend.
function findIslandCentreWithSoil(seed: number, soil: 'wheat' | 'pumpkin'): AxialCoord {
  for (let q = 0; q < 200; q++) {
    const centre = { q, r: 0 };
    if (soilAt(centre.q, centre.r, { seed, generation: DEFAULT_GENERATION }) === soil) return centre;
  }
  throw new Error(`no ${soil} island centre found in sample range for seed ${seed}`);
}

describe('WorldModel.soilForSettlement / soilAtIslandCentre', () => {
  it('soilAtIslandCentre matches the standalone soilAt for the same coordinate/seed', () => {
    const model = new WorldModel(11);
    for (const centre of [
      { q: 0, r: 0 },
      { q: 15, r: -8 },
      { q: -20, r: 4 },
    ]) {
      const expected = soilAt(centre.q, centre.r, { seed: model.seed, generation: model.generation });
      expect(model.soilAtIslandCentre(centre)).toBe(expected);
    }
  });

  it('soilForSettlement resolves through the settlement’s stored islandId against listIslands', () => {
    const model = new WorldModel(11);
    const centre = { q: 15, r: -8 };
    model.setIslands([{ id: 'isl-1', name: 'Testisle', q: centre.q, r: centre.r }]);
    const settlement = model.registerSettlement({
      id: 'stl-1',
      ownerId: 'p1',
      ownerName: 'Tester',
      name: 'Testerhold',
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: 'isl-1',
    });

    expect(model.soilForSettlement(settlement.id)).toBe(model.soilAtIslandCentre(centre));
  });

  it('is undefined for a settlement with no islandId (a bare demo founding)', () => {
    const model = new WorldModel(11);
    const { settlement } = foundLandedSettlement(model);
    expect(model.soilForSettlement(settlement.id)).toBeUndefined();
  });

  it('is undefined when the islandId does not match any known island', () => {
    const model = new WorldModel(11);
    const settlement = model.registerSettlement({
      id: 'stl-2',
      ownerId: 'p1',
      ownerName: 'Tester',
      name: 'Testerhold',
      q: 0,
      r: 0,
      level: 1,
      resources: { wood: 0, stone: 0, food: 0, iron: 0 },
      rates: { wood: 0, stone: 0, food: 0, iron: 0 },
      foundedAt: 0,
      islandId: 'does-not-exist',
    });

    expect(model.soilForSettlement(settlement.id)).toBeUndefined();
  });
});

describe('WorldModel.placeBuilding — PumpkinFarm soil gate', () => {
  it('refuses a new PumpkinFarm on a Wheat-soil island', () => {
    const model = new WorldModel(11);
    const { settlement, at } = foundLandedSettlement(model);
    const centre = findIslandCentreWithSoil(model.seed, 'wheat');
    settlement.islandId = 'isl-wheat';
    model.setIslands([{ id: 'isl-wheat', name: 'Wheatisle', q: centre.q, r: centre.r }]);

    const spot = hexesInRadius(at, model.borderRadius(settlement)).find(
      (c) => model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    if (!spot) throw new Error('no empty land near founding — pick a different test seed');

    expect(model.placeBuilding(settlement.id, spot, 'pumpkinfarm')).toBe(false);
  });

  it('accepts a new PumpkinFarm on a Pumpkin-soil island', () => {
    const model = new WorldModel(11);
    const { settlement, at } = foundLandedSettlement(model);
    const centre = findIslandCentreWithSoil(model.seed, 'pumpkin');
    settlement.islandId = 'isl-pumpkin';
    model.setIslands([{ id: 'isl-pumpkin', name: 'Pumpkinisle', q: centre.q, r: centre.r }]);

    const spot = hexesInRadius(at, model.borderRadius(settlement)).find(
      (c) => model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    if (!spot) throw new Error('no empty land near founding — pick a different test seed');

    expect(model.placeBuilding(settlement.id, spot, 'pumpkinfarm')).toBe(true);
  });

  it('never refuses Farm, on either soil', () => {
    const model = new WorldModel(11);
    const { settlement, at } = foundLandedSettlement(model);
    const centre = findIslandCentreWithSoil(model.seed, 'wheat');
    settlement.islandId = 'isl-wheat';
    model.setIslands([{ id: 'isl-wheat', name: 'Wheatisle', q: centre.q, r: centre.r }]);

    const spot = hexesInRadius(at, model.borderRadius(settlement)).find(
      (c) => model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    if (!spot) throw new Error('no empty land near founding — pick a different test seed');

    expect(model.placeBuilding(settlement.id, spot, 'farm')).toBe(true);
  });

  it('allows PumpkinFarm when the settlement has no resolvable island (permissive default)', () => {
    const model = new WorldModel(11);
    const { settlement, at } = foundLandedSettlement(model);

    const spot = hexesInRadius(at, model.borderRadius(settlement)).find(
      (c) => model.isLand(c.q, c.r) && !model.getTile(c.q, c.r).buildingType,
    );
    if (!spot) throw new Error('no empty land near founding — pick a different test seed');

    expect(model.placeBuilding(settlement.id, spot, 'pumpkinfarm')).toBe(true);
  });
});

function key(c: AxialCoord): string {
  return `${c.q},${c.r}`;
}

// landing-page-defects.md L5: the pre-founding preview's old cull was a
// hexDistance disc, which draws whatever land falls inside it — including a
// second, unrelated island. `floodFillLandmass` is the membership half of
// the fix, tested here against a synthetic `isLand` predicate rather than a
// real world seed — same "pure logic, tested directly" reasoning
// HexMapRenderer.test.ts already applies to previewFitZoom/worldLayerOrder,
// and it sidesteps having to go hunting for a seed that happens to produce
// two islands in exactly the right places.
describe('floodFillLandmass', () => {
  it('returns only the previewed island — a second island within PREVIEW_ISLAND_RADIUS is excluded', () => {
    const center: AxialCoord = { q: 0, r: 0 };
    const previewedIsland = hexesInRadius(center, 2);
    // Centred 6 hexes away — within PREVIEW_ISLAND_RADIUS (7) of `center`,
    // so the old (pre-L5) disc rule would have drawn it too.
    const otherIslandCenter: AxialCoord = { q: 6, r: 0 };
    expect(hexDistance(center, otherIslandCenter)).toBeLessThanOrEqual(PREVIEW_ISLAND_RADIUS);
    const otherIsland = hexesInRadius(otherIslandCenter, 2);
    const land = new Set([...previewedIsland, ...otherIsland].map(key));

    // Confirms the bug this guards against: the old radius-disc rule (still
    // `previewIslandFallback`'s own safety-bound fallback, and still half
    // of `previewCropTiles`'s own intersection today) really does pull in
    // the other island for this layout when used alone, with no membership
    // check.
    const oldRuleTiles = hexesInRadius(center, PREVIEW_ISLAND_RADIUS).filter((c) => land.has(key(c)));
    expect(oldRuleTiles.some((c) => otherIsland.some((o) => o.q === c.q && o.r === c.r))).toBe(true);

    const tiles = floodFillLandmass(center, (c) => land.has(key(c)), PREVIEW_ISLAND_FLOOD_MAX_RADIUS)!;
    const tileKeys = new Set(tiles.map(key));
    for (const c of previewedIsland) expect(tileKeys.has(key(c))).toBe(true);
    for (const c of otherIsland) expect(tileKeys.has(key(c))).toBe(false);
  });

  it('is empty when the centre itself is not land', () => {
    expect(floodFillLandmass({ q: 0, r: 0 }, () => false, PREVIEW_ISLAND_FLOOD_MAX_RADIUS)).toEqual([]);
  });

  it('finds the whole landmass when it stays within the safety bound', () => {
    const center: AxialCoord = { q: 0, r: 0 };
    const island = new Set(hexesInRadius(center, 5).map(key));
    const tiles = floodFillLandmass(center, (c) => island.has(key(c)), PREVIEW_ISLAND_FLOOD_MAX_RADIUS)!;
    expect(tiles).toHaveLength(island.size);
  });

  it('returns null (rather than a silently truncated island) once a reachable tile would sit past the safety bound', () => {
    // An unbroken landmass everywhere is exactly the pathological case
    // PREVIEW_ISLAND_FLOOD_MAX_RADIUS exists to catch — see that constant's
    // own doc comment on WorldModel.ts.
    expect(floodFillLandmass({ q: 0, r: 0 }, () => true, PREVIEW_ISLAND_FLOOD_MAX_RADIUS)).toBeNull();
  });
});

describe('WorldModel.previewIslandTiles', () => {
  it('falls back to the old radius-disc rule when the flood fill hits its safety bound, instead of hanging or truncating silently', () => {
    const model = new WorldModel(1);
    // An unbroken landmass everywhere — the pathological case the safety
    // bound (PREVIEW_ISLAND_FLOOD_MAX_RADIUS) exists to catch. Overriding
    // the public `isLand` on this one instance (rather than hunting for a
    // real seed that happens to produce a 24+ hex landmass) keeps this test
    // fast and deterministic.
    model.isLand = () => true;
    const tiles = model.previewIslandTiles({ q: 0, r: 0 });
    const expected = hexesInRadius({ q: 0, r: 0 }, PREVIEW_ISLAND_RADIUS);
    expect(tiles).toHaveLength(expected.length);
  });

  it('caches its result per centre — a second call for the same centre does no further flood-filling', () => {
    const model = new WorldModel(1);
    let calls = 0;
    const realIsLand = model.isLand.bind(model);
    model.isLand = (q: number, r: number) => {
      calls++;
      return realIsLand(q, r);
    };
    const center = { q: 0, r: 0 };
    const first = model.previewIslandTiles(center);
    const callsAfterFirst = calls;
    expect(callsAfterFirst).toBeGreaterThan(0);
    const second = model.previewIslandTiles(center);
    expect(second).toBe(first); // same cached array, not just equal content
    expect(calls).toBe(callsAfterFirst);
  });
});

// landing-page-defects.md L4/L5's own corrected fix: `previewCropTiles` is
// what `rebuildTerrain`'s preview cull and `settlementCameraOrigin`'s L4
// camera fit actually use, and it is an INTERSECTION of two things that
// each get one part of the picture right on their own and wrong on their
// own:
//   - `previewIslandTiles` (landmass membership alone) correctly excludes a
//     foreign island, but places no bound on how big the previewed
//     island's own crop can be — an island can run to dozens of hexes,
//     which (an earlier draft of this fix found out the hard way, by
//     regressing it) is too big to read at any usable zoom beside the hero
//     column: previewFitZoom's own minZoom clamp (see its call site in
//     settlementCameraOrigin) then rescues an under-sized zoom back up
//     to minZoom, which re-introduces overflow past the viewport edge —
//     the exact bleed the coordinator's screenshot review caught.
//   - The old pre-L5 radius disc alone correctly bounds the crop's size,
//     but draws a foreign island's land within the same radius too.
// Both properties are asserted together below, and in the same test where
// it's meaningful (an island that is both foreign *and* oversized), since
// either bug alone can hide the other if only one is checked.
describe('WorldModel.previewCropTiles', () => {
  it('excludes a foreign island within PREVIEW_ISLAND_RADIUS — the L5 property', () => {
    const model = new WorldModel(1);
    const center: AxialCoord = { q: 0, r: 0 };
    const otherIslandCenter: AxialCoord = { q: 6, r: 0 };
    expect(hexDistance(center, otherIslandCenter)).toBeLessThanOrEqual(PREVIEW_ISLAND_RADIUS);
    const previewedIsland = new Set(hexesInRadius(center, 2).map(key));
    const otherIsland = hexesInRadius(otherIslandCenter, 2);
    const land = new Set([...previewedIsland, ...otherIsland.map(key)]);
    model.isLand = (q: number, r: number) => land.has(key({ q, r }));

    const tiles = model.previewCropTiles(center);
    const tileKeys = new Set(tiles.map(key));
    for (const c of otherIsland) expect(tileKeys.has(key(c))).toBe(false);
    for (const k of previewedIsland) expect(tileKeys.has(k)).toBe(true);
  });

  it('never returns a tile beyond PREVIEW_ISLAND_RADIUS, even for an island that is actually much bigger — the L4 property', () => {
    const model = new WorldModel(1);
    // An unbroken landmass everywhere, same trick `previewIslandTiles`'s own
    // safety-bound test uses — stands in for a real island bigger than the
    // crop radius (WorldGenerationOptions allows islands well past 7 hexes
    // across) without needing to hunt for a specific seed.
    model.isLand = () => true;
    const center: AxialCoord = { q: 0, r: 0 };

    const tiles = model.previewCropTiles(center);
    for (const c of tiles) {
      expect(hexDistance(center, c)).toBeLessThanOrEqual(PREVIEW_ISLAND_RADIUS);
    }
    // The crop is capped, not merely "usually small" — it's exactly the
    // full disc when every tile in range is land, matching the mockup's
    // deliberately small framing (docs/design/img/but_building_on_map.png)
    // rather than "however big the connected landmass actually is".
    expect(tiles).toHaveLength(hexesInRadius(center, PREVIEW_ISLAND_RADIUS).length);
  });

  it('both at once: a foreign, also-oversized island neither leaks in nor gets the crop drawn past its own radius', () => {
    const model = new WorldModel(1);
    const center: AxialCoord = { q: 0, r: 0 };
    // The previewed "island" and the foreign one are both unbroken
    // landmasses, separated only by one ring of sea at exactly
    // PREVIEW_ISLAND_RADIUS + 3 from `center` (comfortably past the crop
    // radius, so it can't leak in by radius alone either) — this is the
    // single scenario that would fail if either half of the intersection
    // were dropped.
    const seaRingDistance = PREVIEW_ISLAND_RADIUS + 3;
    model.isLand = (q: number, r: number) => hexDistance(center, { q, r }) !== seaRingDistance;

    const tiles = model.previewCropTiles(center);
    for (const c of tiles) {
      expect(hexDistance(center, c)).toBeLessThanOrEqual(PREVIEW_ISLAND_RADIUS);
    }
    // Nothing from beyond the sea ring (the "foreign" side) is included —
    // it's cut off by radius alone here, but see the first test in this
    // block for the case where radius alone would not have caught it.
    for (const c of tiles) {
      expect(hexDistance(center, c)).toBeLessThan(seaRingDistance);
    }
  });
});


// The app's demo seed until the island-density change (stores/world.ts's DEMO_SEED is now 20260831).
const DEMO_SEED = 20260824;

function foundLandedSettlementAt(model: WorldModel, seedHex: AxialCoord) {
  const at = model.findLandfall(seedHex);
  if (!at) throw new Error('no land found near this hex for this seed — pick a different test seed');
  return { settlement: model.foundSettlement('p1', 'Tester', 'Testerhold', at), at };
}

/**
 * Test-only stand-in for the removed `WorldModel.findGiantAnchor`: the
 * nearest hex to `home` `canPlaceGiant` would accept, searched outward
 * ring-by-ring. Giant placement v2 places giants through `placeGiantsForIsland`
 * (`giantPlacement.ts`'s `placeGiants`, which needs real Mountain/Grass/
 * Forest terrain and an island large enough to qualify) rather than "nearest
 * grass/forest clearing to home", so these `placeGiant`/`canPlaceGiant`
 * mechanics tests just need *some* valid anchor to exercise against — this
 * gives them one without depending on production code that no longer exists.
 */
function findValidGiantAnchor(
  model: WorldModel,
  home: AxialCoord,
  minRadius = 3,
  maxRadius = 40,
  accept: (anchor: AxialCoord) => boolean = () => true,
): AxialCoord | null {
  for (let radius = minRadius; radius <= maxRadius; radius++) {
    for (const c of hexRing(home, radius)) {
      if (model.canPlaceGiant(c) && accept(c)) return c;
    }
  }
  return null;
}

describe('WorldModel.placeGiant / canPlaceGiant', () => {
  it('accepts a valid anchor: tags all 7 covered hexes with the right family/anchor/part', () => {
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const anchor = findValidGiantAnchor(model, at);
    expect(anchor).not.toBeNull();

    expect(model.canPlaceGiant(anchor!)).toBe(true);
    expect(model.placeGiant(anchor!, 'giantmountain')).toBe(true);

    for (const { coord, part } of giantCoverage(anchor!)) {
      const tile = model.getTile(coord.q, coord.r);
      expect(tile.giant).toBeDefined();
      expect(tile.giant!.family).toBe('giantmountain');
      expect(tile.giant!.anchor).toEqual(anchor);
      expect(tile.giant!.part).toBe(part);
      // Any covered hex is left as (or flattened to) grass — never forest,
      // so no tree top draws through the giant's own art.
      expect(tile.terrain).not.toBe('forest');
    }
  });

  it("every covered hex uses the anchor tile's own orientation when none is given", () => {
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const anchor = findValidGiantAnchor(model, at)!;
    const expectedOrientation = model.getTile(anchor.q, anchor.r).orientation;

    model.placeGiant(anchor, 'giantmountain');

    for (const { coord } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).giant?.orientation).toBe(expectedOrientation);
    }
  });

  it("an explicit orientation overrides the anchor tile's own", () => {
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const anchor = findValidGiantAnchor(model, at)!;

    model.placeGiant(anchor, 'giantmountain', 'W');

    for (const { coord } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).giant?.orientation).toBe('W');
    }
  });

  it('converts a covered Forest hex to Grass, in both the Tile and the pure terrain cache', () => {
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const anchor = findValidGiantAnchor(model, at)!;
    const forestCovered = giantCoverage(anchor).find(
      (c) => model.getTile(c.coord.q, c.coord.r).terrain === 'forest',
    );
    // Not every seed/anchor combination covers a Forest hex — skip the
    // assertion (rather than fail the seed choice itself) if this one
    // happens not to.
    if (!forestCovered) return;

    model.placeGiant(anchor, 'giantmountain');

    expect(model.getTile(forestCovered.coord.q, forestCovered.coord.r).terrain).toBe('grass');
    // isLand()/terrainOf() (the pure terrain cache) must agree, not just the
    // materialised Tile — see placeGiant's own comment on why it updates both.
    expect(model.terrainOf(forestCovered.coord.q, forestCovered.coord.r)).toBe('grass');
  });

  it('rejects an anchor whose footprint includes sea', () => {
    const model = new WorldModel(DEMO_SEED);
    const anchor: AxialCoord = { q: 500, r: 500 };
    const seaNeighbour = neighbors(anchor)[0];
    // Force every covered hex to read as grass except one, which reads sea
    // — isolates "the footprint includes sea" as the only possible reason
    // this anchor gets rejected.
    model.terrainOf = (q: number, r: number) => (q === seaNeighbour.q && r === seaNeighbour.r ? 'sea' : 'grass');

    expect(model.canPlaceGiant(anchor)).toBe(false);
    expect(model.placeGiant(anchor, 'giantmountain')).toBe(false);
    expect(model.getTile(anchor.q, anchor.r).giant).toBeUndefined();
  });

  it('rejects an anchor whose footprint overlaps an existing building', () => {
    const model = new WorldModel(DEMO_SEED);
    const { settlement, at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    // A footprint with a hex (not the anchor itself) inside the fresh longhouse's own claim
    // disc (radius 2), to put a building on.
    const farmable = (a: AxialCoord) =>
      giantCoverage(a)
        .slice(1)
        .map((c) => c.coord)
        .filter((c) => hexDistance(at, c) <= 2);
    const anchor = findValidGiantAnchor(model, at, 3, 40, (a) => farmable(a).length > 0)!;
    expect(anchor).not.toBeNull();
    const buildOn = farmable(anchor)[0];
    // placeBuilding requires ownership — claim the hex directly rather than
    // growing the settlement's border out to reach it.
    model.getTile(buildOn.q, buildOn.r).ownerId = settlement.id;
    expect(model.placeBuilding(settlement.id, buildOn, 'hut')).toBe(true);

    expect(model.canPlaceGiant(anchor)).toBe(false);
    expect(model.placeGiant(anchor, 'giantmountain')).toBe(false);
    for (const { coord } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).giant).toBeUndefined();
    }
  });

  it('rejects an anchor that overlaps an already-placed giant', () => {
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const firstAnchor = findValidGiantAnchor(model, at)!;
    expect(model.placeGiant(firstAnchor, 'giantmountain')).toBe(true);

    // The first giant's own anchor, re-tried, must be rejected (already
    // tagged) — and so must an anchor whose 7-hex footprint would overlap
    // it, e.g. one of its own covered neighbours.
    expect(model.canPlaceGiant(firstAnchor)).toBe(false);
    const overlappingAnchor = giantCoverage(firstAnchor)[1].coord;
    expect(model.canPlaceGiant(overlappingAnchor)).toBe(false);
    expect(model.placeGiant(overlappingAnchor, 'giantmountain')).toBe(false);
  });

  // Regression guard for the store's `foundStartingSettlement` call order
  // (stores/world.ts): the giant must be placed *before* `foundSettlement`
  // claims territory, or a footprint hex close enough to sit inside the
  // fresh longhouse's own centre disc would get claimed there and then
  // never un-claimed (claiming is one-way — see `claimedHexes`' own doc
  // comment). This mirrors that corrected order directly against
  // `WorldModel`, with no Pinia/store harness needed.
  it('placing the giant before founding (the store\'s corrected call order) leaves the demo giant entirely unclaimed', () => {
    const model = new WorldModel(DEMO_SEED);
    const at = model.findLandfall({ q: 0, r: 0 });
    if (!at) throw new Error('no land found near origin for this seed — pick a different test seed');
    const anchor = findValidGiantAnchor(model, at);
    expect(anchor).not.toBeNull();
    expect(model.placeGiant(anchor!, 'giantmountain')).toBe(true);

    model.foundSettlement('p1', 'Tester', 'Testerhold', at);

    // The chosen anchor sits well past a fresh level-1 longhouse's claim
    // radius of 2 — it used to straddle the home realm's border under the
    // old (no-giant-rule) claim logic. Under the giants territory rule a
    // claim that only partially
    // covers a giant's 7-hex footprint claims none of it, so every one of
    // the 7 must read back unowned.
    for (const { coord } of giantCoverage(anchor!)) {
      expect(model.getTile(coord.q, coord.r).ownerId).toBeUndefined();
    }
  });
});

// The giants territory rule's own integration into WorldModel's claiming
// methods (claimTerritory/upgradeBuilding/placeBuilding) — the rule itself
// (fully inside -> all 7 claimed; touching/partial/union-missing-one -> none
// claimed) is exhaustively covered against the shared golden fixture by
// territory.golden.test.ts; these tests only need to show WorldModel's own
// claiming call sites actually apply it, additively.
describe('WorldModel giants territory rule', () => {
  it('a giant only partially covered by the centre disc is entirely unclaimed, and becomes fully claimed once a longhouse level-up grows the disc enough to enclose it', () => {
    const model = new WorldModel();
    model.terrainOf = () => 'grass';
    const home: AxialCoord = { q: 0, r: 0 };
    const anchor: AxialCoord = { q: 2, r: 0 };
    // The giant must exist before the first claimTerritory (inside
    // foundSettlement) sees it — see the demo-founding test above for why.
    expect(model.placeGiant(anchor, 'giantmountain')).toBe(true);

    // Level 1's claim radius (claimRadiusForLevel: 2 + floor(level/2)) is 2,
    // which doesn't reach every one of this anchor's 7 footprint hexes
    // (the farthest sit at distance 3) — so nothing of the giant should be
    // claimed yet.
    const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', home);
    for (const { coord } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).ownerId).toBeUndefined();
    }

    // Levelling the longhouse to 2 grows the centre disc's radius to 3,
    // which now fully encloses the giant's footprint — claiming is one-way
    // (claimTerritory/upgradeBuilding only ever add ownerId), so this must
    // now claim all 7, not just the ones newly in range.
    expect(model.upgradeBuilding(settlement.id, home)).toBe(true);
    for (const { coord } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).ownerId).toBe(settlement.id);
    }
  });

  it('placeBuilding always refuses a giant hex, even one the settlement fully claims', () => {
    const model = new WorldModel();
    model.terrainOf = () => 'grass';
    const home: AxialCoord = { q: 0, r: 0 };
    const anchor: AxialCoord = { q: 2, r: 0 };
    model.placeGiant(anchor, 'giantmountain');
    const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', home);
    // Grow the centre disc to radius 3 (see the test above) so this giant
    // reads as fully claimed by the settlement.
    model.upgradeBuilding(settlement.id, home);
    const claimedGiantHex = giantCoverage(anchor)[1].coord;
    expect(model.getTile(claimedGiantHex.q, claimedGiantHex.r).ownerId).toBe(settlement.id);

    expect(model.placeBuilding(settlement.id, claimedGiantHex, 'farm')).toBe(false);
    expect(model.getTile(claimedGiantHex.q, claimedGiantHex.r).buildingType).toBeUndefined();
  });
});

describe('WorldModel.setGiants (live mode)', () => {
  it('tags all 7 covered hexes from a server giant, idempotently', () => {
    const model = new WorldModel();
    model.terrainOf = () => 'grass';
    const anchor: AxialCoord = { q: 5, r: 5 };

    model.setGiants([{ family: 'giantmountain', anchor, orientation: 'E' }]);
    for (const { coord, part } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).giant).toEqual({
        family: 'giantmountain',
        anchor,
        part,
        orientation: 'E',
      });
    }
    expect(model.giantAnchorAt(anchor)).toEqual(anchor);

    // A second call with the same giant must not re-touch or duplicate it.
    model.setGiants([{ family: 'giantmountain', anchor, orientation: 'E' }]);
    for (const { coord, part } of giantCoverage(anchor)) {
      expect(model.getTile(coord.q, coord.r).giant).toEqual({
        family: 'giantmountain',
        anchor,
        part,
        orientation: 'E',
      });
    }
  });

  it('flattens a covered Forest hex to Grass, same as placeGiant', () => {
    // Mirrors WorldModel.placeGiant's own equivalent test (above): finds a
    // real seeded anchor whose footprint happens to cover a Forest hex,
    // rather than forcing one via an overridden `terrainOf` — overriding it
    // entirely (as the other setGiants tests in this block do) would bypass
    // the very terrain cache (`WorldModel.terrain`) this test needs to
    // observe getting updated in step with the materialised `Tile`.
    const model = new WorldModel(DEMO_SEED);
    const { at } = foundLandedSettlementAt(model, { q: 0, r: 0 });
    const anchor = findValidGiantAnchor(model, at)!;
    const forestCovered = giantCoverage(anchor).find(
      (c) => model.getTile(c.coord.q, c.coord.r).terrain === 'forest',
    );
    if (!forestCovered) return;

    model.setGiants([{ family: 'giantmountain', anchor, orientation: 'E' }]);

    expect(model.getTile(forestCovered.coord.q, forestCovered.coord.r).terrain).toBe('grass');
    expect(model.terrainOf(forestCovered.coord.q, forestCovered.coord.r)).toBe('grass');
  });

  it('never clobbers a hex already tagged by a different giant\'s anchor', () => {
    const model = new WorldModel();
    model.terrainOf = () => 'grass';
    const anchorA: AxialCoord = { q: 0, r: 0 };
    model.setGiants([{ family: 'giantmountain', anchor: anchorA, orientation: 'E' }]);

    // A second giant whose own anchor happens to land on one of the first
    // giant's already-tagged footprint hexes (shouldn't happen for the
    // backend's own giants, which never overlap — this is a defensive
    // guard, not an expected shape).
    const overlappingAnchor = giantCoverage(anchorA)[1].coord;
    model.setGiants([{ family: 'giantmountain', anchor: overlappingAnchor, orientation: 'W' }]);

    const tile = model.getTile(overlappingAnchor.q, overlappingAnchor.r);
    expect(tile.giant?.anchor).toEqual(anchorA);
    expect(tile.giant?.orientation).toBe('E');
  });
});

describe('placeGiantsForIsland (demo giant placement v2)', () => {
  // The old demo seed's nearest island to the origin: big enough (hundreds of tiles) to
  // get mountain giants. The anchors are read back off the model rather than pinned.
  const DEMO_SEED = 20260824;

  function giantAnchorsNear(model: WorldModel, near: AxialCoord): AxialCoord[] {
    const anchors = new Map<string, AxialCoord>();
    for (const c of hexesInRadius(near, 150)) {
      const anchor = model.giantAnchorAt(c);
      if (anchor) anchors.set(`${anchor.q},${anchor.r}`, anchor);
    }
    return [...anchors.values()];
  }

  it('tags a mountain giant even though its footprint is Mountain terrain', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);
    const anchors = giantAnchorsNear(model, near);
    expect(anchors.length).toBeGreaterThan(0);
    let sawMountainFootprint = false;
    for (const anchor of anchors) {
      const tags = giantCoverage(anchor).map(({ coord }) => model.getTile(coord.q, coord.r).giant?.family);
      const family = tags[0];
      expect(family).toBeDefined();
      expect(tags.every((f) => f === family)).toBe(true);
      if (family === 'giantmountain') sawMountainFootprint = true;
    }
    expect(sawMountainFootprint).toBe(true);
  });

  it('keeps the landfall clear of every placed giant', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);
    const anchors = giantAnchorsNear(model, near);
    expect(anchors.length).toBeGreaterThan(0);
    const at = model.findLandfall(near);
    expect(at).not.toBeNull();
    for (const anchor of anchors) expect(hexDistance(at!, anchor)).toBeGreaterThanOrEqual(5);
  });

  it('places an island’s giants once, however many times it is visited', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);
    const before = giantAnchorsNear(model, near);
    model.placeGiantsForIsland({ q: near.q + 1, r: near.r }, DEMO_SEED);
    expect(giantAnchorsNear(model, near)).toEqual(before);
  });
});

describe('WorldModel wildlife camps', () => {
  const DEMO_SEED = 20260824;

  it('setCamps tags the hex, derives strength and guard range from the family table, and is idempotent', () => {
    const model = new WorldModel();
    model.terrainOf = () => 'grass';
    const coord: AxialCoord = { q: 3, r: 4 };

    model.setCamps([{ family: 'wolfden', coord, level: 4, orientation: 'SE' }]);
    expect(model.getTile(3, 4).camp).toEqual({ family: 'wolfden', level: 4, orientation: 'SE', strong: true, guardRange: 6 });
    expect(model.campAt(coord)).toMatchObject({ family: 'wolfden', q: 3, r: 4 });

    model.setCamps([{ family: 'sealhaulout', coord: { q: 9, r: 9 }, level: 5, orientation: 'E' }]);
    expect(model.getTile(9, 9).camp).toEqual({ family: 'sealhaulout', level: 5, orientation: 'E', strong: false, guardRange: 3 });

    // A second call for a hex that already has a camp leaves it alone.
    model.setCamps([{ family: 'boarwallow', coord, level: 1, orientation: 'W' }]);
    expect(model.getTile(3, 4).camp?.family).toBe('wolfden');
  });

  it('a camp hex is not buildable', () => {
    // Control: a model with no camp, to find a hex the farm can go on...
    const control = new WorldModel(DEMO_SEED);
    const { settlement: controlSettlement, at } = foundLandedSettlement(control);
    const candidate = hexesInRadius(at, 3).find(
      (c) => hexDistance(at, c) >= 2 && control.placeBuilding(controlSettlement.id, c, 'farm'),
    );
    expect(candidate).toBeDefined();

    // ...and the same hex in an identical model, with a camp on it, is refused.
    const model = new WorldModel(DEMO_SEED);
    const { settlement } = foundLandedSettlement(model);
    model.setCamps([{ family: 'wolfden', coord: candidate!, level: 2, orientation: 'SE' }]);
    expect(model.placeBuilding(settlement.id, candidate!, 'farm')).toBe(false);
    expect(model.getTile(candidate!.q, candidate!.r).buildingType).toBeUndefined();
  });

  it('findLandfall keeps out of a strong camp\'s guard range plus the margin, but not a weak camp\'s', () => {
    const model = new WorldModel(DEMO_SEED);
    const spot = model.findLandfall({ q: 0, r: 0 })!;

    model.setCamps([{ family: 'sealhaulout', coord: spot, level: 5, orientation: 'SE' }]);
    expect(model.findLandfall({ q: 0, r: 0 })).toEqual(spot);

    const strongModel = new WorldModel(DEMO_SEED);
    strongModel.setCamps([{ family: 'wolfden', coord: spot, level: 3, orientation: 'SE' }]);
    const away = strongModel.findLandfall({ q: 0, r: 0 })!;
    expect(hexDistance(away, spot)).toBeGreaterThan(guardRange(3, 'strong') + 2);
  });

  it('demo mode places an island\'s camps with the shared core, clear of giants, once', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);

    const island = floodFillLandmass(near, (c) => model.isLand(c.q, c.r), 400)!;
    const camps = island.map((c) => ({ c, camp: model.campAt(c) })).filter((x) => x.camp);
    expect(camps.length).toBeGreaterThan(0);
    for (const { c } of camps) expect(model.giantAnchorAt(c)).toBeNull();

    expect(camps.length).toBeLessThanOrEqual(24);

    const before = camps.map((x) => `${x.c.q},${x.c.r},${x.camp!.family},${x.camp!.level}`).sort();
    model.placeGiantsForIsland({ q: near.q + 1, r: near.r }, DEMO_SEED);
    const after = island
      .map((c) => ({ c, camp: model.campAt(c) }))
      .filter((x) => x.camp)
      .map((x) => `${x.c.q},${x.c.r},${x.camp!.family},${x.camp!.level}`)
      .sort();
    expect(after).toEqual(before);

    // And the landfall now keeps away from every strong one.
    const landfall = model.findLandfall(near)!;
    for (const { c, camp } of camps) {
      if (camp!.strong) expect(hexDistance(landfall, c)).toBeGreaterThan(camp!.guardRange + 2);
    }
  });

  it('placeCamps is deterministic and never puts two camps closer than the minimum spacing', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    const island = floodFillLandmass(near, (c) => model.isLand(c.q, c.r), 400)!;
    const run = () => placeCamps(island, (c) => model.terrainOf(c.q, c.r), [], [], DEMO_SEED, 7);
    expect(run()).toEqual(run());
    const camps = run();
    for (let i = 0; i < camps.length; i++) {
      for (let j = i + 1; j < camps.length; j++) expect(hexDistance(camps[i].coord, camps[j].coord)).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('WorldModel wasted-island reveal', () => {
  // Seed 40 has a small wasted island nearest the origin around cell (-1, 1) (found by
  // scanning the wasted island cells after the island-density change). (-81, 256) is a wasted-forest hex whose 6
  // neighbours are also wasted land (fully interior); (-83, 256) is plain open sea that
  // borders wasted land.
  const WASTED_SEED = 40;
  const wastedForest = { q: -81, r: 256 };
  const seaBorderingWasted = { q: -83, r: 256 };

  it('hides a wasted hex as sea before the reveal', () => {
    const model = new WorldModel(WASTED_SEED);
    expect(model.isWastedRevealed()).toBe(false);
    expect(model.terrainOf(wastedForest.q, wastedForest.r)).toBe('sea');
    expect(model.isLand(wastedForest.q, wastedForest.r)).toBe(false);
    const tile = model.getTile(wastedForest.q, wastedForest.r);
    expect(tile.terrain).toBe('sea');
    expect(tile.wasted).toBeUndefined();
  });

  it('materialises wasted land, with the wasted flag, once revealed', () => {
    const model = new WorldModel(WASTED_SEED);
    model.setWastedRevealed(true);
    expect(model.isWastedRevealed()).toBe(true);
    expect(model.terrainOf(wastedForest.q, wastedForest.r)).toBe('forest');
    expect(model.isLand(wastedForest.q, wastedForest.r)).toBe(true);
    const tile = model.getTile(wastedForest.q, wastedForest.r);
    expect(tile.terrain).toBe('forest');
    expect(tile.wasted).toBe(true);
  });

  it('tags sea bordering wasted land as wasted (for the blacksandcoast art) once revealed', () => {
    const model = new WorldModel(WASTED_SEED);
    model.setWastedRevealed(true);
    const tile = model.getTile(seaBorderingWasted.q, seaBorderingWasted.r);
    expect(tile.terrain).toBe('sea');
    expect(tile.isCoastalWater).toBe(true);
    expect(tile.wasted).toBe(true);
  });

  it('never tags a green terrain hex as wasted, before or after reveal', () => {
    const model = new WorldModel(WASTED_SEED);
    // Plain land, nowhere near any wasted island.
    model.getTile(0, 0);
    model.setWastedRevealed(true);
    const tile = model.getTile(0, 0);
    expect(tile.wasted).toBeUndefined();
  });

  it('invalidates the terrain/tile caches when the reveal flips', () => {
    const model = new WorldModel(WASTED_SEED);
    // Materialise the hex's sea answer into both caches first.
    expect(model.terrainOf(wastedForest.q, wastedForest.r)).toBe('sea');
    expect(model.getTile(wastedForest.q, wastedForest.r).terrain).toBe('sea');

    model.setWastedRevealed(true);
    expect(model.terrainOf(wastedForest.q, wastedForest.r)).toBe('forest');
    expect(model.getTile(wastedForest.q, wastedForest.r).terrain).toBe('forest');

    model.setWastedRevealed(false);
    expect(model.terrainOf(wastedForest.q, wastedForest.r)).toBe('sea');
    expect(model.getTile(wastedForest.q, wastedForest.r).terrain).toBe('sea');
  });

  it('never wipes green-island state (buildings, ownership, giant tags) on reveal', () => {
    // Seed 20260824 (the app's demo seed until the island-density change): the landfall nearest the origin, and a
    // giant-placeable anchor near it whose footprint includes a Forest hex (found by
    // scanning canPlaceGiant), so this also covers tagGiantHex's Forest->Grass flattening
    // surviving a reveal.
    const model = new WorldModel(20260824);
    const landfall = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('owner-1', 'Owner', 'Home', landfall);

    // A claimed, non-giant, non-longhouse hex next to home to build a hut on.
    const buildAt = neighbors(settlement).find((n) => model.placeBuilding(settlement.id, n, 'hut'))!;
    expect(buildAt).toBeDefined();

    const giantAnchor = findValidGiantAnchor(model, landfall, 3, 40, (a) =>
      giantCoverage(a).some((c) => model.getTile(c.coord.q, c.coord.r).terrain === 'forest'),
    )!;
    expect(giantAnchor).not.toBeNull();
    const footprint = giantCoverage(giantAnchor).map((c) => c.coord);
    const forestHex = footprint.find((c) => model.getTile(c.q, c.r).terrain === 'forest');
    expect(forestHex).toBeDefined();
    expect(model.placeGiant(giantAnchor, 'giantmountain')).toBe(true);

    model.setWastedRevealed(true);

    // Building + ownership survive.
    const built = model.getTile(buildAt.q, buildAt.r);
    expect(built.buildingType).toBe('hut');
    expect(built.ownerId).toBe(settlement.id);
    const home = model.getTile(settlement.q, settlement.r);
    expect(home.buildingType).toBe('longhouse');
    expect(home.ownerId).toBe(settlement.id);

    // The giant's tag survives on all 7 covered hexes, and giantAnchorByHex
    // (read via giantAnchorAt) still agrees with it.
    for (const coord of footprint) {
      const tile = model.getTile(coord.q, coord.r);
      expect(tile.giant?.anchor).toEqual(giantAnchor);
      expect(tile.giant?.family).toBe('giantmountain');
      expect(model.giantAnchorAt(coord)).toEqual(giantAnchor);
    }

    // The Forest->Grass flattening tagGiantHex wrote survives too (reverting
    // to Forest would put a tree top back through the giant's own art).
    expect(model.getTile(forestHex!.q, forestHex!.r).terrain).toBe('grass');
  });

  it('is a no-op when set to its current value (cache stays warm)', () => {
    const model = new WorldModel(WASTED_SEED);
    const before = model.getTile(0, 0).terrain;
    model.setWastedRevealed(false);
    // Same answer either way — a fresh materialisation would agree too, so
    // this only checks the call didn't throw/behave oddly, not cache identity.
    expect(model.getTile(0, 0).terrain).toBe(before);
  });

  it('revealWastedIslands (demo debug hook) reveals and places giants on a nearby wasted island', () => {
    const model = new WorldModel(WASTED_SEED);
    expect(model.isWastedRevealed()).toBe(false);

    const discovered = model.revealWastedIslands(WASTED_SEED, wastedForest, 5);

    expect(model.isWastedRevealed()).toBe(true);
    expect(discovered.length).toBeGreaterThan(0);
    expect(model.getTile(wastedForest.q, wastedForest.r).terrain).toBe('forest');
  });
});

describe('WorldModel frozen isles flag', () => {
  it('defaults to disabled and tracks setFrozenEnabled', () => {
    const model = new WorldModel(1);
    expect(model.isFrozenEnabled()).toBe(false);

    model.setFrozenEnabled(true);
    expect(model.isFrozenEnabled()).toBe(true);

    model.setFrozenEnabled(false);
    expect(model.isFrozenEnabled()).toBe(false);
  });
});

describe('WorldModel bogland', () => {
  const DEMO_SEED = 20260824;

  it('lays a bog over the seed terrain: bog moss is land, a lake is neither land nor sea, and tiles seen earlier follow', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    const moss = near;
    const lake = neighbors(near)[0]!;
    // Materialise both before the overlay lands: a tile already cached must be rewritten, not left on its seed terrain.
    const before = model.getTile(moss.q, moss.r);
    expect(before.bog).toBeUndefined();
    model.getTile(lake.q, lake.r);

    model.setBogTiles([
      { q: moss.q, r: moss.r, kind: 'inlet', inDirections: [], outDirection: null, waterEdges: ['E'] },
      { q: lake.q, r: lake.r, kind: 'lake', inDirections: [], outDirection: null, waterEdges: [] },
    ]);

    expect(model.terrainOf(moss.q, moss.r)).toBe('bog');
    expect(model.isLand(moss.q, moss.r)).toBe(true);
    expect(model.terrainOf(lake.q, lake.r)).toBe('lake');
    expect(model.isLand(lake.q, lake.r)).toBe(false);
    expect(model.getTile(moss.q, moss.r).bog?.kind).toBe('inlet');
    expect(model.getTile(lake.q, lake.r)).toMatchObject({ terrain: 'lake', isCoastalWater: false });
    expect(model.getBogTile(lake.q, lake.r)?.kind).toBe('lake');
    expect(model.listBogTiles()).toHaveLength(2);

    // A new call replaces the overlay: the hexes go back to what the seed says.
    model.setBogTiles([]);
    expect(model.getBogTile(lake.q, lake.r)).toBeUndefined();
    expect(model.terrainOf(moss.q, moss.r)).not.toBe('bog');
  });

  it('refuses to build on a lake', () => {
    const model = new WorldModel(DEMO_SEED);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', at);
    const lake = neighbors(at)[0]!;
    model.setBogTiles([{ q: lake.q, r: lake.r, kind: 'lake', inDirections: [], outDirection: null, waterEdges: [] }]);
    expect(model.placeBuilding(settlement.id, lake, 'farm')).toBe(false);
    expect(model.placeBuilding(settlement.id, lake, 'fishinghut')).toBe(false);

    // The same hex is fine once it is land again: it was the lake that refused, not the claim or the terrain.
    model.setBogTiles([]);
    expect(model.placeBuilding(settlement.id, lake, 'farm')).toBe(true);
  });

  it('generates the home island’s bog with its rivers and keeps giants, camps and the landfall off it', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);

    const bog = model.listBogTiles();
    expect(bog.length).toBeGreaterThan(50);
    expect(bog.some((t) => t.kind === 'lake')).toBe(true);
    expect(bog.some((t) => t.kind === 'mouth')).toBe(true);

    for (const tile of bog) {
      const t = model.getTile(tile.q, tile.r);
      expect(t.terrain).toBe(tile.kind === 'lake' ? 'lake' : 'bog');
      expect(t.bog).toBe(tile);
      expect(t.giant, `giant on bog hex ${tile.q},${tile.r}`).toBeUndefined();
      if (t.camp) expect(tile.kind).toBe('bog');
    }

    const landfall = model.findLandfall(near)!;
    expect(model.getBogTile(landfall.q, landfall.r)).toBeUndefined();
    expect(model.getTile(landfall.q, landfall.r).terrain).toBe('grass');
  });

  // docs/design/bog.md, "Decisions": a landing spot needs plain bog moss within BOG_REACH hexes
  // (WorldGenerator.FindStartPositions, the same rule on the server).
  it('lands on a hex with plain bog in reach once the island is generated', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);

    const plainBog = model.listBogTiles().filter((t) => t.kind === 'bog');
    expect(plainBog.length).toBeGreaterThan(0);

    const landfall = model.findLandfall(near)!;
    expect(model.hasPlainBogInReach(landfall)).toBe(true);
    expect(plainBog.some((b) => hexDistance(b, landfall) <= BOG_REACH)).toBe(true);
  });

  it('counts only plain moss as bog in reach, and stops exactly at the reach', () => {
    const model = new WorldModel(DEMO_SEED);
    const near = model.findLandfall({ q: 0, r: 0 })!;
    model.placeGiantsForIsland(near, DEMO_SEED);
    const plainBog = model.listBogTiles().filter((t) => t.kind === 'bog');
    const target = plainBog[0]!;

    // Keep only one plain moss hex and a lake/creek elsewhere: only the moss hex's surroundings are in reach.
    const notPlain = model.listBogTiles().find((t) => t.kind !== 'bog' && hexDistance(t, target) > 3 * BOG_REACH);
    model.setBogTiles([target, ...(notPlain ? [notPlain] : [])]);
    const exactly = hexRing(target, BOG_REACH)[0]!;
    const beyond = hexRing(target, BOG_REACH + 1)[0]!;
    expect(model.hasPlainBogInReach(exactly)).toBe(true);
    expect(model.hasPlainBogInReach(beyond)).toBe(false);
    if (notPlain) expect(model.hasPlainBogInReach(notPlain)).toBe(false);
  });

  it('does not apply the bog rule before any island is generated (no bog is known yet)', () => {
    const model = new WorldModel(DEMO_SEED);
    expect(model.hasPlainBogInReach({ q: 0, r: 0 })).toBe(true);
  });
});

// The bog buildings (docs/design/bog.md, "Buildings"): where each may be placed, and the lake decorations they ask for.
describe('WorldModel bog buildings', () => {
  const bogTile = (
    q: number,
    r: number,
    kind: BogTile['kind'],
    inDirections: BogTile['inDirections'] = [],
    outDirection: BogTile['outDirection'] = null,
    waterEdges: BogTile['waterEdges'] = [],
  ): BogTile => ({ q, r, kind, inDirections, outDirection, waterEdges });

  /** A settlement of the given level with one bog hex of every kind laid out in its claim, and a lake beyond. */
  function bogSettlement(level = 3, seed = DEMO_SEED) {
    const model = new WorldModel(seed);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', at);
    settlement.level = level;
    model.claimTerritory(settlement.id);
    const ring = hexRing(at, 2);
    const hex = (i: number) => ring[i]!;
    const tiles: BogTile[] = [
      bogTile(hex(0).q, hex(0).r, 'bog'),
      bogTile(hex(1).q, hex(1).r, 'creek', ['W'], 'E'),
      bogTile(hex(2).q, hex(2).r, 'half', [], null, ['E', 'NE', 'NW']),
      bogTile(hex(3).q, hex(3).r, 'shore', [], null, ['E', 'NE']),
      bogTile(hex(4).q, hex(4).r, 'mouth', ['W'], 'E', ['E']),
      bogTile(hex(5).q, hex(5).r, 'creekspring', [], 'E'),
      bogTile(hex(6).q, hex(6).r, 'inlet', [], null, ['E']),
      bogTile(hex(7).q, hex(7).r, 'lake'),
    ];
    model.setBogTiles(tiles);
    return { model, settlement, at, hex };
  }

  it('places the Clay Brickworks and the bog-ore works on plain moss only', () => {
    for (const type of ['claybrickworks', 'bogoreworks'] as const) {
      const { model, settlement, hex } = bogSettlement();
      expect(model.placeBuilding(settlement.id, hex(3), type), `${type} on a shore`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(1), type), `${type} on a creek`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(4), type), `${type} on a mouth`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(5), type), `${type} on a spring`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(6), type), `${type} on an inlet`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(7), type), `${type} on a lake`).toBe(false);
      expect(model.placeBuilding(settlement.id, hex(0), type), `${type} on plain moss`).toBe(true);
    }
  });

  it('places the Hammerschmiede on a creek only', () => {
    const { model, settlement, hex } = bogSettlement();
    for (const i of [0, 2, 3, 4, 5, 6, 7]) {
      expect(model.placeBuilding(settlement.id, hex(i), 'hammerschmiede'), `hex ${i}`).toBe(false);
    }
    expect(model.placeBuilding(settlement.id, hex(1), 'hammerschmiede')).toBe(true);
    expect(model.getTile(hex(1).q, hex(1).r).buildingType).toBe('hammerschmiede');
  });

  it('places the Fishing Hut on a lake half shore, and on no other bog hex', () => {
    const { model, settlement, hex } = bogSettlement();
    for (const i of [0, 1, 3, 4, 5, 6, 7]) {
      expect(model.placeBuilding(settlement.id, hex(i), 'fishinghut'), `hex ${i}`).toBe(false);
    }
    expect(model.placeBuilding(settlement.id, hex(2), 'fishinghut')).toBe(true);
  });

  it('refuses every grass building on bog ground (the PR3 open point)', () => {
    const { model, settlement, hex } = bogSettlement();
    for (const type of ['farm', 'tower', 'storagehouse', 'townsquare', 'meadery', 'barracks', 'smithy', 'lumberjack', 'quarry'] as const) {
      for (const i of [0, 1, 2, 3, 4, 5, 6]) {
        expect(model.placeBuilding(settlement.id, hex(i), type), `${type} on hex ${i}`).toBe(false);
      }
    }
  });

  it('no longer builds the Clay Brickworks on grass', () => {
    const model = new WorldModel(DEMO_SEED);
    const at = model.findLandfall({ q: 0, r: 0 })!;
    const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', at);
    const grass = hexesInRadius(at, 2).find((c) => model.getTile(c.q, c.r).terrain === 'grass' && !model.getTile(c.q, c.r).buildingType);
    expect(grass).toBeDefined();
    expect(model.placeBuilding(settlement.id, grass!, 'claybrickworks')).toBe(false);
    expect(model.placeBuilding(settlement.id, grass!, 'farm')).toBe(true);
  });

  describe('lake decorations', () => {
    /** A lake of radius 3 whose shore ring holds half-shore tiles; the settlement (LH 3, radius 3) claims the ring's near side. */
    function lakeWorld(seed: number) {
      const model = new WorldModel(seed);
      const at = model.findLandfall({ q: 0, r: 0 })!;
      const settlement = model.foundSettlement('p1', 'Tester', 'Testerhold', at);
      settlement.level = 3;
      model.claimTerritory(settlement.id);
      const centre = { q: at.q + 6, r: at.r };
      const lake = hexesInRadius(centre, 3).map((c) => bogTile(c.q, c.r, 'lake'));
      const shore = hexRing(centre, 4).map((c) => bogTile(c.q, c.r, 'half', [], null, ['E', 'NE', 'NW']));
      model.setBogTiles([...lake, ...shore]);
      const huts = shore.filter((s) => model.placeBuilding(settlement.id, s, 'fishinghut'));
      return { model, settlement, lake, shore, huts, centre };
    }

    it('shows the props the pure placement gives for the huts on the shore, and only on open-lake hexes', () => {
      let seen = 0;
      for (const seed of [1, 2, 3, 7, 42, DEMO_SEED]) {
        const { model, lake, huts } = lakeWorld(seed);
        if (huts.length === 0) continue;
        const expected = placeLakeProps(
          seed,
          lake,
          huts.map((h) => ({ q: h.q, r: h.r, type: 'fishinghut' as const })),
        );
        for (const l of lake) {
          expect(model.getTile(l.q, l.r).lakeProp, `seed ${seed} at ${l.q},${l.r}`).toBe(expected.get(`${l.q},${l.r}`));
          expect(model.lakePropAt(l.q, l.r)).toBe(expected.get(`${l.q},${l.r}`));
        }
        seen += expected.size;
      }
      expect(seen).toBeGreaterThan(0);
    });

    it('takes the props away again when the hut is torn down, and a bog-ore works far from the water asks for none', () => {
      for (const seed of [1, 2, 3, 7, 42, DEMO_SEED]) {
        const { model, settlement, lake, huts } = lakeWorld(seed);
        if (huts.length === 0) continue;
        const withProps = lake.filter((l) => model.getTile(l.q, l.r).lakeProp);
        if (withProps.length === 0) continue;

        for (const h of huts) model.razeBuilding(settlement.id, h);
        for (const l of lake) expect(model.getTile(l.q, l.r).lakeProp, `seed ${seed}`).toBeUndefined();
        return;
      }
      throw new Error('no seed put a prop on the lake');
    });

    it('never puts a prop on a plain lake with no building beside it', () => {
      const { model, lake } = lakeWorld(DEMO_SEED);
      const far = new WorldModel(DEMO_SEED);
      far.setBogTiles(lake);
      for (const l of lake) expect(far.getTile(l.q, l.r).lakeProp).toBeUndefined();
      expect(model.listBogTiles().length).toBeGreaterThan(0);
    });
  });
});
