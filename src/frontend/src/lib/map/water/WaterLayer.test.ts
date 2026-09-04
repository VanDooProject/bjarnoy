// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaterLayer } from './WaterLayer';
import { WATER_FRAGMENT } from './waterShader';
import { waterDebugFlags, waterDebugTuning } from './waterDebug';
import { FOAM_REACH_TILES, type WaterMask } from './waterMask';
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
const TILE_H = (TILE_W * 92) / 200;

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

  it('carries the prop-tile mute flag onto its uniform', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    layer.tick(0);
    expect(uniformsOf(layer).uPropMute).toBe(1);

    waterDebugFlags.propTileMute = false;
    layer.tick(16);
    expect(uniformsOf(layer).uPropMute).toBe(0);
  });

  it('never mutes on the world map, which draws no coastal art to protect', () => {
    // World mode skips sea tiles entirely, so there is no boat or rock on
    // screen there — muting would only thin the foam on a fifth of every
    // coastline for nothing.
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    layer.tick(0);
    expect(uniformsOf(layer).uPropMute).toBe(0);
  });

  it("clamps the caustics' keep-off distance to the range the mask can express", () => {
    // Past FOAM_REACH_TILES the far channel is saturated, so a larger value
    // would quietly mean "never draw them" rather than "keep them further out".
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);

    waterDebugTuning.causticCullHexes = 0.75;
    layer.tick(0);
    expect(uniformsOf(layer).uCausticCull).toBe(0.75);

    waterDebugTuning.causticCullHexes = 99;
    layer.tick(16);
    expect(uniformsOf(layer).uCausticCull).toBe(FOAM_REACH_TILES);
  });

  it('hands the world map surface to the squiggle layer when that layer is drawing', () => {
    // The two wave fields must never draw at once: worldLayerOrder puts the
    // Graphics squiggles above this mesh, so both on means one over the other.
    const world = new WaterLayer('world', TILE_W, TILE_H);
    waterDebugFlags.legacyWaveSquiggles = true;
    world.tick(0);
    expect(uniformsOf(world).uMidWaterWaves).toBe(0);

    waterDebugFlags.legacyWaveSquiggles = false;
    world.tick(16);
    expect(uniformsOf(world).uMidWaterWaves).toBe(1);
  });

  it('leaves the settlement surface alone whatever the squiggle flag says', () => {
    // The squiggle layer is world-only, so it can't be covering anything here.
    const settlement = new WaterLayer('settlement', TILE_W, TILE_H);
    waterDebugFlags.legacyWaveSquiggles = true;
    settlement.tick(0);
    expect(uniformsOf(settlement).uMidWaterWaves).toBe(1);
  });

  it('draws a crisp rim on the world map and a soft band up close', () => {
    // A two-tier band with a lace edge has nothing to resolve into at world
    // zoom; it just reads as a blurred glow around every island. Same shader,
    // two sets of constants — chosen once, by mode, at construction.
    const world = uniformsOf(new WaterLayer('world', TILE_W, TILE_H));
    const settlement = uniformsOf(new WaterLayer('settlement', TILE_W, TILE_H));

    expect((world.uFoamAlpha as Float32Array)[1]).toBe(0);
    expect((world.uFoamAlpha as Float32Array)[0]).toBeLessThan((settlement.uFoamAlpha as Float32Array)[0]);
    expect((settlement.uFoamAlpha as Float32Array)[1]).toBeGreaterThan(0);
    expect(world.uFoamInner as number).toBeGreaterThan(settlement.uFoamInner as number);
    expect(world.uFoamLandReach as number).toBeLessThan(settlement.uFoamLandReach as number);
    // ...and GLSL leaves smoothstep undefined when its edges coincide, which is
    // what a land reach of exactly zero would produce.
    expect(world.uFoamLandReach as number).toBeGreaterThan(0);
  });

  it('draws a narrower rim on the world map than up close, off one slider', () => {
    // The band is in world units, so the width that is a believable surf line in
    // a settlement is a thick white outline from orbit. One knob, scaled by mode,
    // rather than two knobs to keep in step.
    const world = new WaterLayer('world', TILE_W, TILE_H);
    const settlement = new WaterLayer('settlement', TILE_W, TILE_H);
    waterDebugTuning.foamWidthHexes = 0.4;
    world.tick(0);
    settlement.tick(0);

    const worldWidth = uniformsOf(world).uFoamWidth as number;
    const closeWidth = uniformsOf(settlement).uFoamWidth as number;
    expect(closeWidth).toBe(0.4);
    expect(worldWidth).toBeGreaterThan(0);
    expect(worldWidth).toBeLessThan(closeWidth / 2);
  });

  it('never eats a hex click', () => {
    // The mesh covers the whole viewport and sits over every hex, army marker
    // and waypoint pin under it — same reason the fog quads are eventMode none.
    expect(new WaterLayer('world', TILE_W, TILE_H).mesh.eventMode).toBe('none');
  });

  it('stays hidden until a mask has been baked', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    layer.tick(0);
    expect(layer.mesh.visible).toBe(false);
    layer.setMask(maskOver(-500, -300, 500, 300));
    layer.tick(16);
    expect(layer.mesh.visible).toBe(true);
  });

  it('hides when suppressed or when the water flag is off (§3.6)', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
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
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    // The world map's own surface pattern is the Graphics squiggle layer, which
    // takes uMidWaterWaves off the shader; this test is about the flag-to-uniform
    // mapping, so hand the surface back to the shader first.
    waterDebugFlags.legacyWaveSquiggles = false;

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

  it('switches the two extra caustic layers independently of the pattern itself', () => {
    // Both are sub-layers of the caustic pattern — the shader only reaches them
    // inside its caustic branch — so each has to be switchable without taking
    // the other, or the base net, with it.
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    expect(u.uCaustics).toBe(1);
    expect(u.uCausticFine).toBe(1);
    expect(u.uCausticBlobs).toBe(1);

    waterDebugFlags.fineCaustics = false;
    layer.tick(16);
    expect(u.uCaustics).toBe(1);
    expect(u.uCausticFine).toBe(0);
    expect(u.uCausticBlobs).toBe(1);

    waterDebugFlags.causticShadows = false;
    layer.tick(32);
    expect(u.uCausticBlobs).toBe(0);
  });

  it('scales both caustic nets off one thickness knob and one brightness knob', () => {
    // Two handles across a pair of nets, not four across one each: the fine net
    // is defined by being thinner and brighter than the coarse one, so the knobs
    // have to be multipliers that preserve that ordering at every setting.
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    const width = u.uCausticWidth as number;
    const fineWidth = u.uCausticFineWidth as number;
    const alpha = u.uCausticAlpha as number;
    const fineAlpha = u.uCausticFineAlpha as number;
    expect(fineWidth).toBeLessThan(width);
    expect(fineAlpha).toBeLessThan(alpha);

    waterDebugTuning.causticThickness = 2;
    waterDebugTuning.causticBrightness = 0.5;
    layer.tick(16);
    expect(u.uCausticWidth).toBeCloseTo(width * 2);
    expect(u.uCausticFineWidth).toBeCloseTo(fineWidth * 2);
    expect(u.uCausticAlpha).toBeCloseTo(alpha * 0.5);
    expect(u.uCausticFineAlpha).toBeCloseTo(fineAlpha * 0.5);
  });

  it('shrinks the foam band and its ragged edge by the same factor over a prop tile', () => {
    // A regression guard on GLSL, which is the honest place for it: there is no
    // CPU-side copy of this arithmetic to test, and the bug it guards was
    // invisible to every uniform-level assertion.
    //
    // uFoamNoise is an *absolute* displacement in tile widths, so when the band
    // narrows over a boat or rock the displacement has to narrow with it. It
    // did not, and at a quarter width the 0.09-tile edge noise was over a third
    // of the band's whole reach: measured on screen the foam swung back onto
    // the rock on every positive excursion of the noise, which is exactly the
    // artifact the narrowing exists to remove.
    const reach = WATER_FRAGMENT.split('\n').find((line) => line.includes('float reach ='));
    expect(reach).toBeDefined();
    expect(reach).toContain('uFoamNoise * shrink * edge');
  });

  it('never draws a sea body in settlement mode — the painted water tiles are it', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    waterDebugFlags.seaBody = true;
    layer.tick(0);
    expect(uniformsOf(layer).uSeaBody).toBe(0);
  });

  it('advances the wave clock at waveSpeed and the base clock at 1x', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(1000);
    waterDebugTuning.waveSpeed = 2;
    layer.tick(3000);
    // 2s elapsed on the second tick (the first establishes the baseline).
    expect(u.uTime).toBeCloseTo(2, 6);
    expect(u.uWaveTime).toBeCloseTo(4, 6);
  });

  it('places the quad on exactly the world rect its mask was baked over', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
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
    const layer = new WaterLayer('world', TILE_W, TILE_H);
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
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    layer.setMask(maskOver(-400, -250, 600, 350));
    const before = layer.mesh.shader!.resources.uWaterMask;
    layer.setMask(maskOver(-380, -230, 620, 370));
    expect(layer.mesh.shader!.resources.uWaterMask).toBe(before);
  });
});
