import { describe, expect, it } from 'vitest';
import { atlasPageCount, discoveredCategories, discoveredPages } from './atlasManifests';
describe('atlasPageCount', () => {
    it('counts the pages of exactly that category, not categories that merely end with its name', () => {
        expect(atlasPageCount('terrain')).toBe(discoveredPages('terrain').length);
        expect(atlasPageCount('terrain')).toBeGreaterThan(0);
        // `wasted-terrain` / `frozen-terrain` are separate categories.
        const suffixed = discoveredCategories().filter((c) => c !== 'terrain' && c.endsWith('terrain'));
        const all = discoveredCategories().reduce((n, c) => n + atlasPageCount(c), 0);
        expect(suffixed.length).toBeGreaterThan(0);
        expect(atlasPageCount('terrain')).toBeLessThan(atlasPageCount('terrain') + suffixed.reduce((n, c) => n + atlasPageCount(c), 0));
        expect(all).toBeGreaterThan(atlasPageCount('terrain'));
    });
    it('is 0 for an unknown category', () => {
        expect(atlasPageCount('no-such-category')).toBe(0);
    });
});
