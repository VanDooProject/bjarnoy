// Mirrors the backend's BuildingCatalogueTests (BoostMultiplier_* cases) so
// the frontend's display formula can't silently drift from the
// server-authoritative one in BuildingCatalogue.cs.
import { describe, expect, it } from 'vitest';
import { buildingStatsFor, isNearAnyOf, matchingNeighbourCount } from './buildingEconomy';
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
    expect(buildingStatsFor('lumberjack', 1, 0)).toEqual({ output: '+30 wood/h', modifier: undefined });
  });

  it('lumberjack caps at +50% (5 neighbours), same as 6', () => {
    const five = buildingStatsFor('lumberjack', 1, 5);
    const six = buildingStatsFor('lumberjack', 1, 6);
    expect(five).toEqual({ output: '+45 wood/h', modifier: 'Forest (+50%)' });
    expect(six).toEqual(five);
  });

  it('quarry scales the same curve off stone', () => {
    expect(buildingStatsFor('quarry', 1, 0)).toEqual({ output: '+24 stone/h', modifier: undefined });
    expect(buildingStatsFor('quarry', 1, 3)).toEqual({ output: '+31 stone/h', modifier: 'Mountain (+30%)' });
  });

  it('fishinghut is boosted by open sea, not the coastal flag alone', () => {
    expect(buildingStatsFor('fishinghut', 1, 0)).toEqual({ output: '+30 food/h', modifier: 'Coastal' });
    expect(buildingStatsFor('fishinghut', 1, 2)).toEqual({
      output: '+36 food/h',
      modifier: 'Coastal (+20%)',
    });
  });

  it('farm and pumpkinfarm ignore terrain adjacency entirely, matching Boosts excluding them', () => {
    // BuildingCatalogue.cs: Farm 36/level, PumpkinFarm 36/level, neither in Boosts.
    expect(buildingStatsFor('farm', 1, 6)).toEqual({ output: '+36 food/h', workers: '4/4' });
    expect(buildingStatsFor('pumpkinfarm', 2, 6)).toEqual({ output: '+72 food/h', workers: '8/8' });
  });

  it('magictower matches BuildingCatalogue.cs’s 6 iron/level', () => {
    expect(buildingStatsFor('magictower', 1, 0)).toEqual({ output: '+6 iron/h', modifier: 'Arcane' });
  });

  it('fisherhut ignores terrain adjacency, like farm/pumpkinfarm', () => {
    expect(buildingStatsFor('fisherhut', 1, 6)).toEqual({ output: '+32 food/h', workers: '4/4' });
  });

  it('sawmill scales 10%/matching forest neighbour, mirroring lumberjack', () => {
    expect(buildingStatsFor('sawmill', 1, 0)).toEqual({ output: '+26 wood/h', modifier: undefined });
    expect(buildingStatsFor('sawmill', 1, 5)).toEqual({ output: '+39 wood/h', modifier: 'Forest (+50%)' });
  });

  it('barracks has no production/storage of its own yet', () => {
    expect(buildingStatsFor('barracks', 1, 0)).toEqual({ modifier: 'Garrison' });
  });
});
