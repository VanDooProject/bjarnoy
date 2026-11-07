// Wildlife camp placement's cross-language anti-drift guard (frontend half) —
// `src/shared/camp-placement-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.CampPlacementGoldenTests` (backend): each side computes
// against the same real island (tiles/terrain, river tiles, giant anchors, world
// seed, island index, wasted flag) with its OWN production implementation
// (`placeCamps` here, `CampGenerator.PlaceCore` there), then asserts the
// fixture's frozen, ORDER-SENSITIVE camp list.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/camp-placement-golden.json';
import { coordKey } from '../hex/coords';
import { placeCamps } from './campPlacement';
const fixture = goldenFixtureJson;
describe('camp-placement golden fixture (wildlife camp parity)', () => {
    it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario) => {
        const tiles = scenario.tiles.map(([q, r]) => ({ q, r }));
        const terrainByHex = new Map(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
        const terrainOf = (c) => terrainByHex.get(coordKey(c)) ?? 'sea';
        const rivers = scenario.rivers.map((r) => ({ ...r }));
        const giants = scenario.giants.map(([q, r]) => ({ q, r }));
        const plainBog = new Set(scenario.plainBog.map(([q, r]) => coordKey({ q, r })));
        const actual = placeCamps(tiles, terrainOf, rivers, giants, scenario.worldSeed, scenario.islandIndex, scenario.wasted, plainBog);
        expect(actual.map((p) => ({ q: p.coord.q, r: p.coord.r, family: p.family, level: p.level, orientation: p.orientation }))).toEqual(scenario.camps);
    });
    it('covers the shapes the rules care about', () => {
        const families = new Set(fixture.scenarios.flatMap((s) => s.camps.map((c) => c.family)));
        expect(families).toContain('bearrapids');
        expect(families).toContain('fenrirbrood');
        const wasted = fixture.scenarios.filter((s) => s.wasted);
        expect(wasted.length).toBeGreaterThan(0);
        for (const s of wasted)
            expect(s.camps.every((c) => c.family === 'fenrirbrood')).toBe(true);
    });
    it('places bog camps, on plain bog moss only', () => {
        const scenario = fixture.scenarios.find((s) => s.name === 'green_island_bog_camps');
        const bogFamilies = new Set(['moosemire', 'beaverlodge', 'cranedance']);
        const bogCamps = scenario.camps.filter((c) => bogFamilies.has(c.family));
        expect(bogCamps.length).toBeGreaterThanOrEqual(2);
        const plain = new Set(scenario.plainBog.map(([q, r]) => coordKey({ q, r })));
        for (const camp of bogCamps)
            expect(plain.has(coordKey({ q: camp.q, r: camp.r }))).toBe(true);
    });
});
