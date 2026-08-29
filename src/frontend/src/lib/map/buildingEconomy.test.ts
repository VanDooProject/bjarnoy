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
    expect(buildingStatsFor('lumberjack', 1, false, 0)).toEqual({ output: '+30 wood/h', modifier: undefined });
  });

  it('lumberjack caps at +50% (5 neighbours), same as 6', () => {
    const five = buildingStatsFor('lumberjack', 1, false, 5);
    const six = buildingStatsFor('lumberjack', 1, false, 6);
    expect(five).toEqual({ output: '+45 wood/h', modifier: 'Forest (+50%)' });
    expect(six).toEqual(five);
  });

  it('quarry scales the same curve off stone', () => {
    expect(buildingStatsFor('quarry', 1, false, 0)).toEqual({ output: '+24 stone/h', modifier: undefined });
    expect(buildingStatsFor('quarry', 1, false, 3)).toEqual({ output: '+31 stone/h', modifier: 'Mountain (+30%)' });
  });

  it('fishinghut is boosted by open sea, not the coastal flag alone', () => {
    expect(buildingStatsFor('fishinghut', 1, false, 0)).toEqual({ output: '+30 food/h', modifier: 'Coastal' });
    expect(buildingStatsFor('fishinghut', 1, false, 2)).toEqual({
      output: '+36 food/h',
      modifier: 'Coastal (+20%)',
    });
  });

  it("farm's irrigation bonus is untouched by the new matchingNeighbours parameter", () => {
    expect(buildingStatsFor('farm', 1, true, 6)).toEqual({
      output: '+132 food/h',
      modifier: 'Irrigated (+10%)',
      workers: '4/4',
    });
  });
});
