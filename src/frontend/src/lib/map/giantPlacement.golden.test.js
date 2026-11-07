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
import { coordKey } from '../hex/coords';
import { placeGiants } from './giantPlacement';
const fixture = goldenFixtureJson;
describe('giant-placement golden fixture (giant placement v2 parity)', () => {
    it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario) => {
        const tiles = scenario.tiles.map(([q, r]) => ({ q, r }));
        const terrainByHex = new Map(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
        const terrainOf = (c) => terrainByHex.get(coordKey(c)) ?? 'sea';
        const riverKeys = new Set(scenario.rivers.map(([q, r]) => coordKey({ q, r })));
        const isRiver = (c) => riverKeys.has(coordKey(c));
        const actual = placeGiants(tiles, terrainOf, scenario.worldSeed, scenario.islandIndex, isRiver, scenario.wasted ?? false);
        expect(actual.map((p) => ({ q: p.anchor.q, r: p.anchor.r, family: p.family }))).toEqual(scenario.giants);
    });
});
