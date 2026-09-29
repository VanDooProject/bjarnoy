// Mirrors the backend's BuildingCatalogueTests (BoostMultiplier_* cases) so
// the frontend's display formula can't silently drift from the
// server-authoritative one in BuildingCatalogue.cs.
import { describe, expect, it } from 'vitest';
import {
  buildingStatsFor,
  buildingUpgradeCost,
  isNearAnyOf,
  matchingNeighbourCount,
  maxLevelFor,
  radiusBoostPercent,
  radiusBoostRange,
} from './buildingEconomy';
import { neighbors } from '../hex/coords';
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

  it('magictower matches BuildingCatalogue.cs’s 6 iron/level', () => {
    expect(buildingStatsFor('magictower', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'iron', amount: 6 },
      modifier: { kind: 'arcane' },
    });
  });

  it('fisherhut ignores terrain adjacency, like farm/pumpkinfarm', () => {
    expect(buildingStatsFor('fisherhut', 1, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 42 },
      workers: { cap: 4 },
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

  it('smithy has no production/storage of its own yet', () => {
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
