// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { BogLakeLayer } from './BogLakeLayer';
import { BOG_LAKE_FRAGMENT } from './bogLakeShader';
import { GUST_PEAK_PHASE, gustTime } from './bogLakeGust';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';

// Wiring only (no GPU): which flag reaches which uniform, and when the mesh shows. See WaterLayer.test.ts for the jsdom canvas stub.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

const TILE_W = 168;
const DEFAULT_FLAGS = { ...waterDebugFlags };
const DEFAULT_TUNING = { ...waterDebugTuning };

function uniformsOf(layer: BogLakeLayer): Record<string, unknown> {
  return (layer.mesh.shader!.resources.bogLakeUniforms as { uniforms: Record<string, unknown> }).uniforms;
}

function lakeTexture(): Texture {
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
    expect(layer.mesh.shader!.resources.uLakeMask).toBeDefined();
    const mask = lakeTexture();
    layer.setLake(mask, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(layer.mesh.shader!.resources.uLakeMask).toBe(mask.source);
    layer.setLake(null, null);
    expect(layer.mesh.shader!.resources.uLakeMask).not.toBe(mask.source);
  });

  it('is hidden until there is a lake, and puts the quad on the lakes\' rect', () => {
    const layer = new BogLakeLayer(TILE_W);
    layer.tick(0);
    expect(layer.mesh.visible).toBe(false);

    layer.setLake(lakeTexture(), { minX: 10, minY: 20, maxX: 110, maxY: 220 });
    layer.tick(16);
    expect(layer.mesh.visible).toBe(true);
    expect(Array.from(layer.mesh.geometry.getBuffer('aPosition').data as Float32Array)).toEqual([10, 20, 110, 20, 110, 220, 10, 220]);

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

  it('runs the gust on the forests\' clock', () => {
    const layer = new BogLakeLayer(TILE_W);
    layer.tick(2500);
    expect(uniformsOf(layer).uTime).toBeCloseTo(2.5, 9);
    expect(uniformsOf(layer).uGustTime).toBeCloseTo(gustTime(2500), 9);
    expect(uniformsOf(layer).uGustPeak).toBe(GUST_PEAK_PHASE);
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
