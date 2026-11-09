import { describe, expect, it } from 'vitest';
import { hexTakesNoOrder, nextUpgradeLevel } from './pendingBuild';
describe('nextUpgradeLevel', () => {
    const at = { q: 3, r: -2 };
    it('is one above the built level on an idle hex', () => {
        expect(nextUpgradeLevel(2, [], at)).toBe(3);
    });
    it('queues behind a running upgrade on the same hex', () => {
        const queue = [{ q: 3, r: -2, kind: 'build', targetLevel: 3 }, { q: 0, r: 0, kind: 'build', targetLevel: 6 }];
        expect(nextUpgradeLevel(2, queue, at)).toBe(4);
    });
    it('ignores a raze order on the hex', () => {
        expect(nextUpgradeLevel(2, [{ q: 3, r: -2, kind: 'raze', targetLevel: 1 }], at)).toBe(3);
    });
    it('ignores orders on other hexes', () => {
        expect(nextUpgradeLevel(2, [{ q: 0, r: 0, kind: 'build', targetLevel: 6 }], at)).toBe(3);
    });
});
describe('hexTakesNoOrder', () => {
    const at = { q: 3, r: -2 };
    const build = { q: 3, r: -2, kind: 'build' };
    it('is free on an idle hex, and with orders only on other hexes', () => {
        expect(hexTakesNoOrder([], at, 1)).toBe(false);
        expect(hexTakesNoOrder([{ ...build, q: 0 }], at, 1)).toBe(false);
    });
    it('is full at the per-hex order limit', () => {
        expect(hexTakesNoOrder([build], at, 1)).toBe(true);
        expect(hexTakesNoOrder([build], at, 2)).toBe(false);
        expect(hexTakesNoOrder([build, build], at, 2)).toBe(true);
    });
    it('is full with a raze on the hex, whatever the limit', () => {
        expect(hexTakesNoOrder([{ ...build, kind: 'raze' }], at, 3)).toBe(true);
    });
});
