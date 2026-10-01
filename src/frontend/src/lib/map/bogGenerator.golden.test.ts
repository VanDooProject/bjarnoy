// Bog generation's cross-language anti-drift guard (frontend half) — `src/shared/bog-generation-golden.json` is
// read by this suite and by `Bjarnoy.Domain.Tests.BogGenerationGoldenTests` (backend): each side generates the
// rivers and the bogland of the same real island (tiles with seed terrain, world seed, island index) with its OWN
// production implementation (`generateRiversWithBogs` here, `RiverGenerator.GenerateWithBogs` there) and asserts
// the fixture's frozen, ORDER-SENSITIVE lists.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/bog-generation-golden.json';
import { coordKey, type AxialCoord } from '../hex/coords';
import { DEFAULT_GENERATION, islandDepthAt, terrainAt, type WorldSeed } from './worldGenerator';
import { generateRiversWithBogs } from './riverGenerator';
import { checkBogRules, totalViolations } from './bogRules';
import type { BogTileKind, RiverTileShape, Terrain, TileOrientation } from './types';

interface Scenario {
  name: string;
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  rivers: {
    q: number;
    r: number;
    shape: RiverTileShape;
    inDirections: TileOrientation[];
    outDirection: TileOrientation | null;
    width: 'river' | 'stream' | 'widen' | 'riverstream';
  }[];
  bogs: {
    q: number;
    r: number;
    kind: BogTileKind;
    inDirections: TileOrientation[];
    outDirection: TileOrientation | null;
    waterEdges: TileOrientation[];
  }[];
}

const fixture = goldenFixtureJson as unknown as { scenarios: Scenario[] };

describe('bog-generation golden fixture (bog generation parity)', () => {
  it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario: Scenario) => {
    const tiles: AxialCoord[] = scenario.tiles.map(([q, r]) => ({ q, r }));
    const terrainByHex = new Map<string, Terrain>(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
    const terrainOf = (c: AxialCoord): Terrain => terrainByHex.get(coordKey(c)) ?? 'sea';
    const world: WorldSeed = { seed: scenario.worldSeed, generation: { ...DEFAULT_GENERATION, worldRadius: 1000 } };

    const actual = generateRiversWithBogs(
      tiles,
      terrainOf,
      (c) => islandDepthAt(c.q, c.r, world),
      (c) => terrainAt(c.q, c.r, world) !== 'sea',
      scenario.worldSeed,
      scenario.islandIndex,
    );

    expect(actual.rivers.map(({ wasted: _wasted, ...tile }) => tile)).toEqual(scenario.rivers);
    expect(actual.bogs).toEqual(scenario.bogs);

    // The frozen result is also a legal bog: the rules hold on it.
    expect(totalViolations(checkBogRules(actual.bogs, actual.rivers, (c) => terrainAt(c.q, c.r, world)))).toBe(0);
  });

  it('covers a plain lake, a sink, a spawn, an enclosed pocket and two lakes', () => {
    const names = fixture.scenarios.map((s) => s.name);
    expect(names).toEqual([
      'green_island_through_lake',
      'green_island_sunk_river',
      'green_island_spawned_river',
      'green_island_enclosed_pocket',
      'green_island_two_lakes',
    ]);
    const kinds = (name: string) => new Set(fixture.scenarios.find((s) => s.name === name)!.bogs.map((b) => b.kind));
    expect(kinds('green_island_spawned_river')).toContain('creekspring');
    for (const s of fixture.scenarios) {
      expect(kinds(s.name)).toContain('lake');
      // A lake on land has its through river's mouths; an enclosed pocket has one only when a river could be sunk into it.
      if (s.name !== 'green_island_enclosed_pocket') expect(kinds(s.name)).toContain('mouth');
    }
  });
});
