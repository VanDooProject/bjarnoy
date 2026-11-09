// Issue #159 part B's anti-drift guard (now also the movement rules: wide rivers and mountains impassable,
// streams a flat 9). src/shared/river-pathing-golden.json
// is read by this suite and by HexPathfinderGoldenTests.cs on the backend —
// each side computes against the same terrain patch and cases using its OWN
// production cost tables/river rule, then asserts the fixture's frozen
// numbers. Either side's cost model drifting from the other turns its own
// suite red instead of the client's range tint quietly disagreeing with what
// the server actually paths over.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/river-pathing-golden.json';
import { coordKey } from '../hex/coords';
import { findPath, hoursFrom, pathCost, reachableRange } from './hexPath';
import { bridgeRestrictions } from './bridgeMovement';
import { palisadeRestrictions } from './palisadeMovement';
import { isWideRiverTile } from './riverGenerator';
const fixture = goldenFixtureJson;
// The same cost table HexPathfinder.cs's LandTerrainCost/RiverCrossingCost
// hardcode — see hexPath.ts's own remarks on why this is a deliberate
// duplicate rather than an import from stores/world.ts (a live world's
// numbers, not this fixture's fixed production reference).
const RULES = {
    land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0 },
    riverCrossingCost: 8.0,
};
function contextFor(fixture, army = 'friendly') {
    const riverByKey = new Map(fixture.riverTiles.map((t) => [coordKey(t), t]));
    const riverAt = (c) => riverByKey.get(coordKey(c));
    const terrainAt = (c) => fixture.terrain[coordKey(c)] ?? 'sea';
    const isWideRiver = (c) => {
        const tile = riverAt(c);
        return tile !== undefined && isWideRiverTile(tile, riverAt);
    };
    const walls = new Map(fixture.walls.map((w) => [coordKey(w), { gate: w.gate, owner: w.owner }]));
    const bridges = new Map(fixture.bridges.filter((b) => b.level >= 1).map((b) => [coordKey(b), { level: b.level, owner: b.owner }]));
    const owner = fixture.walls[0]?.owner ?? '';
    const walker = army === 'friendly' ? owner : army === 'friend' ? 'owner-friend' : 'someone-else';
    // A friend's guild is at peace with the owner's, so the owner is among its friends.
    const friends = new Set(army === 'friend' ? [owner] : []);
    return {
        terrainAt,
        isRiver: (c) => riverByKey.has(coordKey(c)),
        isWideRiver,
        rules: RULES,
        hexesPerHour: 1,
        restrictions: {
            ...palisadeRestrictions(walls, terrainAt, isWideRiver, walker, friends),
            ...bridgeRestrictions(bridges, walker, friends),
        },
    };
}
describe('hexPath golden fixture (issue #159 part B parity)', () => {
    it.each(fixture.findPathCases)('$name: matches the shared golden fixture', (testCase) => {
        const ctx = contextFor(fixture, testCase.army);
        const hours = hoursFrom(testCase.from, ctx, Number.POSITIVE_INFINITY);
        const destinationKey = coordKey(testCase.to);
        if (testCase.expectedPath === null || testCase.expectedCumulativeHours === null) {
            expect(hours.has(destinationKey)).toBe(false);
            return;
        }
        const expectedTotal = testCase.expectedCumulativeHours.at(-1);
        expect(hours.get(destinationKey)).toBeCloseTo(expectedTotal, 9);
        // hexPath.ts reports only the cheapest hour figure per hex, not the path
        // itself (unlike HexPathfinder.FindPath) — cross-check every hex the
        // fixture's expected path visits lands on the exact cumulative hour the
        // backend recorded for it, which is the real parity claim: both sides
        // agree on the cost of the same route, hex for hex.
        testCase.expectedPath.forEach((coord, i) => {
            expect(hours.get(coordKey(coord))).toBeCloseTo(testCase.expectedCumulativeHours[i], 9);
        });
    });
    it.each(fixture.findPathCases.filter((c) => c.isLandUnit))('$name: findPath returns the fixture path and cost', (testCase) => {
        const ctx = contextFor(fixture, testCase.army);
        const path = findPath(testCase.from, testCase.to, ctx);
        if (testCase.expectedPath === null) {
            expect(path).toBeNull();
            return;
        }
        expect(path?.map(coordKey)).toEqual(testCase.expectedPath.map(coordKey));
        expect(pathCost(path, ctx)).toBeCloseTo(testCase.expectedCumulativeHours.at(-1), 9);
    });
    it('covers a wide river and a mountain that stop a land army, and a stream on a mountain at a flat 9', () => {
        const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
        expect(byName.get('wide_river_is_impassable')?.expectedPath).toBeNull();
        expect(byName.get('mountain_with_no_way_round_has_no_route')?.expectedPath).toBeNull();
        expect(byName.get('stream_on_a_mountain_costs_a_flat_9')?.expectedCumulativeHours).toEqual([0, 5, 10]);
    });
    it('covers a gate for the owner and not for an enemy, a half-open end at the ground plus 3 and a sealed end', () => {
        const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
        expect(byName.get('wall_with_a_gate_stops_an_enemy')?.expectedPath).toBeNull();
        expect(byName.get('wall_with_a_gate_lets_the_owner_through')?.expectedCumulativeHours?.at(-1)).toBe(4);
        expect(byName.get('wall_without_a_gate_stops_the_owner_too')?.expectedPath).toBeNull();
        expect(byName.get('half_open_end_is_crossed_by_an_enemy_at_ground_plus_3')?.expectedCumulativeHours?.slice(4, 6)).toEqual([5.5, 8]);
        expect(byName.get('sealed_end_beside_a_mountain_blocks')?.expectedPath).toBeNull();
    });
    it('covers a bridge per level, a guarded bridge for a friend and a stranger, and a foundation that opens nothing', () => {
        const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
        expect(byName.get('bridge_level_1_causeway_crosses_a_wide_river_at_6')?.expectedCumulativeHours).toEqual([0, 3.5, 7]);
        expect(byName.get('bridge_level_2_footbridge_crosses_a_wide_river_at_4')?.expectedCumulativeHours).toEqual([0, 2.5, 5]);
        expect(byName.get('bridge_level_3_kings_bridge_costs_1_5_whatever_the_ground')?.expectedCumulativeHours?.[1]).toBeCloseTo(1.25, 9);
        expect(byName.get('bridge_level_4_guarded_bridge_lets_a_friend_over')?.expectedPath).not.toBeNull();
        expect(byName.get('bridge_level_4_guarded_bridge_stops_a_stranger')?.expectedPath).toBeNull();
        expect(byName.get('bridge_foundation_opens_nothing')?.expectedPath).toBeNull();
    });
    it('covers a half-and-half step, an army under its own wall and an army on a burnt bridge', () => {
        const byName = new Map(fixture.findPathCases.map((c) => [c.name, c]));
        const hours = (name) => byName.get(name)?.expectedCumulativeHours?.map((h) => Math.round(h * 1e9) / 1e9);
        expect(hours('a_step_is_billed_half_and_half_over_forest')).toEqual([0, 1.15, 2.3]);
        expect(hours('an_army_standing_under_its_own_wall_leaves_at_the_ground_price')).toEqual([0, 1.15, 2.15]);
        expect(hours('an_army_standing_on_a_burnt_bridge_leaves_at_12')).toEqual([0, 6.5, 7.5]);
    });
    it.each(fixture.reachableRangeCases)('$name: matches the shared golden fixture', (testCase) => {
        const ctx = contextFor(fixture);
        const range = reachableRange(testCase.origin, testCase.home, testCase.hoursOfFood, ctx);
        const expectedKeys = new Set(testCase.expectedReachable.map((h) => coordKey(h)));
        expect(new Set(range.keys())).toEqual(expectedKeys);
        for (const expected of testCase.expectedReachable) {
            expect(range.get(coordKey(expected))).toBeCloseTo(expected.hours, 9);
        }
    });
});
