import { beforeEach, describe, expect, it } from 'vitest';
import { introLoad, mapLoadFraction, reportIntroLoad } from './introLoad';
describe('mapLoadFraction', () => {
    it('is 0 while no group has reported', () => {
        expect(mapLoadFraction({ terrain: null, buildings: null, animations: null }, false)).toBe(0);
    });
    it('sums loaded over total across the tile groups that reported', () => {
        expect(mapLoadFraction({ terrain: { loaded: 2, total: 4 }, buildings: { loaded: 1, total: 4 }, animations: null }, false)).toBe(3 / 8);
    });
    it('ignores the animations: the button does not wait for them', () => {
        expect(mapLoadFraction({ terrain: { loaded: 4, total: 4 }, buildings: { loaded: 0, total: 4 }, animations: { loaded: 1, total: 8 } }, false)).toBe(4 / 8);
        expect(mapLoadFraction({ terrain: null, buildings: null, animations: { loaded: 3, total: 8 } }, false)).toBe(0);
    });
    it('ignores a group that reported a zero total', () => {
        expect(mapLoadFraction({ terrain: { loaded: 0, total: 0 }, buildings: null, animations: null }, false)).toBe(0);
    });
    it('stays below 1 while the groups are done but the tiles are not loaded', () => {
        const f = mapLoadFraction({ terrain: { loaded: 4, total: 4 }, buildings: { loaded: 4, total: 4 }, animations: null }, false);
        expect(f).toBeLessThan(1);
        expect(Math.floor(f * 100)).toBe(99);
    });
    it('is 1 once the tiles are loaded, whatever the groups say', () => {
        expect(mapLoadFraction({ terrain: { loaded: 1, total: 4 }, buildings: null, animations: null }, true)).toBe(1);
        expect(mapLoadFraction({ terrain: null, buildings: null, animations: null }, true)).toBe(1);
    });
});
describe('reportIntroLoad', () => {
    beforeEach(() => {
        introLoad.terrain = null;
        introLoad.buildings = null;
        introLoad.animations = null;
    });
    it('never moves a group backwards for the same total', () => {
        reportIntroLoad('terrain', { loaded: 5, total: 7 });
        reportIntroLoad('terrain', { loaded: 2, total: 7 });
        expect(introLoad.terrain).toEqual({ loaded: 5, total: 7 });
        reportIntroLoad('terrain', { loaded: 6, total: 7 });
        expect(introLoad.terrain).toEqual({ loaded: 6, total: 7 });
    });
    it('keeps the fraction monotonic over the whole load (no drop when the buildings start)', () => {
        const fractions = [];
        const record = () => fractions.push(mapLoadFraction(introLoad, false));
        // Totals reported up front.
        reportIntroLoad('terrain', { loaded: 0, total: 7 });
        reportIntroLoad('buildings', { loaded: 0, total: 16 });
        record();
        for (let i = 1; i <= 7; i++) {
            reportIntroLoad('terrain', { loaded: i, total: 7 });
            record();
        }
        for (let i = 1; i <= 16; i++) {
            reportIntroLoad('buildings', { loaded: i, total: 16 });
            record();
        }
        for (let i = 1; i < fractions.length; i++)
            expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
        expect(fractions[0]).toBe(0);
        expect(fractions[7]).toBeCloseTo(7 / 23);
        expect(fractions.at(-1)).toBeLessThan(1);
    });
});
