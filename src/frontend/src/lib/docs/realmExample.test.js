import { describe, expect, it } from 'vitest';
import { coordKey, hexesInRadius } from '../hex/coords';
import { claimDiscs } from '../map/shoreline';
import { StaticWorldModel } from '../map/StaticWorldModel';
import { REALM_EXAMPLE_BOG_TOWER, REALM_EXAMPLE_FOREST_TOWER, REALM_EXAMPLE_LONGHOUSE, REALM_EXAMPLE_LONGHOUSE_LEVEL, REALM_EXAMPLE_PLAYER, REALM_EXAMPLE_SETTLEMENT, REALM_EXAMPLE_STEPS, applyRealmExampleStep, buildRealmExampleGround, realmExampleClaimed, } from './realmExample';
/** The realm the rule gives for these towers: every hex within a claim disc of the longhouse or a tower. */
function expectedClaim(step) {
    const discs = claimDiscs(REALM_EXAMPLE_LONGHOUSE, REALM_EXAMPLE_LONGHOUSE_LEVEL, REALM_EXAMPLE_STEPS[step].map((t) => ({ ...t.coord, level: t.level })));
    const inLayout = new Set(buildRealmExampleGround().map(coordKey));
    const claimed = new Set();
    for (const d of discs) {
        for (const c of hexesInRadius(d, d.radius))
            if (inLayout.has(coordKey(c)))
                claimed.add(coordKey(c));
    }
    return claimed;
}
function show(step) {
    const world = new StaticWorldModel();
    applyRealmExampleStep(world, step);
    return world;
}
describe('the realm example island', () => {
    const ground = buildRealmExampleGround();
    const terrainAt = (c) => ground.find((t) => t.q === c.q && t.r === c.r);
    it('has every ground the page talks about, and the longhouse on grass', () => {
        const terrains = new Set(ground.map((t) => t.terrain));
        for (const terrain of ['grass', 'forest', 'bog', 'sand', 'mountain', 'sea'])
            expect(terrains, terrain).toContain(terrain);
        expect(terrainAt(REALM_EXAMPLE_LONGHOUSE).terrain).toBe('grass');
    });
    it('puts the towers on ground a tower may stand on: forest and plain bog moss', () => {
        expect(terrainAt(REALM_EXAMPLE_FOREST_TOWER.coord).terrain).toBe('forest');
        const bog = terrainAt(REALM_EXAMPLE_BOG_TOWER.coord);
        expect(bog.terrain).toBe('bog');
        expect(bog.bog?.kind).toBe('bog');
    });
    it.each([0, 1, 2])('step %i: the model claims exactly the union of the longhouse and tower discs', (step) => {
        const claimed = new Set(realmExampleClaimed(show(step)).map(coordKey));
        expect(claimed).toEqual(expectedClaim(step));
    });
    it('step 1 is the longhouse alone: radius 3, 37 hexes', () => {
        expect(realmExampleClaimed(show(0))).toHaveLength(37);
    });
    it('the first tower stands on the edge of the longhouse claim and pushes the border out', () => {
        const before = expectedClaim(0);
        expect(before.has(coordKey(REALM_EXAMPLE_FOREST_TOWER.coord))).toBe(true);
        const after = expectedClaim(1);
        expect(after.size).toBeGreaterThan(before.size);
        for (const k of before)
            expect(after.has(k)).toBe(true);
    });
    it('the second tower stands inside the first one\'s ground, outside the longhouse\'s own, and pushes further', () => {
        const bogKey = coordKey(REALM_EXAMPLE_BOG_TOWER.coord);
        expect(expectedClaim(0).has(bogKey)).toBe(false);
        expect(expectedClaim(1).has(bogKey)).toBe(true);
        expect(expectedClaim(2).size).toBeGreaterThan(expectedClaim(1).size);
    });
    it('draws the realm as the viewer\'s own: the tiles carry the settlement that belongs to the viewer', () => {
        const world = show(2);
        expect(world.getSettlement(REALM_EXAMPLE_SETTLEMENT)?.ownerId).toBe(REALM_EXAMPLE_PLAYER);
        expect(world.getTile(REALM_EXAMPLE_LONGHOUSE.q, REALM_EXAMPLE_LONGHOUSE.r)).toMatchObject({ buildingType: 'longhouse', buildingLevel: 2 });
        expect(world.getTile(REALM_EXAMPLE_FOREST_TOWER.coord.q, REALM_EXAMPLE_FOREST_TOWER.coord.r)).toMatchObject({ buildingType: 'tower', buildingLevel: 2, terrain: 'forest' });
        expect(world.getTile(REALM_EXAMPLE_BOG_TOWER.coord.q, REALM_EXAMPLE_BOG_TOWER.coord.r)).toMatchObject({ buildingType: 'tower', buildingLevel: 1, terrain: 'bog' });
    });
    it('can go back a step: the border shrinks again and the second tower is gone', () => {
        const world = show(2);
        applyRealmExampleStep(world, 0);
        expect(new Set(realmExampleClaimed(world).map(coordKey))).toEqual(expectedClaim(0));
        const bog = REALM_EXAMPLE_BOG_TOWER.coord;
        expect(world.getTile(bog.q, bog.r).buildingType).toBeUndefined();
    });
});
