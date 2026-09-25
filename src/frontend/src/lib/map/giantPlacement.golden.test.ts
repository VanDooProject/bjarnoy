// Giant placement v2's cross-language anti-drift guard (frontend half) —
// `src/shared/giant-placement-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.GiantPlacementGoldenTests` (backend) — each side
// computes against the same synthetic island (tiles/terrain, rivers, world
// seed, island index) using its OWN production placement implementation
// (`placeGiants` here, `GiantGenerator.PlaceCore` there), then asserts the
// fixture's frozen, ORDER-SENSITIVE giants list. Mirrors
// `territory.golden.test.ts`'s own pattern for loading a
// `src/shared/*.json` fixture.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/giant-placement-golden.json';
import type { AxialCoord } from '../hex/coords';
import { coordKey } from '../hex/coords';
import { placeGiants } from './giantPlacement';
import type { Terrain } from './types';

interface Scenario {
  name: string;
  worldSeed: number;
  islandIndex: number;
  tiles: [number, number, Terrain][];
  rivers: [number, number][];
  giants: { q: number; r: number; family: string }[];
}

interface GoldenFixture {
  scenarios: Scenario[];
}

const fixture = goldenFixtureJson as unknown as GoldenFixture;

describe('giant-placement golden fixture (giant placement v2 parity)', () => {
  it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario: Scenario) => {
    const tiles: AxialCoord[] = scenario.tiles.map(([q, r]) => ({ q, r }));
    const terrainByHex = new Map<string, Terrain>(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
    const terrainOf = (c: AxialCoord): Terrain => terrainByHex.get(coordKey(c)) ?? 'sea';

    const riverKeys = new Set(scenario.rivers.map(([q, r]) => coordKey({ q, r })));
    const isRiver = (c: AxialCoord) => riverKeys.has(coordKey(c));

    const actual = placeGiants(tiles, terrainOf, scenario.worldSeed, scenario.islandIndex, isRiver);

    expect(actual.map((p) => ({ q: p.anchor.q, r: p.anchor.r, family: p.family }))).toEqual(scenario.giants);
  });
});
