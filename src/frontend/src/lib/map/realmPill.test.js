import { describe, expect, it } from 'vitest';
import { layoutRealmPill, REALM_PILL } from './realmPill';
const S = REALM_PILL.badge;
describe('layoutRealmPill', () => {
    it('width = padding + mark + gap + labels + label gaps', () => {
        const l = layoutRealmPill(S, 1, [60, 40], 100, 10);
        expect(l.w).toBe(2 * 14 + 2 * 4.5 + 9 + 100 + 6);
        expect(l.h).toBe(30);
        expect(l.radius).toBe(15);
    });
    it('centres on centerX and starts at top', () => {
        const l = layoutRealmPill(S, 1, [60, 40], 100, 10);
        expect(l.x + l.w / 2).toBeCloseTo(100);
        expect(l.y).toBe(10);
        expect(l.markY).toBe(25);
        expect(l.labelY).toBe(25);
    });
    it('places mark and labels left to right', () => {
        const l = layoutRealmPill(S, 1, [60, 40], 100, 0);
        expect(l.markX).toBeCloseTo(l.x + 14 + 4.5);
        expect(l.labelXs[0]).toBeCloseTo(l.x + 14 + 9 + 9);
        expect(l.labelXs[1]).toBeCloseTo(l.labelXs[0] + 60 + 6);
    });
    it('scale multiplies every size field', () => {
        const a = layoutRealmPill(S, 1, [0], 0, 0);
        const b = layoutRealmPill(S, 2, [0], 0, 0);
        expect(b.w).toBeCloseTo(a.w * 2);
        expect(b.h).toBe(a.h * 2);
        expect(b.markR).toBe(a.markR * 2);
        expect(b.border).toBe(a.border * 2);
        expect(b.radius).toBe(a.radius * 2);
    });
    it('a single label adds no label gap', () => {
        const l = layoutRealmPill(REALM_PILL.owner, 1, [50], 0, 0);
        expect(l.w).toBe(2 * 8 + 2 * 3.5 + 6 + 50);
        expect(l.labelXs).toHaveLength(1);
    });
});
