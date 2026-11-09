import { describe, expect, it } from 'vitest';
import { armyOverlayMovement, foreignArmyMarker } from './armyOverlay';
import { GUILD_REALM_COLOR, RIVAL_REALM_COLOR } from './realmColours';
const army = {
    id: 'army-x',
    settlementId: 'rival-1',
    isFleet: true,
    position: { q: 3, r: 0 },
    movement: {
        departedAt: '2026-01-01T04:00:00Z',
        path: [
            { q: 3, r: 0 },
            { q: 2, r: 0 },
        ],
        cumulativeHours: [0, 1],
        edgeHours: [0, 0.5],
        arrivesAt: '2026-01-01T05:00:00Z',
    },
};
function owner(patch) {
    return { id: 'rival-1', ownerId: 'them', ownerName: 'x', name: 'n', q: 9, r: 9, level: 1, foundedAt: 0, ...patch };
}
describe('foreignArmyMarker', () => {
    it('is a foreign, never selected marker on the stretch it was given, ship or flag as sent', () => {
        const marker = foreignArmyMarker(army, owner({}), 'me');
        expect(marker).toMatchObject({ id: 'army-x', foreign: true, selected: false, returning: false, isFleet: true, position: { q: 3, r: 0 } });
        expect(marker.movement).toEqual({
            path: [
                { q: 3, r: 0 },
                { q: 2, r: 0 },
            ],
            cumulativeHours: [0, 1],
            edgeHours: [0, 0.5],
            departedAtMs: Date.parse('2026-01-01T04:00:00Z'),
            arrivesAtMs: Date.parse('2026-01-01T05:00:00Z'),
        });
    });
    it('wears the colour of its owner relative to the player', () => {
        expect(foreignArmyMarker(army, owner({ relation: 'guild' }), 'me').color).toBe(GUILD_REALM_COLOR);
        expect(foreignArmyMarker(army, owner({}), 'me').color).toBe(RIVAL_REALM_COLOR);
        expect(foreignArmyMarker(army, undefined, 'me').color).toBe(RIVAL_REALM_COLOR);
    });
});
describe('armyOverlayMovement', () => {
    it('falls back to empty schedules when the hours are missing', () => {
        const m = armyOverlayMovement({ path: [{ q: 0, r: 0 }], departedAt: '2026-01-01T00:00:00Z', arrivesAt: '2026-01-01T00:00:00Z' });
        expect(m.cumulativeHours).toEqual([]);
        expect(m.edgeHours).toEqual([]);
    });
});
