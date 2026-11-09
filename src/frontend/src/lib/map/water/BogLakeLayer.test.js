// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { BogLakeLayer } from './BogLakeLayer';
import { BOG_LAKE_FRAGMENT } from './bogLakeShader';
import { GUST_LAKE_PHASE_OFFSET, GUST_PEAK_PHASE, gustTime } from './bogLakeGust';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
// Wiring only (no GPU): which flag reaches which uniform, and when the mesh shows. See WaterLayer.test.ts for the jsdom canvas stub.
vi.hoisted(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
});
const TILE_W = 168;
const DEFAULT_FLAGS = { ...waterDebugFlags };
const DEFAULT_TUNING = { ...waterDebugTuning };
function uniformsOf(layer) {
    return layer.mesh.shader.resources.bogLakeUniforms.uniforms;
}
function lakeTexture() {
    return new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }) });
}
describe('BogLakeLayer', () => {
    beforeEach(() => {
        Object.assign(waterDebugFlags, DEFAULT_FLAGS);
        Object.assign(waterDebugTuning, DEFAULT_TUNING);
    });
    it('declares the lake mask sampler when the shader is built, and binds the baked mask to it', () => {
        // Regression: a sampler first assigned in setLake is never bound by Pixi, so the shader read texture unit 0 and the gust shaded the
        // whole quad over the lakes' bounding rect (the bog moss around the lake too), not just the lake water.
        const layer = new BogLakeLayer(TILE_W);
        expect(layer.mesh.shader.resources.uLakeMask).toBeDefined();
        const mask = lakeTexture();
        layer.setLake(mask, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
        expect(layer.mesh.shader.resources.uLakeMask).toBe(mask.source);
        layer.setLake(null, null);
        expect(layer.mesh.shader.resources.uLakeMask).not.toBe(mask.source);
    });
    it('is hidden until there is a lake, and puts the quad on the lakes\' rect', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.tick(0);
        expect(layer.mesh.visible).toBe(false);
        layer.setLake(lakeTexture(), { minX: 10, minY: 20, maxX: 110, maxY: 220 });
        layer.tick(16);
        expect(layer.mesh.visible).toBe(true);
        expect(Array.from(layer.mesh.geometry.getBuffer('aPosition').data)).toEqual([10, 20, 110, 20, 110, 220, 10, 220]);
        layer.setLake(null, null);
        layer.tick(32);
        expect(layer.mesh.visible).toBe(false);
    });
    it('follows the water switch and suppression', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.setLake(lakeTexture(), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
        waterDebugFlags.water = false;
        layer.tick(0);
        expect(layer.mesh.visible).toBe(false);
        waterDebugFlags.water = true;
        layer.setSuppressed(true);
        layer.tick(0);
        expect(layer.mesh.visible).toBe(false);
        layer.setSuppressed(false);
        layer.tick(0);
        expect(layer.mesh.visible).toBe(true);
    });
    it('turns each look off with its own flag and scales it with its strength', () => {
        const layer = new BogLakeLayer(TILE_W);
        // The gust looks ship off: only the blops show by default.
        layer.tick(0);
        expect(uniformsOf(layer).uFoam).toBe(0);
        expect(uniformsOf(layer).uSheen).toBe(0);
        expect(uniformsOf(layer).uCatsPaws).toBe(0);
        waterDebugFlags.bogLakeFoam = true;
        waterDebugFlags.bogLakeSheen = true;
        waterDebugFlags.bogLakeCatsPaws = true;
        layer.tick(0);
        expect(uniformsOf(layer).uFoam).toBe(1);
        expect(uniformsOf(layer).uSheen).toBe(1);
        expect(uniformsOf(layer).uCatsPaws).toBe(1);
        waterDebugFlags.bogLakeFoam = false;
        waterDebugTuning.bogLakeSheenStrength = 2;
        waterDebugTuning.bogLakeCatsPawsStrength = 0.5;
        layer.tick(0);
        expect(uniformsOf(layer).uFoam).toBe(0);
        expect(uniformsOf(layer).uSheen).toBe(2);
        expect(uniformsOf(layer).uCatsPaws).toBe(0.5);
        waterDebugFlags.bogLakeSheen = false;
        waterDebugFlags.bogLakeCatsPaws = false;
        layer.tick(0);
        expect(uniformsOf(layer).uSheen).toBe(0);
        expect(uniformsOf(layer).uCatsPaws).toBe(0);
    });
    it('turns blops off with their flag and scales them, density included', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.tick(0);
        expect(uniformsOf(layer).uBlops).toBe(1);
        expect(uniformsOf(layer).uBlopDensity).toBe(0.5);
        waterDebugTuning.bogLakeBlopsStrength = 1.5;
        waterDebugTuning.bogLakeBlopDensity = 0.5;
        waterDebugTuning.bogLakeBlopSize = 1.4;
        layer.tick(0);
        expect(uniformsOf(layer).uBlops).toBe(1.5);
        expect(uniformsOf(layer).uBlopDensity).toBe(0.5);
        expect(uniformsOf(layer).uBlopSize).toBe(1.4);
        waterDebugFlags.bogLakeBlops = false;
        layer.tick(0);
        expect(uniformsOf(layer).uBlops).toBe(0);
    });
    it('gives the shader the lake mask\'s world rect', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.setLake(lakeTexture(), { minX: 10, minY: 20, maxX: 110, maxY: 220 });
        expect(Array.from(uniformsOf(layer).uLakeOrigin)).toEqual([10, 20]);
        expect(Array.from(uniformsOf(layer).uLakeSize)).toEqual([100, 200]);
    });
    it('passes the foam line width and spacing and the band width through', () => {
        const layer = new BogLakeLayer(TILE_W);
        waterDebugTuning.bogLakeFoamWidth = 0.07;
        waterDebugTuning.bogLakeFoamSpacing = 22;
        waterDebugTuning.bogLakeBandHalf = 0.3;
        layer.tick(0);
        expect(uniformsOf(layer).uFoamWidth).toBe(0.07);
        expect(uniformsOf(layer).uFoamSpacing).toBe(22);
        expect(uniformsOf(layer).uBandHalf).toBe(0.3);
    });
    it('shifts the gust peak by the debug phase offset', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.tick(0);
        expect(uniformsOf(layer).uGustPeak).toBeCloseTo(GUST_PEAK_PHASE + GUST_LAKE_PHASE_OFFSET, 9);
        waterDebugTuning.bogLakeGustPhaseOffset = -0.1;
        layer.tick(0);
        expect(uniformsOf(layer).uGustPeak).toBeCloseTo(GUST_PEAK_PHASE - 0.1, 9);
    });
    it('passes the foam style through', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.tick(0);
        expect(uniformsOf(layer).uFoamStyle).toBe(3); // micro curls ship
        waterDebugTuning.bogLakeFoamStyle = 3;
        layer.tick(0);
        expect(uniformsOf(layer).uFoamStyle).toBe(3);
    });
    it('runs the gust on the forests\' clock', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.tick(2500);
        expect(uniformsOf(layer).uTime).toBeCloseTo(2.5, 9);
        expect(uniformsOf(layer).uGustTime).toBeCloseTo(gustTime(2500), 9);
        expect(uniformsOf(layer).uGustPeak).toBeCloseTo(GUST_PEAK_PHASE + GUST_LAKE_PHASE_OFFSET, 9);
    });
    it('is hidden, not frozen, while lake wind motion is off', () => {
        const layer = new BogLakeLayer(TILE_W);
        layer.setLake(lakeTexture(), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
        layer.setMotion(false);
        layer.tick(9000);
        expect(layer.mesh.visible).toBe(false);
        layer.setMotion(true);
        layer.tick(9500);
        expect(layer.mesh.visible).toBe(true);
        expect(uniformsOf(layer).uTime).toBeCloseTo(9.5, 9);
    });
});
describe('BOG_LAKE_FRAGMENT', () => {
    it('follows the portable shader conventions', () => {
        expect(BOG_LAKE_FRAGMENT).not.toContain('#version');
        expect(BOG_LAKE_FRAGMENT).toContain('out vec4 finalColor;');
        expect(BOG_LAKE_FRAGMENT).toContain('const float GUST_WAVELENGTH = 6.0;');
    });
    it('uses none of the words GLSL ES 3.00 reserves as an identifier', () => {
        // Regression: a local named `patch` compiled under GLSL ES 1.00 but is a reserved word in 3.00 (WebGL 2), where the shader failed.
        const reserved = ['patch', 'sample', 'common', 'partition', 'active', 'filter', 'input', 'output', 'superp', 'resource', 'buffer', 'shared', 'subroutine', 'noperspective', 'centroid', 'smooth', 'flat', 'invariant'];
        const declared = [...BOG_LAKE_FRAGMENT.matchAll(/\b(?:float|vec[234]|int|bool)\s+(\w+)/g)].map((m) => m[1]);
        expect(declared.filter((name) => reserved.includes(name))).toEqual([]);
    });
});
