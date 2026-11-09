import { describe, expect, it } from 'vitest';
import { swayFramesPerColumn, swayPeriodFrames } from '../atlas';
import { sharedClockPlayback } from '../clipPlayback';
import { GUST_FPS, GUST_FRAMES_PER_COLUMN, GUST_PEAK_PHASE, GUST_PERIOD_FRAMES, GUST_SWAY, GUST_WAVELENGTH, gustOffset, gustPhase, gustTime, } from './bogLakeGust';
const TILE_W = 168;
/** The x of the left edge of column `col`'s art canvas — `isoGridPosition`. */
const columnX = (col) => col * 0.75 * TILE_W;
const fract = (v) => v - Math.floor(v);
describe('gust constants', () => {
    it('match the forests\' sway clip metadata', () => {
        expect(swayFramesPerColumn({ sway: GUST_SWAY })).toBe(GUST_FRAMES_PER_COLUMN);
        expect(swayPeriodFrames({ sway: GUST_SWAY })).toBe(GUST_PERIOD_FRAMES);
    });
});
describe('gustPhase', () => {
    it('equals the sway formula at every column and global frame', () => {
        for (let col = -3; col < 12; col++) {
            for (let g = 0; g < 40; g++) {
                const clockMs = ((g + 0.01) * 1000) / GUST_FPS;
                // syncTopAnim's frame for this tile, from the real playback helper (16 frames at 6 fps).
                const { frame } = sharedClockPlayback({ fps: GUST_FPS, frameCount: GUST_PERIOD_FRAMES, pause: 0, playback: 'loop' }, clockMs, GUST_FRAMES_PER_COLUMN * col);
                const expected = (((g - GUST_FRAMES_PER_COLUMN * col) % GUST_PERIOD_FRAMES) + GUST_PERIOD_FRAMES) % GUST_PERIOD_FRAMES;
                expect(frame).toBe(expected);
                // A tree at the canvas's left edge (s = 0) has phase frame / period.
                const phase = gustPhase(columnX(col), g * (1000 / GUST_FPS), TILE_W);
                // gustOffset(p + peak) is p wrapped to [-0.5, 0.5): the phases agree modulo 1.
                expect(Math.abs(gustOffset(phase + GUST_PEAK_PHASE - expected / GUST_PERIOD_FRAMES))).toBeCloseTo(0, 9);
            }
        }
    });
    it('moves toward +x: a point of equal phase travels right as time passes', () => {
        const seconds = 2;
        const speed = (TILE_W / 2) * GUST_WAVELENGTH * (GUST_FPS / GUST_PERIOD_FRAMES); // world units per second
        expect(gustPhase(500 + speed * seconds, 1000 + seconds * 1000, TILE_W)).toBeCloseTo(gustPhase(500, 1000, TILE_W), 9);
    });
    it('is continuous in time (no stepping at the clip\'s frame rate)', () => {
        const a = gustPhase(300, 1000, TILE_W);
        const b = gustPhase(300, 1010, TILE_W);
        expect(b - a).toBeCloseTo((10 / 1000) * (GUST_FPS / GUST_PERIOD_FRAMES), 9);
    });
});
describe('gustTime', () => {
    it('is the time term of gustPhase wrapped to [0, 1)', () => {
        for (const ms of [0, 123, 2666.7, 5000, 1e7 + 17]) {
            expect(fract(gustPhase(0, ms, TILE_W))).toBeCloseTo(gustTime(ms), 6);
            expect(gustTime(ms)).toBeGreaterThanOrEqual(0);
            expect(gustTime(ms)).toBeLessThan(1);
        }
    });
});
describe('gustOffset', () => {
    it('is 0 at the measured peak, wraps to [-0.5, 0.5)', () => {
        expect(gustOffset(GUST_PEAK_PHASE)).toBeCloseTo(0, 9);
        expect(gustOffset(GUST_PEAK_PHASE + 3)).toBeCloseTo(0, 9);
        expect(gustOffset(GUST_PEAK_PHASE + 0.75)).toBeCloseTo(-0.25, 9);
        expect(gustOffset(GUST_PEAK_PHASE - 0.1)).toBeCloseTo(-0.1, 9);
    });
});
