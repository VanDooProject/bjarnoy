import { describe, expect, it } from 'vitest';
import { parseCameraHash, serializeCameraHash } from './mapCameraHash';
describe('map camera hash', () => {
    it('serialises the hex and a two-decimal zoom', () => {
        expect(serializeCameraHash({ coord: { q: -3, r: 12 }, zoom: 1.2345 })).toBe('#q=-3&r=12&z=1.23');
    });
    it('round-trips a view (zoom to two decimals)', () => {
        const view = { coord: { q: 40, r: -7 }, zoom: 0.85 };
        expect(parseCameraHash(serializeCameraHash(view))).toEqual(view);
    });
    it.each(['', '#', '#world', '#q=1&r=2', '#q=1&z=1', '#q=a&r=2&z=1', '#q=1.5&r=2&z=1', '#q=1&r=2&z=NaN', '#q=1&r=2&z=', '#q=1&r=2&z=0', '#q=1&r=2&z=-1', 'q=1&r=2&z=1'])('ignores %j', (hash) => {
        expect(parseCameraHash(hash)).toBeNull();
    });
});
