// The whale road's cross-language anti-drift guard (frontend half) — `src/shared/whale-placement-golden.json` is
// read by this suite and by `Bjarnoy.Domain.Tests.WhalePlacementGoldenTests` (backend): each side computes the sea
// pass of the same island (its tiles plus the land of the islands around it, a world seed, an island index) with
// its OWN production implementation (`placeWhaleRoads` here, `CampGenerator.PlaceWhaleRoads` there), then asserts
// the fixture's frozen, ORDER-SENSITIVE camp list.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/whale-placement-golden.json';
import { coordKey, type AxialCoord } from '../hex/coords';
import { placeWhaleRoads } from './campPlacement';

interface Scenario {
  name: string;
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number][];
  otherLand: [number, number][];
  camps: { q: number; r: number; family: string; level: number }[];
}

const fixture = goldenFixtureJson as unknown as { scenarios: Scenario[] };

function run(scenario: Scenario, withOthers: boolean) {
  const tiles: AxialCoord[] = scenario.tiles.map(([q, r]) => ({ q, r }));
  const land = new Set<string>(scenario.tiles.map(([q, r]) => coordKey({ q, r })));
  if (withOthers) for (const [q, r] of scenario.otherLand) land.add(coordKey({ q, r }));
  return placeWhaleRoads(tiles, (c) => land.has(coordKey(c)), scenario.worldSeed, scenario.islandIndex);
}

describe('whale-placement golden fixture (water camp parity)', () => {
  it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario: Scenario) => {
    expect(run(scenario, true).map((p) => ({ q: p.coord.q, r: p.coord.r, family: p.family, level: p.level }))).toEqual(
      scenario.camps,
    );
  });

  it('covers neighbouring land that changes the answer', () => {
    const scenario = fixture.scenarios.find((s) => s.name === 'green_island_with_neighbours')!;
    expect(scenario.otherLand.length).toBeGreaterThan(0);
    const alone = run(scenario, false).map((p) => coordKey(p.coord));
    expect(alone).not.toEqual(scenario.camps.map((c) => coordKey(c)));
  });
});
