// Mirrors the backend's BuildingCatalogueTests (BoostMultiplier_* cases) so
// the frontend's display formula can't silently drift from the
// server-authoritative one in BuildingCatalogue.cs.
import { describe, expect, it } from 'vitest';
import {
  additionalStorageHouseRequirement,
  ravensRings,
  wisdomBuildTimeFactor,
  BOG_ORE_WORKS_IRON_AT_LEVEL_ONE,
  BOOST_TERRAIN,
  buildingStatsAt,
  buildingStatsFor,
  buildingUpgradeCost,
  isNearAnyOf,
  matchingNeighbourCount,
  maxLevelFor,
  maxTowers,
  radiusBoostPercent,
  radiusBoostRange,
} from './buildingEconomy';
import { neighbors } from '../hex/coords';
import type { BuildingDefinitionResponse } from '../../api/types';
import catalogueSnapshot from '../../data/building-catalogue.json';
import type { Terrain, Tile } from './types';

function tile(q: number, r: number, terrain: Terrain): Tile {
  return { q, r, terrain };
}

/** A `getTile` stub: `matching` for the first `count` of origin's six neighbours, `grass` elsewhere. */
function terrainMap(matching: Terrain, count: number): (q: number, r: number) => Tile {
  const boosted = new Set(neighbors({ q: 0, r: 0 }).slice(0, count).map((c) => `${c.q},${c.r}`));
  return (q, r) => tile(q, r, boosted.has(`${q},${r}`) ? matching : 'grass');
}

describe('matchingNeighbourCount', () => {
  it('counts only the six direct neighbours, never the tile itself', () => {
    const getTile = terrainMap('forest', 3);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, 'forest', getTile)).toBe(3);
  });

  it('is zero when no neighbour matches', () => {
    const getTile = terrainMap('forest', 0);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, 'forest', getTile)).toBe(0);
  });
});

describe('isNearAnyOf', () => {
  it('is true when a neighbour matches any of the given terrains', () => {
    const getTile = terrainMap('sea', 1);
    expect(isNearAnyOf({ q: 0, r: 0 }, ['sea', 'sand'], getTile)).toBe(true);
  });

  it('is false when no neighbour matches', () => {
    const getTile = terrainMap('sea', 0);
    expect(isNearAnyOf({ q: 0, r: 0 }, ['sea', 'sand'], getTile)).toBe(false);
  });
});

describe('buildingStatsFor terrain-adjacency boost (mirrors BuildingCatalogue.cs)', () => {
  it('lumberjack scales 10%/matching neighbour with no boost at zero', () => {
    expect(buildingStatsFor('lumberjack', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'wood', amount: 40 },
      modifier: undefined,
    });
  });

  it('lumberjack caps at +50% (5 neighbours), same as 6', () => {
    const five = buildingStatsFor('lumberjack', 1, 5);
    const six = buildingStatsFor('lumberjack', 1, 6);
    expect(five).toEqual({
      output: { kind: 'resourceRate', resource: 'wood', amount: 60 },
      modifier: { kind: 'terrainBoost', terrain: 'forest', percent: 50 },
    });
    expect(six).toEqual(five);
  });

  it('quarry scales the same curve off stone', () => {
    expect(buildingStatsFor('quarry', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 40 },
      modifier: undefined,
    });
    expect(buildingStatsFor('quarry', 1, 3)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 52 },
      modifier: { kind: 'terrainBoost', terrain: 'mountain', percent: 30 },
    });
  });

  it('fishinghut is boosted by open sea, not the coastal flag alone', () => {
    expect(buildingStatsFor('fishinghut', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 40 },
      modifier: { kind: 'coastal' },
    });
    expect(buildingStatsFor('fishinghut', 1, 2)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 48 },
      modifier: { kind: 'coastal', percent: 20 },
    });
  });

  it('farm and pumpkinfarm ignore terrain adjacency entirely, matching Boosts excluding them', () => {
    // BuildingCatalogue.cs: Farm 40/h at level 1, PumpkinFarm 44/h (the bonus,
    // Pumpkin-soil-only crop yields more), both x1.20 per level, neither in Boosts.
    expect(buildingStatsFor('farm', 1, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 40 },
      workers: { cap: 4 },
    });
    expect(buildingStatsFor('pumpkinfarm', 2, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 53 },
      workers: { cap: 8 },
    });
  });

  it('sawmill has no production of its own — it boosts Lumberjack within range instead', () => {
    expect(buildingStatsFor('sawmill', 1, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'wood' },
    });
    expect(buildingStatsFor('sawmill', 20, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 100, range: 5, resource: 'wood' },
    });
    // Sawmill's own neighbours no longer matter — it has nothing left for a
    // terrain-adjacency boost to multiply.
    expect(buildingStatsFor('sawmill', 1, 6)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'wood' },
    });
  });

  it('cropmill has no production of its own — it boosts Farm (not PumpkinFarm) within range instead', () => {
    expect(buildingStatsFor('cropmill', 1, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'food' },
    });
    expect(buildingStatsFor('cropmill', 20, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 100, range: 5, resource: 'food' },
    });
  });

  it('barracks trains the land army in place of the Longhouse, same as Archery Range', () => {
    expect(buildingStatsFor('barracks', 1, 0)).toEqual({ modifier: { kind: 'trainsLandTroops' } });
  });

  it('meadery has no production/storage of its own yet', () => {
    expect(buildingStatsFor('meadery', 1, 0)).toEqual({});
  });

  it('smithy (the Weaponsmith) has no production/storage of its own', () => {
    expect(buildingStatsFor('smithy', 1, 0)).toEqual({});
  });
});

describe('economy curves (mirror BuildingCatalogue.cs, docs/design/economy.md)', () => {
  it('production is geometric: x1.20 per level, level 10 of a producer is 206/h', () => {
    const at = (level: number) =>
      (buildingStatsFor('lumberjack', level, 0).output as { amount: number }).amount;
    expect(at(1)).toBe(40);
    expect(at(5)).toBe(83);
    expect(at(10)).toBe(206);
    expect(at(25)).toBe(3180);
  });

  it('cost is geometric: x1.30 per level, x1.34 for the Longhouse, and never asks for iron', () => {
    expect(buildingUpgradeCost('lumberjack', 1)).toEqual({ wood: 50, stone: 40, food: 15, iron: 0 });
    expect(buildingUpgradeCost('lumberjack', 5).wood).toBe(143);
    expect(buildingUpgradeCost('lumberjack', 20).wood).toBe(7310);
    expect(buildingUpgradeCost('longhouse', 2).wood).toBe(Math.round(120 * 1.34));
    for (const type of ['tower', 'barracks', 'archeryrange', 'dockyard', 'cartworkshop'] as const) {
      expect(buildingUpgradeCost(type, 3).iron).toBe(0);
    }
  });

  it('storage houses grow geometrically: 600 * (1.22^L - 1) / 0.22', () => {
    const at = (level: number) =>
      (buildingStatsFor('storagehouse', level, 0).output as { amount: number }).amount;
    expect(at(1)).toBe(600);
    expect(at(2)).toBe(Math.round((600 * (1.22 ** 2 - 1)) / 0.22));
  });

  it('per-building max levels', () => {
    expect(maxLevelFor('longhouse')).toBe(30);
    expect(maxLevelFor('lumberjack')).toBe(25);
    expect(maxLevelFor('storagehouse')).toBe(25);
    expect(maxLevelFor('barracks')).toBe(20);
    expect(maxLevelFor('sawmill')).toBe(20);
    expect(maxLevelFor('tower')).toBe(10);
    expect(maxLevelFor('greatstorehouse')).toBe(10);
    expect(maxLevelFor('shrineofthor')).toBe(5);
  });

  it('mill radius boost runs to level 20 and 5 rings', () => {
    expect(radiusBoostPercent(1)).toBe(5);
    expect(radiusBoostPercent(11)).toBe(55);
    expect(radiusBoostPercent(20)).toBe(100);
    expect([1, 4, 5, 9, 17, 20].map(radiusBoostRange)).toEqual([1, 1, 2, 3, 5, 5]);
  });
});

describe('maxTowers (mirrors BuildingCatalogue.MaxTowers)', () => {
  it('is 0 below longhouse 3, 1 for LH 3-6, then one more every second level after LH 5', () => {
    const table: Record<number, number> = { 1: 0, 2: 0, 3: 1, 6: 1, 7: 2, 8: 2, 9: 3, 30: 13 };
    for (const [level, expected] of Object.entries(table)) {
      expect(maxTowers(Number(level)), `LH ${level}`).toBe(expected);
    }
  });
});

describe('additionalStorageHouseRequirement (mirrors BuildingCatalogue.AdditionalStorageHouseRequirement)', () => {
  it('asks for min(n, 4) houses at min(10 + 5(n - 1), 25)', () => {
    expect(additionalStorageHouseRequirement(0)).toEqual({ count: 0, level: 0 });
    expect(additionalStorageHouseRequirement(1)).toEqual({ count: 1, level: 10 });
    expect(additionalStorageHouseRequirement(2)).toEqual({ count: 2, level: 15 });
    expect(additionalStorageHouseRequirement(3)).toEqual({ count: 3, level: 20 });
    expect(additionalStorageHouseRequirement(4)).toEqual({ count: 4, level: 25 });
    expect(additionalStorageHouseRequirement(9)).toEqual({ count: 4, level: 25 });
  });
});

describe('Odin Statue favour (mirrors ShrineCatalogue.Favour(Odin))', () => {
  it('takes 2% off build times and adds 2 vision rings per level, capped at level 5', () => {
    expect(wisdomBuildTimeFactor(0)).toBe(1);
    expect(wisdomBuildTimeFactor(1)).toBeCloseTo(0.98, 9);
    expect(wisdomBuildTimeFactor(5)).toBeCloseTo(0.9, 9);
    expect(wisdomBuildTimeFactor(9)).toBeCloseTo(0.9, 9);
    expect(ravensRings(0)).toBe(0);
    expect(ravensRings(1)).toBe(2);
    expect(ravensRings(5)).toBe(10);
    expect(ravensRings(9)).toBe(10);
  });

  it('describes both effects on the building card', () => {
    expect(buildingStatsFor('odinstatue', 5).modifier).toEqual({ kind: 'odinFavour', buildTimePercent: 10, visionRings: 10 });
    expect(buildingStatsFor('odinstatue', 2).modifier).toEqual({ kind: 'odinFavour', buildTimePercent: 4, visionRings: 4 });
    expect(maxLevelFor('odinstatue')).toBe(5);
  });
});

// The bog buildings (docs/design/bog.md): the same numbers as BuildingCatalogue.cs, see BogBuildingTests.cs.
describe('bog buildings', () => {
  it('the bog-ore works makes iron: 20/h at level 1 growing 20% a level, boosted 10% per bog, creek or lake neighbour up to +50%', () => {
    expect(BOG_ORE_WORKS_IRON_AT_LEVEL_ONE).toBe(20);
    expect(buildingStatsFor('bogoreworks', 1).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 20 });
    expect(buildingStatsFor('bogoreworks', 3).output).toEqual({
      kind: 'resourceRate',
      resource: 'iron',
      amount: Math.round(20 * 1.2 * 1.2),
    });
    expect(buildingStatsFor('bogoreworks', 1, 3).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 26 });
    expect(buildingStatsFor('bogoreworks', 1, 3).modifier).toEqual({ kind: 'terrainBoost', terrain: 'bog', percent: 30 });
    // Capped at +50%, like the other producers.
    expect(buildingStatsFor('bogoreworks', 1, 6).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 30 });
    expect(buildingStatsFor('bogoreworks', 1, 0).modifier).toBeUndefined();
  });

  it('counts bog and lake neighbours for the bog-ore works, sea and lake for the fishing hut', () => {
    expect(BOOST_TERRAIN.bogoreworks).toEqual(['bog', 'lake']);
    expect(BOOST_TERRAIN.fishinghut).toEqual(['sea', 'lake']);
    const mixed = (q: number, r: number): Tile => {
      const kinds: Terrain[] = ['bog', 'lake', 'bog', 'grass', 'grass', 'forest'];
      const index = neighbors({ q: 0, r: 0 }).findIndex((c) => c.q === q && c.r === r);
      return tile(q, r, index >= 0 ? kinds[index]! : 'grass');
    };
    expect(matchingNeighbourCount({ q: 0, r: 0 }, ['bog', 'lake'], mixed)).toBe(3);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, 'bog', mixed)).toBe(2);
  });

  it('stats on a tile: a lake fishing hut boosts by lake water, a coastal one by sea', () => {
    const lakeHut: Tile = { q: 0, r: 0, terrain: 'bog', buildingType: 'fishinghut', bog: { q: 0, r: 0, kind: 'half', inDirections: [], outDirection: null, waterEdges: ['E', 'NE', 'NW'] } };
    const lakeNeighbours = terrainMap('lake', 3);
    expect(buildingStatsAt('fishinghut', 1, lakeHut, lakeNeighbours).modifier).toEqual({ kind: 'terrainBoost', terrain: 'lake', percent: 30 });
    expect(buildingStatsAt('fishinghut', 1, lakeHut, lakeNeighbours).output).toEqual({ kind: 'resourceRate', resource: 'food', amount: 52 });

    const coastHut: Tile = { q: 0, r: 0, terrain: 'sea', buildingType: 'fishinghut' };
    expect(buildingStatsAt('fishinghut', 1, coastHut, terrainMap('sea', 2)).modifier).toEqual({ kind: 'coastal', percent: 20 });
    expect(buildingStatsAt('fishinghut', 1, coastHut, terrainMap('grass', 0)).modifier).toEqual({ kind: 'coastal' });
    expect(buildingStatsAt('lumberjack', 1, tile(0, 0, 'forest'), terrainMap('forest', 4)).output).toEqual({
      kind: 'resourceRate',
      resource: 'wood',
      amount: 56,
    });
  });

  it('the Hammer Forge has no output of its own and raises iron like the mills (5% to 100%, 1 to 5 rings)', () => {
    expect(buildingStatsFor('hammerschmiede', 1)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'iron' },
    });
    expect(buildingStatsFor('hammerschmiede', 20).modifier).toEqual({ kind: 'radiusBoost', percent: 100, range: 5, resource: 'iron' });
    expect(buildingStatsFor('hammerschmiede', 1).output).toBeUndefined();
  });

  it('max levels and costs: bog-ore works 25 like the producers, Hammer Forge 20 like the mills', () => {
    expect(maxLevelFor('bogoreworks')).toBe(25);
    expect(maxLevelFor('hammerschmiede')).toBe(20);
    expect(buildingUpgradeCost('bogoreworks', 1)).toEqual({ wood: 50, stone: 40, food: 15, iron: 0 });
    expect(buildingUpgradeCost('hammerschmiede', 1)).toEqual({ wood: 100, stone: 80, food: 0, iron: 0 });
  });
});

// The bundled catalogue snapshot is what the demo and the lab run on: the client's own display formulas have to agree with it.
describe('bog buildings against the catalogue snapshot', () => {
  const snapshot = (catalogueSnapshot.data as BuildingDefinitionResponse[]).filter((d) => d.type === 'bogoreworks' || d.type === 'hammerschmiede');
  const of = (type: string) => snapshot.filter((d) => d.type === type).sort((a, b) => a.level - b.level);

  it('has the same levels, costs and iron output as the client formulas', () => {
    for (const type of ['bogoreworks', 'hammerschmiede'] as const) {
      const levels = of(type);
      expect(levels.length).toBe(maxLevelFor(type));
      for (const d of levels) {
        expect(d.cost.wood).toBeCloseTo(buildingUpgradeCost(type, d.level).wood, -0.5);
        expect(d.cost.iron).toBe(0);
      }
    }
    for (const d of of('bogoreworks')) {
      const stats = buildingStatsFor('bogoreworks', d.level).output;
      expect(stats).toMatchObject({ kind: 'resourceRate', resource: 'iron' });
      expect(d.productionPerHour.iron).toBeCloseTo(BOG_ORE_WORKS_IRON_AT_LEVEL_ONE * Math.pow(1.2, d.level - 1), 6);
      expect(d.productionPerHour.wood + d.productionPerHour.stone + d.productionPerHour.food).toBe(0);
    }
  });

  it('gates the bog-ore works at longhouse 6 with no feeder and the Hammer Forge at 20 behind bog-ore works 10', () => {
    expect(of('bogoreworks')[0]!.requiredLonghouseLevel).toBe(6);
    expect(of('bogoreworks')[0]!.prerequisites).toEqual([]);
    expect(of('hammerschmiede')[0]!.requiredLonghouseLevel).toBe(20);
    expect(of('hammerschmiede')[0]!.prerequisites).toEqual([{ type: 'bogoreworks', level: 10 }]);
  });

  it('puts the Clay Brickworks on bog in the snapshot too', () => {
    const clay = (catalogueSnapshot.data as BuildingDefinitionResponse[]).find((d) => d.type === 'claybrickworks' && d.level === 1)!;
    expect(clay.allowedTerrain).toEqual(['bog']);
  });
});
