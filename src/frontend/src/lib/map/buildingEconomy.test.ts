// Mirrors the backend's BuildingCatalogueTests (BoostMultiplier_* cases) so
// the frontend's display formula can't silently drift from the
// server-authoritative one in BuildingCatalogue.cs.
import { describe, expect, it } from 'vitest';
import {
  greatStorehouseStorageHousesNeeded,
  ravensRings,
  wisdomBuildTimeFactor,
  BOG_ORE_WORKS_IRON_AT_LEVEL_ONE,
  BOOST_TERRAIN,
  buildingStatsAt,
  buildingStatsFor,
  scaleOutput,
  upgradeRateGain,
  buildingUpgradeCost,
  niceRound,
  isNearAnyOf,
  matchingNeighbourCount,
  maxLevelFor,
  maxTowers,
  RADIUS_BOOST_TARGETS,
  towerExploredRadius,
  towerVisibleRadius,
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
      output: { kind: 'resourceRate', resource: 'wood', amount: 8 },
      modifier: undefined,
    });
  });

  it('lumberjack caps at +50% (5 neighbours), same as 6', () => {
    const five = buildingStatsFor('lumberjack', 1, 5);
    const six = buildingStatsFor('lumberjack', 1, 6);
    expect(five).toEqual({
      output: { kind: 'resourceRate', resource: 'wood', amount: 12 },
      modifier: { kind: 'terrainBoost', terrain: 'forest', percent: 50 },
    });
    expect(six).toEqual(five);
  });

  it('quarry scales the same curve off stone', () => {
    expect(buildingStatsFor('quarry', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 8 },
      modifier: undefined,
    });
    expect(buildingStatsFor('quarry', 1, 3)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 10 },
      modifier: { kind: 'terrainBoost', terrain: 'mountain', percent: 30 },
    });
  });

  it('fishinghut is boosted by open sea, not the coastal flag alone', () => {
    expect(buildingStatsFor('fishinghut', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 16 },
      modifier: { kind: 'coastal' },
    });
    expect(buildingStatsFor('fishinghut', 1, 2)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 19 },
      modifier: { kind: 'coastal', percent: 20 },
    });
  });

  it('radius-boost targets mirror BuildingCatalogue.RadiusBoostTargets: the crop mill boosts Farm only, never Pumpkin Farm', () => {
    expect(RADIUS_BOOST_TARGETS.cropmill).toEqual(['farm']);
    expect(RADIUS_BOOST_TARGETS.sawmill).toEqual(['lumberjack']);
    expect(RADIUS_BOOST_TARGETS.hammerschmiede).toEqual(['bogoreworks']);
  });

  it('farm and pumpkinfarm ignore terrain adjacency entirely, matching Boosts excluding them', () => {
    // BuildingCatalogue.cs: Farm 12/h at level 1, PumpkinFarm 13/h (the bonus,
    // Pumpkin-soil-only crop yields more), each level adding x1.20 more than the last, neither in Boosts.
    expect(buildingStatsFor('farm', 1, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 12 },
    });
    expect(buildingStatsFor('pumpkinfarm', 2, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 29 },
    });
  });

  it('invents no worker count: the backend has no workers, so no building reports one', () => {
    for (const type of ['reindeerherder', 'farm', 'pumpkinfarm', 'lumberjack', 'quarry'] as const) {
      expect(buildingStatsFor(type, 5)).not.toHaveProperty('workers');
    }
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

  it('barracks trains the land army, same as Archery Range', () => {
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
  it('production is increment-geometric: each level adds x1.20 more than the last, level 10 of a Lumberjack is 208/h', () => {
    const at = (level: number) =>
      (buildingStatsFor('lumberjack', level, 0).output as { amount: number }).amount;
    expect(at(1)).toBe(8);
    expect(at(5)).toBe(60);
    expect(at(10)).toBe(208);
    expect(at(25)).toBe(3776);
  });

  it('cost is geometric: x1.30 per level, x1.34 for the Longhouse, and never asks for iron', () => {
    // Levels 1-3 of a producer cost 60%, 75% and 90% of the formula.
    expect(buildingUpgradeCost('farm', 1)).toEqual({ wood: 34, stone: 17, food: 5, iron: 0 });
    expect(buildingUpgradeCost('farm', 4).wood).toBe(niceRound(57 * 1.3 ** 3));
    expect(buildingUpgradeCost('farm', 5).wood).toBe(160);
    expect(buildingUpgradeCost('farm', 20).wood).toBe(8350);
    expect(buildingUpgradeCost('longhouse', 2).wood).toBe(160);
    // The Longhouse grows x1.34 up to level 10 and x1.60 per level from level 11 on.
    expect(buildingUpgradeCost('longhouse', 10).wood).toBe(niceRound(120 * 1.34 ** 9));
    expect(buildingUpgradeCost('longhouse', 12).wood).toBe(niceRound(120 * 1.34 ** 9 * 1.6 ** 2));
    for (const type of ['tower', 'barracks', 'archeryrange', 'harbour', 'cartworkshop'] as const) {
      expect(buildingUpgradeCost(type, 3).iron).toBe(0);
    }
  });

  it('the start buildings cost no brick at levels 1-5 (Clay Brickworks: level 1), the normal brick after', () => {
    for (const type of ['longhouse', 'tower', 'lumberjack', 'reindeerherder'] as const) {
      for (let level = 1; level <= 5; level++) expect(buildingUpgradeCost(type, level).stone, `${type} ${level}`).toBe(0);
      expect(buildingUpgradeCost(type, 6).stone, `${type} 6`).toBeGreaterThan(0);
    }
    expect(buildingUpgradeCost('claybrickworks', 1).stone).toBe(0);
    expect(buildingUpgradeCost('claybrickworks', 2).stone).toBe(10);
    expect(buildingUpgradeCost('lumberjack', 1)).toEqual({ wood: 10, stone: 0, food: 18, iron: 0 });
  });

  it('niceRound steps by digits: whole below 100, 10s to 999, then 5 * 10^(digits - 3)', () => {
    expect([48, 47.6, 148, 144, 999, 1458, 1476, 12345, 27140, 123456].map(niceRound)).toEqual([
      48, 48, 150, 140, 1000, 1450, 1500, 12500, 27000, 125000,
    ]);
  });

  it('storage houses grow geometrically: 300 * (1.22^L - 1) / 0.22', () => {
    const at = (level: number) =>
      (buildingStatsFor('storagehouse', level, 0).output as { amount: number }).amount;
    expect(at(1)).toBe(300);
    expect(at(2)).toBe(Math.round((300 * (1.22 ** 2 - 1)) / 0.22));
  });

  it('per-building max levels', () => {
    expect(maxLevelFor('longhouse')).toBe(30);
    expect(maxLevelFor('lumberjack')).toBe(25);
    expect(maxLevelFor('storagehouse')).toBe(25);
    expect(maxLevelFor('barracks')).toBe(20);
    expect(maxLevelFor('sawmill')).toBe(20);
    expect(maxLevelFor('tower')).toBe(5);
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

describe('tower vision (mirrors FogVisionRadii.TowerVisibleRadius/TowerExploredRadius)', () => {
  it('shows the visible radius level + 1 and the explored radius level + 3, not the bare level', () => {
    // FogVisionRadii.cs: TowerBorderRadius = level; visible = +1; explored = + ScoutRingHexes (3).
    for (const level of [1, 5, 10]) {
      expect(buildingStatsFor('tower', level).output).toEqual({
        kind: 'visionRing',
        amount: level + 1,
        explored: level + 3,
      });
    }
    expect(towerVisibleRadius(0)).toBe(1);
    expect(towerExploredRadius(0)).toBe(3);
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

describe('greatStorehouseStorageHousesNeeded (mirrors the count rule in Settlement.PlanBuild)', () => {
  it('asks one more maxed Storage House than Great Storehouses held', () => {
    expect([0, 1, 2, 5].map(greatStorehouseStorageHousesNeeded)).toEqual([1, 2, 3, 6]);
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
  it('the bog-ore works makes iron: 4/h at level 1, each level adding 20% more than the last, boosted 10% per bog, creek or lake neighbour up to +50%', () => {
    expect(BOG_ORE_WORKS_IRON_AT_LEVEL_ONE).toBe(4);
    expect(buildingStatsFor('bogoreworks', 1).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 4 });
    expect(buildingStatsFor('bogoreworks', 3).output).toEqual({
      kind: 'resourceRate',
      resource: 'iron',
      amount: Math.round(4 * (1 + 1.2 + 1.2 * 1.2)),
    });
    expect(buildingStatsFor('bogoreworks', 1, 3).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 5 });
    expect(buildingStatsFor('bogoreworks', 1, 3).modifier).toEqual({ kind: 'terrainBoost', terrain: 'bog', percent: 30 });
    // Capped at +50%, like the other producers.
    expect(buildingStatsFor('bogoreworks', 1, 6).output).toEqual({ kind: 'resourceRate', resource: 'iron', amount: 6 });
    expect(buildingStatsFor('bogoreworks', 1, 0).modifier).toBeUndefined();
  });

  it('counts bog and lake neighbours for the bog-ore works, sea and lake for the fishing hut', () => {
    expect(BOOST_TERRAIN.bogoreworks).toEqual(['bog', 'lake']);
    expect(BOOST_TERRAIN.fishinghut).toEqual(['sea', 'lake', 'inlandlake']);
    const mixed = (q: number, r: number): Tile => {
      const kinds: Terrain[] = ['bog', 'lake', 'bog', 'grass', 'grass', 'forest'];
      const index = neighbors({ q: 0, r: 0 }).findIndex((c) => c.q === q && c.r === r);
      return tile(q, r, index >= 0 ? kinds[index]! : 'grass');
    };
    expect(matchingNeighbourCount({ q: 0, r: 0 }, ['bog', 'lake'], mixed)).toBe(3);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, 'bog', mixed)).toBe(2);
  });

  it('counts inland-lake neighbours for the fishing hut like open sea', () => {
    const neighbourhood = terrainMap('inlandlake', 3);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, BOOST_TERRAIN.fishinghut!, neighbourhood)).toBe(3);
    expect(matchingNeighbourCount({ q: 0, r: 0 }, ['sea', 'lake'], neighbourhood)).toBe(0);
  });

  it('stats on a tile: a lake fishing hut boosts by lake water, a coastal one by sea', () => {
    const lakeHut: Tile = { q: 0, r: 0, terrain: 'bog', buildingType: 'fishinghut', bog: { q: 0, r: 0, kind: 'half', inDirections: [], outDirection: null, waterEdges: ['E', 'NE', 'NW'] } };
    const lakeNeighbours = terrainMap('lake', 3);
    expect(buildingStatsAt('fishinghut', 1, lakeHut, lakeNeighbours).modifier).toEqual({ kind: 'terrainBoost', terrain: 'lake', percent: 30 });
    expect(buildingStatsAt('fishinghut', 1, lakeHut, lakeNeighbours).output).toEqual({ kind: 'resourceRate', resource: 'food', amount: 21 });

    const coastHut: Tile = { q: 0, r: 0, terrain: 'sea', buildingType: 'fishinghut' };
    expect(buildingStatsAt('fishinghut', 1, coastHut, terrainMap('sea', 2)).modifier).toEqual({ kind: 'coastal', percent: 20 });
    expect(buildingStatsAt('fishinghut', 1, coastHut, terrainMap('grass', 0)).modifier).toEqual({ kind: 'coastal' });
    expect(buildingStatsAt('lumberjack', 1, tile(0, 0, 'forest'), terrainMap('forest', 4)).output).toEqual({
      kind: 'resourceRate',
      resource: 'wood',
      amount: 11,
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
    expect(buildingUpgradeCost('bogoreworks', 1)).toEqual({ wood: 25, stone: 20, food: 12, iron: 0 });
    expect(buildingUpgradeCost('hammerschmiede', 1)).toEqual({ wood: 59000, stone: 37500, food: 10500, iron: 0 });
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
        expect(d.cost).toEqual(buildingUpgradeCost(type, d.level));
        expect(d.cost.iron).toBe(0);
      }
    }
    for (const d of of('bogoreworks')) {
      const stats = buildingStatsFor('bogoreworks', d.level).output;
      expect(stats).toMatchObject({ kind: 'resourceRate', resource: 'iron' });
      expect(d.productionPerHour.iron).toBeCloseTo(BOG_ORE_WORKS_IRON_AT_LEVEL_ONE * (Math.pow(1.2, d.level) - 1) / 0.2, 6);
      expect(d.productionPerHour.wood + d.productionPerHour.stone + d.productionPerHour.food).toBe(0);
    }
  });

  it('gates the bog-ore works at longhouse 3 behind clay brickworks 3 and the Hammer Forge at 20 behind bog-ore works 10', () => {
    expect(of('bogoreworks')[0]!.requiredLonghouseLevel).toBe(3);
    expect(of('bogoreworks')[0]!.prerequisites).toEqual([{ type: 'claybrickworks', level: 3 }]);
    expect(of('hammerschmiede')[0]!.requiredLonghouseLevel).toBe(20);
    expect(of('hammerschmiede')[0]!.prerequisites).toEqual([{ type: 'bogoreworks', level: 10 }]);
  });

  it('puts the Clay Brickworks on bog in the snapshot too', () => {
    const clay = (catalogueSnapshot.data as BuildingDefinitionResponse[]).find((d) => d.type === 'claybrickworks' && d.level === 1)!;
    expect(clay.allowedTerrain).toEqual(['bog']);
  });
});

describe('speed-corrected upgrade output', () => {
  const rate = (amount: number) => ({ kind: 'resourceRate', resource: 'stone', amount }) as const;

  it('scales a resource rate by the world speed factor and leaves other outputs alone', () => {
    expect(scaleOutput(rate(90), 2)).toEqual(rate(180));
    expect(scaleOutput({ kind: 'storageCapacity', amount: 600 }, 2)).toEqual({ kind: 'storageCapacity', amount: 600 });
  });

  it('splits an upgrade into the gain and the new total, both at world speed', () => {
    expect(upgradeRateGain(rate(75), rate(90), 1)).toEqual({ gain: rate(15), total: 90 });
    expect(upgradeRateGain(rate(75), rate(90), 4)).toEqual({ gain: rate(60), total: 360 });
  });

  it('has no gain for outputs that are not a resource rate', () => {
    const storage = (amount: number) => ({ kind: 'storageCapacity', amount }) as const;
    expect(upgradeRateGain(storage(600), storage(700), 1)).toBeNull();
    expect(upgradeRateGain(undefined, rate(90), 1)).toBeNull();
  });
});

describe('client cost and output formulas against the catalogue snapshot', () => {
  const rows = catalogueSnapshot.data as BuildingDefinitionResponse[];
  const types = ['longhouse', 'tower', 'storagehouse', 'greatstorehouse', 'lumberjack', 'quarry', 'claybrickworks', 'reindeerherder', 'farm', 'pumpkinfarm', 'fishinghut', 'bogoreworks'] as const;

  it('charges exactly the catalogue cost at every level, brick-free levels and rounding included', () => {
    for (const type of types) {
      const levels = rows.filter((d) => d.type === type);
      expect(levels.length, type).toBe(maxLevelFor(type));
      for (const d of levels) expect(buildingUpgradeCost(type, d.level), `${type} ${d.level}`).toEqual(d.cost);
    }
  });

  it('shows the catalogue output at every level (the resource rate, or the storage capacity)', () => {
    for (const type of types) {
      for (const d of rows.filter((r) => r.type === type)) {
        const output = buildingStatsFor(type, d.level).output;
        if (output?.kind === 'resourceRate') expect(output.amount, `${type} ${d.level}`).toBe(Math.round(d.productionPerHour[output.resource]));
        if (output?.kind === 'storageCapacity') expect(output.amount, `${type} ${d.level}`).toBe(Math.round(d.storageCapacity.wood));
      }
    }
  });
});
