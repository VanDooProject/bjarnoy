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
    expect(buildingStatsFor('lumberjack', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'wood', amount: 30 },
      modifier: undefined,
    });
  });

  it('lumberjack caps at +50% (5 neighbours), same as 6', () => {
    const five = buildingStatsFor('lumberjack', 1, 5);
    const six = buildingStatsFor('lumberjack', 1, 6);
    expect(five).toEqual({
      output: { kind: 'resourceRate', resource: 'wood', amount: 45 },
      modifier: { kind: 'terrainBoost', terrain: 'forest', percent: 50 },
    });
    expect(six).toEqual(five);
  });

  it('quarry scales the same curve off stone', () => {
    expect(buildingStatsFor('quarry', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 24 },
      modifier: undefined,
    });
    expect(buildingStatsFor('quarry', 1, 3)).toEqual({
      output: { kind: 'resourceRate', resource: 'stone', amount: 31 },
      modifier: { kind: 'terrainBoost', terrain: 'mountain', percent: 30 },
    });
  });

  it('fishinghut is boosted by open sea, not the coastal flag alone', () => {
    expect(buildingStatsFor('fishinghut', 1, 0)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 30 },
      modifier: { kind: 'coastal' },
    });
    expect(buildingStatsFor('fishinghut', 1, 2)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 36 },
      modifier: { kind: 'coastal', percent: 20 },
    });
  });

  it('farm and pumpkinfarm ignore terrain adjacency entirely, matching Boosts excluding them', () => {
    // BuildingCatalogue.cs: Farm 36/level, PumpkinFarm 44/level (the bonus,
    // Pumpkin-soil-only crop yields more), neither in Boosts.
    expect(buildingStatsFor('farm', 1, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 36 },
      workers: { cap: 4 },
    });
    expect(buildingStatsFor('pumpkinfarm', 2, 6)).toEqual({
      output: { kind: 'resourceRate', resource: 'food', amount: 88 },
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
      output: { kind: 'resourceRate', resource: 'food', amount: 32 },
      workers: { cap: 4 },
    });
  });

  it('sawmill has no production of its own — it boosts Lumberjack within range instead', () => {
    expect(buildingStatsFor('sawmill', 1, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'wood' },
    });
    expect(buildingStatsFor('sawmill', 10, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 100, range: 5, resource: 'wood' },
    });
    // Sawmill's own neighbours no longer matter — it has nothing left for a
    // terrain-adjacency boost to multiply.
    expect(buildingStatsFor('sawmill', 1, 6)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'wood' },
    });
  });

  it('cropmill has no production of its own — it boosts Farm/PumpkinFarm within range instead', () => {
    expect(buildingStatsFor('cropmill', 1, 0)).toEqual({
      modifier: { kind: 'radiusBoost', percent: 5, range: 1, resource: 'food' },
    });
    expect(buildingStatsFor('cropmill', 10, 0)).toEqual({
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
