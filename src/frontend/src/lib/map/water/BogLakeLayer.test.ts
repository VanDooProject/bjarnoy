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
    expect(uniformsOf(layer).uRuffle).toBe(1);
    expect(uniformsOf(layer).uGlints).toBe(1);

    waterDebugFlags.bogLakeRuffle = false;
    waterDebugTuning.bogLakeGlintStrength = 2;
    layer.tick(0);
    expect(uniformsOf(layer).uRuffle).toBe(0);
    expect(uniformsOf(layer).uGlints).toBe(2);

    waterDebugFlags.bogLakeGlints = false;
    layer.tick(0);
    expect(uniformsOf(layer).uGlints).toBe(0);
  });

  it('runs the gust on the forests\' clock, and holds it while frozen', () => {
    const layer = new BogLakeLayer(TILE_W);
    layer.tick(2500);
    expect(uniformsOf(layer).uTime).toBeCloseTo(2.5, 9);
    expect(uniformsOf(layer).uGustTime).toBeCloseTo(gustTime(2500), 9);
    expect(uniformsOf(layer).uGustPeak).toBe(GUST_PEAK_PHASE);

    layer.setFrozen(true);
    layer.tick(9000);
    expect(uniformsOf(layer).uTime).toBeCloseTo(2.5, 9);
    layer.setFrozen(false);
    layer.tick(9500);
    expect(uniformsOf(layer).uTime).toBeCloseTo(9.5, 9);
  });
});

describe('BOG_LAKE_FRAGMENT', () => {
  it('follows the portable shader conventions', () => {
    expect(BOG_LAKE_FRAGMENT).not.toContain('#version');
    expect(BOG_LAKE_FRAGMENT).toContain('out vec4 finalColor;');
    expect(BOG_LAKE_FRAGMENT).toContain('const float GUST_WAVELENGTH = 6.0;');
  });
});
