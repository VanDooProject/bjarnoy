// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { RIVER_NOISE_PER_TILE, RIVER_SPEED_TURNS_PER_SECOND, WaterLayer } from './WaterLayer';
import { RIPPLE_WAVELENGTH_TEXELS } from './riverFlow';
import { RIVER_DRIFT, WATER_FRAGMENT } from './waterShader';
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
    taint: new Uint8Array(region.width * region.height),
    noFoam: new Uint8Array(region.width * region.height),
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

  it('ships a coast gap that ends the caustics under the foam band', () => {
    // The caustics stop at the foam's edge, not a visible gap before it: the
    // keep-off (plus the per-ribbon spread) sits inside the foam width.
    expect(waterDebugTuning.causticCullHexes).toBe(0.25);
    expect(waterDebugTuning.causticCullHexes).toBeLessThan(waterDebugTuning.foamWidthHexes);
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

  it('gives each caustic net its own thickness, brightness and density', () => {
    // Three handles per net rather than three shared. Shared multipliers kept
    // the fine net thinner and brighter than the coarse one at every setting,
    // which is true and also made that relationship the one thing that could
    // not be adjusted — most of what there is to tune once both nets exist.
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    const width = u.uCausticWidth as number;
    const fineWidth = u.uCausticFineWidth as number;
    const alpha = u.uCausticAlpha as number;
    const fineAlpha = u.uCausticFineAlpha as number;
    const bands = u.uCausticBands as number;
    const fineBands = u.uCausticFineBands as number;
    expect(fineWidth).toBeLessThan(width);
    expect(fineAlpha).toBeLessThan(alpha);

    // Move the coarse net's three; the fine net's must not follow.
    waterDebugTuning.causticThickness = 2;
    waterDebugTuning.causticBrightness = 0.5;
    waterDebugTuning.causticDensity = 1.5;
    layer.tick(16);
    expect(u.uCausticWidth).toBeCloseTo(width * 2);
    expect(u.uCausticAlpha).toBeCloseTo(alpha * 0.5);
    expect(u.uCausticBands).toBeCloseTo(bands * 1.5);
    expect(u.uCausticFineWidth).toBeCloseTo(fineWidth);
    expect(u.uCausticFineAlpha).toBeCloseTo(fineAlpha);
    expect(u.uCausticFineBands).toBeCloseTo(fineBands);

    // ...and the other way round.
    waterDebugTuning.causticFineThickness = 3;
    waterDebugTuning.causticFineBrightness = 1.5;
    waterDebugTuning.causticFineDensity = 0.5;
    layer.tick(32);
    expect(u.uCausticFineWidth).toBeCloseTo(fineWidth * 3);
    expect(u.uCausticFineAlpha).toBeCloseTo(fineAlpha * 1.5);
    expect(u.uCausticFineBands).toBeCloseTo(fineBands * 0.5);
    // Density must not move the width: the shader measures ribbon thickness as a
    // distance in field space, not as a fraction of the gap between contours, so
    // the two handles are independent and have to stay that way.
    expect(u.uCausticWidth).toBeCloseTo(width * 2);
  });

  it('carries a phase offset for the fine net, and ships with one', () => {
    // The nets are independent fields but breathe on their own clocks, so with
    // the clocks aligned their busy and empty moments coincide and the water
    // goes bare and then crowded with both doing it at once. Only a time offset
    // breaks that — no amount of making the fields more different from each
    // other will.
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    expect(u.uCausticFinePhase).toBeGreaterThan(0);

    waterDebugTuning.causticFinePhase = 4.5;
    layer.tick(16);
    expect(u.uCausticFinePhase).toBe(4.5);
  });

  it('switches the coarse net independently of the fine one', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    expect(u.uCausticCoarse).toBe(1);

    waterDebugFlags.coarseCaustics = false;
    layer.tick(16);
    expect(u.uCausticCoarse).toBe(0);
    // The base net going away must not take the layers over it with it.
    expect(u.uCausticFine).toBe(1);
    expect(u.uCausticBlobs).toBe(1);
  });

  it('keeps caustics and foam off the art dry mask', () => {
    // A regression guard on GLSL, which is the honest place for it: there is no
    // CPU-side copy of this arithmetic to test. The shader samples the dry mask
    // texture, and both the caustic layers (via `quiet`) and the foam multiply
    // by what is left of it.
    expect(WATER_FRAGMENT).toContain('uniform sampler2D uWaterDry;');
    expect(WATER_FRAGMENT).toContain('float quiet = (1.0 - dry)');
    const foam = WATER_FRAGMENT.split('\n').find((line) => line.includes('float foam ='));
    expect(foam).toContain('(1.0 - dry)');
  });

  it('binds the "nothing is dry" placeholder until a dry mask is set, and the given texture after', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const resources = layer.mesh.shader!.resources as Record<string, unknown>;
    const placeholder = resources.uWaterDry;
    expect(placeholder).toBeDefined();

    const texture = new Texture({ source: new BufferImageSource({ resource: new Uint8Array([255, 255, 255, 255]), width: 1, height: 1 }) });
    layer.setDryTexture(texture);
    expect(resources.uWaterDry).toBe(texture.source);

    layer.setDryTexture(null);
    expect(resources.uWaterDry).toBe(placeholder);
  });

  it('binds the "no river" placeholder until a river flow texture is set, and the given texture after', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const resources = layer.mesh.shader!.resources as Record<string, unknown>;
    const placeholder = resources.uRiverFlow;
    expect(placeholder).toBeDefined();
    expect(WATER_FRAGMENT).toContain('uniform sampler2D uRiverFlow;');

    const texture = new Texture({ source: new BufferImageSource({ resource: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }) });
    layer.setRiverFlowTexture(texture);
    expect(resources.uRiverFlow).toBe(texture.source);

    layer.setRiverFlowTexture(null);
    expect(resources.uRiverFlow).toBe(placeholder);

    // (f) The shader reads the texture with its own UVs: the river cells' box, as an origin and 1 / size.
    layer.setRiverFlowTexture(texture, { minX: 100, minY: 20, maxX: 160, maxY: 80 });
    const rect = Array.from(uniformsOf(layer).uRiverRect as Float32Array);
    expect(rect.slice(0, 2)).toEqual([100, 20]);
    expect(rect[2]).toBeCloseTo(1 / 60, 6);
    expect(rect[3]).toBeCloseTo(1 / 60, 6);
    layer.setRiverFlowTexture(null);
    expect(Array.from(uniformsOf(layer).uRiverRect as Float32Array)).toEqual([0, 0, 1, 1]);

    // The stream function texture is bound with the texture, and falls back to the placeholder without it.
    const psiTexture = new Texture({ source: new BufferImageSource({ resource: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }) });
    layer.setRiverFlowTexture(texture, { minX: 0, minY: 0, maxX: 2, maxY: 2 }, psiTexture);
    expect(resources.uRiverPsi).toBe(psiTexture.source);
    layer.setRiverFlowTexture(texture, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    expect(resources.uRiverPsi).toBe(placeholder);
  });

  it('carries the specks and patches at the ripples\' speed times the gain measured on the clips (within 10 %)', () => {
    const k = RIVER_NOISE_PER_TILE / TILE_W; // the river noise scale, per world unit (uRiverScale)
    const texelWorld = (2 * TILE_W) / 200; // a flow cell texel: 2 source px of the 200 px art
    // Ripples: periods per second times the wavelength in world units. Drifts: shift * rate / (grid * k) world units per second.
    // `gain` is what scripts/motion measurements on recorded clips needed on top of that so the visible marks match the crests
    // (cross-fading features shows less motion than the nominal speed).
    const ripples = RIVER_SPEED_TURNS_PER_SECOND * RIPPLE_WAVELENGTH_TEXELS * texelWorld;
    for (const [name, d] of Object.entries(RIVER_DRIFT)) {
      const speed = (d.shift * d.rate) / (d.grid * k);
      expect(Math.abs(speed / d.gain / ripples - 1), `${name}: ${speed.toFixed(1)} against ${ripples.toFixed(1)} world units per second`).toBeLessThan(0.1);
    }
  });

  it('maps the river flow flags and knobs onto their uniforms', () => {
    const layer = new WaterLayer('settlement', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(0);
    expect(u.uRiverFlowOn).toBe(1);
    expect(u.uShowRiverFlow).toBe(0);
    const alpha = u.uRiverAlpha as number;
    const speed = u.uRiverSpeed as number;
    const arc = u.uRiverArc as number;

    waterDebugFlags.riverFlow = false;
    waterDebugFlags.showRiverFlow = true;
    waterDebugTuning.riverBrightness = 2;
    waterDebugTuning.riverSpeed = 0.5;
    waterDebugTuning.riverArc = 2;
    layer.tick(16);
    expect(u.uRiverFlowOn).toBe(0);
    expect(u.uShowRiverFlow).toBe(1);
    // The default look is the cartoon bands with the flow streaks over them at a quarter of their alpha.
    expect(u.uRiverStyle).toBe(4);
    expect(u.uRiverStreakMix).toBeCloseTo(0.25, 9);
    waterDebugFlags.riverStyle = 2;
    waterDebugTuning.riverStreakMix = 0.4;
    layer.tick(32);
    expect(u.uRiverStyle).toBe(2);
    expect(u.uRiverStreakMix).toBeCloseTo(0.4, 9);
    waterDebugFlags.riverStyle = 3;
    layer.tick(48);
    expect(u.uRiverStyle).toBe(3);
    waterDebugFlags.riverStyle = 4;
    waterDebugTuning.riverStreakMix = 0.25;
    expect(u.uRiverAlpha).toBeCloseTo(alpha * 2, 9);
    expect(u.uRiverSpeed).toBeCloseTo(speed * 0.5, 9);
    expect(u.uRiverArc).toBeCloseTo(arc * 2, 9);
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

  it('holds both clocks while frozen and resumes without a jump when thawed', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    layer.tick(1000);
    layer.tick(2000);
    expect(u.uTime).toBeCloseTo(1, 6);

    layer.setFrozen(true);
    layer.tick(5000);
    layer.tick(9000);
    expect(u.uTime).toBeCloseTo(1, 6);
    expect(u.uWaveTime).toBeCloseTo(waterDebugTuning.waveSpeed, 6);

    layer.setFrozen(false);
    layer.tick(9500);
    expect(u.uTime).toBeCloseTo(1.5, 6);
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

  it('carries the tainted-water colour uniforms, distinct from the plain sea/foam colours', () => {
    // §"Tainted water": the shader mixes toward these by the taint field
    // rather than sharing the untainted palette's uniforms outright.
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    const u = uniformsOf(layer);
    for (const key of ['uTaintShallowColor', 'uTaintDeepColor', 'uTaintFoamColor']) {
      expect(u[key]).toBeInstanceOf(Float32Array);
      expect((u[key] as Float32Array).length).toBe(3);
    }
    expect(u.uTaintShallowColor).not.toEqual(u.uShallowColor);
    expect(u.uTaintDeepColor).not.toEqual(u.uDeepColor);
    expect(u.uTaintFoamColor).not.toEqual(u.uFoamColor);
  });

  it('uploads a second, single-channel texture for the taint field alongside the mask', () => {
    const layer = new WaterLayer('world', TILE_W, TILE_H);
    // Before any bake: a placeholder, so a frame drawn before the first bake
    // gets untainted water rather than a stale/garbage sample.
    expect(layer.mesh.shader!.resources.uWaterTaint).toBeDefined();
    const placeholder = layer.mesh.shader!.resources.uWaterTaint;

    layer.setMask(maskOver(-400, -250, 600, 350));
    expect(layer.mesh.shader!.resources.uWaterTaint).not.toBe(placeholder);

    // Same reuse-on-same-dimensions behaviour as uWaterMask above.
    const afterFirstBake = layer.mesh.shader!.resources.uWaterTaint;
    layer.setMask(maskOver(-380, -230, 620, 370));
    expect(layer.mesh.shader!.resources.uWaterTaint).toBe(afterFirstBake);
  });

  // docs/design/zoom-transition.md §4: the zoom-driven mode switch flips the
  // layer's mode in place rather than reconstructing it, so the three
  // uniforms baked at construction (see "draws a crisp rim..." above) must
  // update the same way setMode is asked to as they do when chosen at
  // construction time.
  describe('setMode', () => {
    it('rewrites the foam uniforms to match a freshly-constructed layer of the target mode', () => {
      const world = new WaterLayer('world', TILE_W, TILE_H);
      const settlement = uniformsOf(new WaterLayer('settlement', TILE_W, TILE_H));

      world.setMode('settlement');
      const switched = uniformsOf(world);
      expect(switched.uFoamInner).toBe(settlement.uFoamInner);
      expect(switched.uFoamLandReach).toBe(settlement.uFoamLandReach);
      expect(Array.from(switched.uFoamAlpha as Float32Array)).toEqual(
        Array.from(settlement.uFoamAlpha as Float32Array),
      );
    });

    it('is a no-op when the mode is unchanged', () => {
      const layer = new WaterLayer('world', TILE_W, TILE_H);
      const before = { ...uniformsOf(layer) };
      layer.setMode('world');
      expect(uniformsOf(layer)).toEqual(before);
    });

    it('flips uSeaBody on the next tick after switching', () => {
      // Sanity check that setMode changes real rendered behaviour, not just
      // the three foam uniforms it directly writes.
      const layer = new WaterLayer('world', TILE_W, TILE_H);
      layer.tick(0);
      expect(uniformsOf(layer).uSeaBody).toBe(1);

      layer.setMode('settlement');
      layer.tick(16);
      expect(uniformsOf(layer).uSeaBody).toBe(0);
    });
  });
});
