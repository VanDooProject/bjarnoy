import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBaseCanvases } from '../../../../build/waterDryMasks';
import { SOURCE_H, SOURCE_W } from './dryMaskCore';
import { hasRiverWater, isRiverWater, riverMaskHalf, riverTexelCount } from './riverMaskCore';
const HALF_W = SOURCE_W / 2;
function paint(c, rect, [r, g, b], a = 255) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            const i = (y * SOURCE_W + x) * 4;
            c[i] = r;
            c[i + 1] = g;
            c[i + 2] = b;
            c[i + 3] = a;
        }
    }
}
function blank() {
    return new Uint8Array(SOURCE_W * SOURCE_H * 4);
}
function maskAt(mask, x, y) {
    return mask[(y >> 1) * HALF_W + (x >> 1)];
}
describe('isRiverWater', () => {
    it('accepts navy river water and cyan stream water', () => {
        expect(isRiverWater(16, 56, 110, 255)).toBe(true);
        expect(isRiverWater(72, 150, 176, 255)).toBe(true);
    });
    it('rejects grass, sand, rock and transparent pixels', () => {
        expect(isRiverWater(70, 120, 50, 255)).toBe(false);
        expect(isRiverWater(210, 190, 140, 255)).toBe(false);
        expect(isRiverWater(120, 120, 124, 255)).toBe(false);
        expect(isRiverWater(16, 56, 110, 0)).toBe(false);
    });
});
describe('riverMaskHalf', () => {
    it('marks a water patch and nothing around it', () => {
        const c = blank();
        paint(c, { x: 0, y: 100, w: SOURCE_W, h: 100 }, [70, 120, 50]);
        paint(c, { x: 60, y: 130, w: 40, h: 30 }, [16, 56, 110]);
        const mask = riverMaskHalf(c);
        expect(maskAt(mask, 80, 145)).toBe(255);
        expect(maskAt(mask, 20, 145)).toBe(0);
        expect(maskAt(mask, 80, 180)).toBe(0);
        expect(riverTexelCount(c)).toBe(40 * 30);
    });
    it('keeps cyan stream water and drops green, grey and sand', () => {
        const c = blank();
        paint(c, { x: 0, y: 100, w: 20, h: 20 }, [72, 150, 176]);
        paint(c, { x: 40, y: 100, w: 20, h: 20 }, [70, 120, 50]);
        paint(c, { x: 80, y: 100, w: 20, h: 20 }, [120, 120, 124]);
        paint(c, { x: 120, y: 100, w: 20, h: 20 }, [210, 190, 140]);
        const mask = riverMaskHalf(c);
        expect(maskAt(mask, 10, 110)).toBe(255);
        expect(maskAt(mask, 50, 110)).toBe(0);
        expect(maskAt(mask, 90, 110)).toBe(0);
        expect(maskAt(mask, 130, 110)).toBe(0);
    });
    it('fills a render-dither pinhole inside the water', () => {
        const c = blank();
        paint(c, { x: 60, y: 130, w: 40, h: 30 }, [16, 56, 110]);
        paint(c, { x: 80, y: 144, w: 1, h: 1 }, [70, 120, 50]);
        expect(maskAt(riverMaskHalf(c), 80, 144)).toBe(255);
    });
});
describe('hasRiverWater', () => {
    it('lets river, creek, creek-mouth and river-building frames in, and keeps frozen, lava and plain lakes out', () => {
        for (const n of ['rivertile_bend60_loop_E_base', 'bogcreek_bend_E_base', 'boglake_mouth_E_variant001_base', 'sawmill_E_base', 'sawmillbend60_E_level000_base', 'riverbridge_W_level001_base', 'bearrapids_E_level000_base'])
            expect(hasRiverWater(n), n).toBe(true);
        for (const n of ['frozenriver_E_base', 'lavastream_E_base', 'boglake_E_variant001_base', 'boglake_inlet_E_variant001_base', 'watertile_E_base'])
            expect(hasRiverWater(n), n).toBe(false);
    });
});
// The vendored atlas is a gitignored submodule: absent where it was not checked out, then the check is skipped.
const vendored = existsSync(resolve(__dirname, '../../../../vendor/bg_assets_hextile/atlas/terrain-4.json'));
describe('river masks of the vendored art', () => {
    it.skipIf(!vendored)('are non-trivial for the loop, the meander and the bog creek bend', async () => {
        const bases = await loadBaseCanvases();
        for (const name of ['rivertile_bend60_loop_E_base', 'rivertile_small_bend120_meander_E_base', 'bogcreek_bend_E_base']) {
            const frame = bases.get(name) ?? [...bases.entries()].find(([n]) => n.startsWith(name.replace('_base', '')))?.[1];
            expect(frame, name).toBeDefined();
            const mask = riverMaskHalf(frame.canvas);
            const water = mask.reduce((n, v) => n + (v >= 128 ? 1 : 0), 0);
            expect(water, name).toBeGreaterThan(200);
            expect(water, name).toBeLessThan(mask.length / 2);
        }
    }, 120_000);
});
