import { describe, expect, it } from 'vitest';
import { BRIDGE_LEVELS, BRIDGE_UNLOCK, GROUND_COSTS, RIVER_CROSSING_COST, STREAM_COST, WALL_END_COST, formatMinutes, minutesPerHex, strongCampGuardRange, } from './landMovementDocs';
import { pathCost } from '../map/hexPath';
import { bridgeRestrictions } from '../map/bridgeMovement';
import { maxLevelFor } from '../map/buildingEconomy';
// Grass, the hex under test, grass: a step is billed half and half, so the whole walk costs the hex's price plus the grass hexes'
// two halves (1.0). Priced by the real pathfinder, to hold the mirrored table against hexPath.ts.
const WALK = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
function stepCostOf(terrain, river = false, wide = false) {
    const ctx = {
        terrainAt: (c) => (c.q === 1 ? terrain : 'grass'),
        isRiver: (c) => river && c.q === 1,
        isWideRiver: (c) => wide && c.q === 1,
        rules: {
            land: Object.fromEntries(GROUND_COSTS.map((g) => [g.terrain, g.cost])),
            riverCrossingCost: RIVER_CROSSING_COST,
        },
        hexesPerHour: 1,
    };
    return pathCost(WALK, ctx) - 1;
}
describe('landMovementDocs', () => {
    it('prices each ground the way the pathfinder does', () => {
        for (const g of GROUND_COSTS)
            expect(stepCostOf(g.terrain), g.terrain).toBeCloseTo(g.cost, 9);
    });
    it('charges a stream a flat 9 whatever it runs over, and refuses a wide river and a mountain', () => {
        expect(STREAM_COST).toBe(9);
        expect(stepCostOf('grass', true)).toBeCloseTo(STREAM_COST, 9);
        expect(stepCostOf('bog', true)).toBeCloseTo(STREAM_COST, 9);
        expect(stepCostOf('mountain')).toBe(Infinity);
        expect(stepCostOf('grass', true, true)).toBe(Infinity);
    });
    it('prices the open end of a wall at 3 on top of the ground', () => {
        expect(WALL_END_COST).toBe(3);
    });
    it('works out minutes per hex from cost and speed', () => {
        expect(minutesPerHex(1, 4)).toBe(15);
        expect(minutesPerHex(2, 5)).toBe(24);
        expect(minutesPerHex(1, 1.5)).toBe(40);
    });
    it('writes minutes below an hour as minutes and above as hours and minutes', () => {
        expect(formatMinutes(15)).toBe('15 min');
        expect(formatMinutes(16.5)).toBe('16.5 min');
        expect(formatMinutes(135)).toBe('2 h 15 min');
        expect(formatMinutes(120)).toBe('2 h');
        expect(formatMinutes(16.5, 'de')).toBe('16,5 min');
    });
    it('makes a strong camp guard 2 plus its level hexes', () => {
        expect([1, 5].map(strongCampGuardRange)).toEqual([3, 7]);
    });
    describe('bridges', () => {
        const rules = { land: Object.fromEntries(GROUND_COSTS.map((g) => [g.terrain, g.cost])), riverCrossingCost: RIVER_CROSSING_COST };
        // The price of a wide-river hex that a bridge of `level` (owned by OWNER) spans, walked by `walker`.
        function bridgeStep(level, walker, ground = 'grass') {
            const terrainAt = (c) => (c.q === 1 ? ground : 'grass');
            const bridges = new Map([['1,0', { level, owner: 'owner' }]]);
            const ctx = {
                terrainAt,
                isRiver: (c) => c.q === 1,
                isWideRiver: (c) => c.q === 1,
                rules,
                hexesPerHour: 1,
                restrictions: bridgeRestrictions(bridges, walker, new Set(['friend'])),
            };
            return pathCost(WALK, ctx) - 1;
        }
        it('lists the four levels the pathfinder prices: 6, 4, 1.5 and 1.5', () => {
            expect(BRIDGE_LEVELS.map((b) => b.level)).toEqual([1, 2, 3, 4]);
            expect(BRIDGE_LEVELS.map((b) => b.cost)).toEqual([6, 4, 1.5, 1.5]);
            expect(maxLevelFor('bridge')).toBe(BRIDGE_LEVELS.length);
            for (const b of BRIDGE_LEVELS) {
                if (b.everyone)
                    expect(bridgeStep(b.level, 'stranger'), `level ${b.level}`).toBeCloseTo(b.cost, 9);
            }
        });
        it('lets every army over levels 1 to 3, prices levels 3 and 4 at 1.5 on any ground, and lets only friends over the guarded one', () => {
            for (const ground of ['grass', 'sand', 'forest']) {
                expect(bridgeStep(3, 'stranger', ground)).toBeCloseTo(1.5, 9);
                expect(bridgeStep(4, 'owner', ground)).toBeCloseTo(1.5, 9);
                expect(bridgeStep(4, 'stranger', ground)).toBe(Infinity);
            }
            expect(BRIDGE_LEVELS.filter((b) => !b.everyone).map((b) => b.level)).toEqual([4]);
            expect(bridgeStep(1, 'stranger')).toBeCloseTo(6, 9);
        });
        it('unlocks at Longhouse 7 behind a level-1 Town Square', () => {
            expect(BRIDGE_UNLOCK).toEqual({ longhouse: 7, townSquare: 1 });
        });
    });
});
