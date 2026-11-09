import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// Regression guard for the seam lines Chrome on Android drew over the animated intro scenes
// (only visible on the device's GPU raster, so no rendering test can catch it here).
describe('introFog.css', () => {
    it('puts every intro beat on its own compositor layer', () => {
        const css = readFileSync(join(__dirname, 'introFog.css'), 'utf8');
        const rule = css.match(/\.intro-beat\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule).toMatch(/will-change:\s*transform/);
    });
});
