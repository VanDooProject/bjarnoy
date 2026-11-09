// The endgame map's cross-language anti-drift guard (frontend half) — `src/shared/endgame-placement-golden.json` is read by this
// suite and by `Bjarnoy.Domain.Tests.EndgamePlacementGoldenTests` (backend): each side computes against the same real wasted island
// (tiles/terrain, river tiles, giants, camp hexes, world seed, island index) with its OWN production implementation
// (`placeEndgame` here, `EndgameGenerator.PlaceCore` there), then asserts the fixture's frozen, ORDER-SENSITIVE wall and tower lists.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/endgame-placement-golden.json';
import { coordKey } from '../hex/coords';
import { placeEndgame } from './endgamePlacement';
const fixture = goldenFixtureJson;
function run(scenario) {
    const tiles = scenario.tiles.map(([q, r]) => ({ q, r }));
    const terrainByHex = new Map(scenario.tiles.map(([q, r, terrain]) => [coordKey({ q, r }), terrain]));
    const rivers = new Set(scenario.rivers.map(([q, r]) => coordKey({ q, r })));
    return placeEndgame(tiles, (c) => terrainByHex.get(coordKey(c)) ?? 'sea', (c) => rivers.has(coordKey(c)), scenario.giants.map((g) => ({ anchor: { q: g.q, r: g.r }, family: g.family })), new Set(scenario.camps.map(([q, r]) => coordKey({ q, r }))), scenario.worldSeed, scenario.islandIndex);
}
describe('endgame-placement golden fixture (Utgard walls and Jötun watchtowers parity)', () => {
    it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario) => {
        const actual = run(scenario);
        expect(actual.walls.map((w) => ({ q: w.coord.q, r: w.coord.r, ring: w.ring, piece: w.piece, dir: w.dir, gate: w.isGate, level: w.level }))).toEqual(scenario.walls);
        expect(actual.towers.map((t) => [t.q, t.r])).toEqual(scenario.towers);
    });
    it('covers the shapes the rules care about', () => {
        const rings = (s) => new Set(s.walls.map((w) => w.ring)).size;
        expect(fixture.scenarios.some((s) => rings(s) === 2)).toBe(true);
        expect(fixture.scenarios.some((s) => rings(s) === 1)).toBe(true);
        expect(fixture.scenarios.some((s) => s.walls.some((w) => w.gate))).toBe(true);
        expect(fixture.scenarios.some((s) => s.walls.some((w) => w.piece === 'end_coast'))).toBe(true);
        expect(fixture.scenarios.some((s) => s.towers.length === 6)).toBe(true);
    });
});
