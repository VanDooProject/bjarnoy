// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaterLayer } from './WaterLayer';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import type { WaterMask } from './waterMask';
import { waterMaskRegion } from './waterMaskLayout';

// No GPU here, so these test the wiring — which debug flag reaches which
// uniform, and whether the quad lands on the rect its mask was baked over.
// Constructing a Pixi Mesh/Shader needs no renderer; only drawing one does.

// Pixi's GlProgram constructor probes a throwaway canvas for the driver's max
// fragment precision, and something on the import path does it once at module
// scope. jsdom has no canvas backend, so left alone that logs a "getContext()
// not implemented" line; Pixi already handles a null context (it falls back to
// its default precision), so hand it one directly — hoisted, since it has to be
// in place before the imports above run.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

const TILE_W = 168;

function maskOver(minX: number, minY: number, maxX: number, maxY: number): WaterMask {
  const region = waterMaskRegion({ minX, minY, maxX, maxY }, TILE_W);
  return {
    data: new Uint8Array(region.width * region.height * 4),
    width: region.width,
    height: region.height,
    region,
  };
}

function uniformsOf(layer: WaterLayer): Record<string, unknown> {
  return (layer.mesh.shader!.resources.waterUniforms as { uniforms: Record<string, unknown> }).uniforms;
}

const DEFAULTS = { ...waterDebugFlags };
const DEFAULT_TUNING = { ...waterDebugTuning };

describe('WaterLayer', () => {
  beforeEach(() => {
    Object.assign(waterDebugFlags, DEFAULTS);
    Object.assign(waterDebugTuning, DEFAULT_TUNING);
  });

  it('never eats a hex click', () => {
    // The mesh covers the whole viewport and sits over every hex, army marker
    // and waypoint pin under it — same reason the fog quads are eventMode none.
    expect(new WaterLayer('world', TILE_W).mesh.eventMode).toBe('none');
  });

  it('stays hidden until a mask has been baked', () => {
    const layer = new WaterLayer('world', TILE_W);
    layer.tick(0);
    expect(layer.mesh.visible).toBe(false);
    layer.setMask(maskOver(-500, -300, 500, 300));
    layer.tick(16);
    expect(layer.mesh.visible).toBe(true);
  });

  it('hides when suppressed or when the water flag is off (§3.6)', () => {
    const layer = new WaterLayer('world', TILE_W);
    layer.setMask(maskOver(-500, -300, 500, 300));

    layer.setSuppressed(true);
    layer.tick(16);
    expect(layer.mesh.visible).toBe(false);

    layer.setSuppressed(false);
    waterDebugFlags.water = false;
    layer.tick(32);
    expect(layer.mesh.visible).toBe(false);
  });

  it('maps the effect flags onto their uniforms', () => {
    const layer = new WaterLayer('world', TILE_W);
    const u = uniformsOf(layer);

    layer.tick(0);
    expect(u.uSeaBody).toBe(1);
    expect(u.uMidWaterWaves).toBe(1);
    expect(u.uShowMask).toBe(0);

    waterDebugFlags.seaBody = false;
    waterDebugFlags.midWaterWaves = false;
    waterDebugFlags.showWaterMask = true;
    layer.tick(16);
    expect(u.uSeaBody).toBe(0);
    expect(u.uMidWaterWaves).toBe(0);
    expect(u.uShowMask).toBe(1);
  });

  it('never draws a sea body in settlement mode — the painted water tiles are it', () => {
    const layer = new WaterLayer('settlement', TILE_W);
    waterDebugFlags.seaBody = true;
    layer.tick(0);
    expect(uniformsOf(layer).uSeaBody).toBe(0);
  });

  it('advances the wave clock at waveSpeed and the base clock at 1x', () => {
    const layer = new WaterLayer('world', TILE_W);
    const u = uniformsOf(layer);
    layer.tick(1000);
    waterDebugTuning.waveSpeed = 2;
    layer.tick(3000);
    // 2s elapsed on the second tick (the first establishes the baseline).
    expect(u.uTime).toBeCloseTo(2, 6);
    expect(u.uWaveTime).toBeCloseTo(4, 6);
  });

  it('places the quad on exactly the world rect its mask was baked over', () => {
    const layer = new WaterLayer('world', TILE_W);
    const mask = maskOver(-400, -250, 600, 350);
    layer.setMask(mask);

    const { minX, minY, maxX, maxY } = mask.region.rect;
    expect(Array.from(layer.mesh.geometry.getBuffer('aPosition').data)).toEqual([
      minX, minY, maxX, minY, maxX, maxY, minX, maxY,
    ]);
  });

  it('follows the camera by re-placing the quad, not by moving the mesh', () => {
    // The mesh is a child of the camera-transformed `world` container, so it
    // must never carry a transform of its own — mask UV and world position stay
    // locked together only because the quad *is* the baked rect.
    const layer = new WaterLayer('world', TILE_W);
    layer.setMask(maskOver(-400, -250, 600, 350));
    const first = Array.from(layer.mesh.geometry.getBuffer('aPosition').data);

    layer.setMask(maskOver(2000, 1000, 3000, 1600));
    const second = Array.from(layer.mesh.geometry.getBuffer('aPosition').data);

    expect(second).not.toEqual(first);
    expect(layer.mesh.position.x).toBe(0);
    expect(layer.mesh.position.y).toBe(0);
    expect(layer.mesh.scale.x).toBe(1);
  });

  it('reuses the texture source when a re-bake keeps the same dimensions', () => {
    // A pan at the same zoom re-bakes at the same texel dimensions; allocating
    // a fresh GPU texture per pan (and destroying one still bound to a shader)
    // is what this avoids.
    const layer = new WaterLayer('world', TILE_W);
    layer.setMask(maskOver(-400, -250, 600, 350));
    const before = layer.mesh.shader!.resources.uWaterMask;
    layer.setMask(maskOver(-380, -230, 620, 370));
    expect(layer.mesh.shader!.resources.uWaterMask).toBe(before);
  });
});
