// @vitest-environment jsdom
// Pixi's GlProgram probes a throwaway canvas for the max fragment precision
// as it compiles, so constructing a real FogField needs a DOM.
import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture, type Renderer, type UniformGroup } from 'pixi.js';
import { FogField } from './FogField';
import { MAX_ARMY_VISION_SOURCES } from './fogShader';
import { FOG_FIELD_DRIFT_INTERVAL_MS } from './fogFieldPlan';

function fogUniformsOf(field: FogField): UniformGroup {
  return (field as unknown as { uniforms: UniformGroup }).uniforms;
}

describe('FogField army vision sources', () => {
  // Regression: the uniform was declared without `size`, which Pixi defaults
  // to 1. A size-1 vec2 syncs via gl.uniform2f(v[0], v[1]), so only the first
  // point reached the GPU and every other slot of the shader's
  // `uArmyVisionSources[MAX_ARMY_VISION_SOURCES]` stayed at its (0, 0)
  // default. One army in transit hid the bug; a second one had the shader
  // read slot 1 as world origin and punch a reveal disc into the fog there,
  // far from any army.
  it('declares as many array slots as the shader reads', () => {
    const layer = new FogField();

    expect(fogUniformsOf(layer).uniformStructures.uArmyVisionSources.size).toBe(MAX_ARMY_VISION_SOURCES);
  });

  it('uploads every source, not just the first', () => {
    const layer = new FogField();

    layer.setArmyVisionSources(
      [
        { x: 11, y: 22, radiusHexes: 6 },
        { x: 33, y: 44, radiusHexes: 1 },
      ],
      { x: 3, y: 4 },
    );

    const uniforms = fogUniformsOf(layer).uniforms;
    expect(Array.from(uniforms.uArmyVisionSources as Float32Array).slice(0, 4)).toEqual([11, 22, 33, 44]);
    expect(uniforms.uArmyVisionCount).toBe(2);
    expect(Array.from(uniforms.uArmyHexSize as Float32Array)).toEqual([3, 4]);
  });

  it('uploads one radius per source, in the same slot order', () => {
    const layer = new FogField();

    layer.setArmyVisionSources(
      [
        { x: 0, y: 0, radiusHexes: 6 },
        { x: 1, y: 1, radiusHexes: 1 },
        { x: 2, y: 2, radiusHexes: 3 },
      ],
      { x: 1, y: 1 },
    );

    const radii = fogUniformsOf(layer).uniforms.uArmyVisionRadii as Float32Array;
    expect(Array.from(radii).slice(0, 3)).toEqual([6, 1, 3]);
  });

  it('declares one radius slot per source slot', () => {
    const layer = new FogField();

    expect(fogUniformsOf(layer).uniformStructures.uArmyVisionRadii.size).toBe(MAX_ARMY_VISION_SOURCES);
  });

  // The ramps are per source now: the uniform only carries the offsets and margins relative to a source's own radius, so
  // it no longer moves with any one army's vision.
  it('keeps the ramp offsets and margins relative to each source radius', () => {
    const layer = new FogField();
    const ramp = () => Array.from(fogUniformsOf(layer).uniforms.uArmyRamp as Float32Array);
    const before = ramp();

    layer.setArmyVisionSources([{ x: 0, y: 0, radiusHexes: 3 }], { x: 1, y: 1 });

    expect(before).toEqual([-0.25, 2, 0.75, 6]);
    expect(ramp()).toEqual(before);
  });

  // The shader loops to uArmyVisionCount, so a count past the array length
  // would read slots that were never written — the same (0, 0) disc again.
  it('clamps the count to the array length', () => {
    const layer = new FogField();
    const points = Array.from({ length: MAX_ARMY_VISION_SOURCES + 3 }, (_, i) => ({ x: i, y: i, radiusHexes: 2 }));

    layer.setArmyVisionSources(points, { x: 1, y: 1 });

    expect(fogUniformsOf(layer).uniforms.uArmyVisionCount).toBe(MAX_ARMY_VISION_SOURCES);
  });
});

describe('FogField update rules', () => {
  const CAMERA = { x: 100, y: 50, zoom: 1 };
  const VIEWPORT = { width: 800, height: 600 };
  const SOURCES = () => [{ x: 5, y: 6, radiusHexes: 3 }];
  const HEX = { x: 2, y: 3 };

  function setup() {
    const render = vi.fn();
    const renderer = { render } as unknown as Renderer;
    const field = new FogField();
    field.setCamera(CAMERA, VIEWPORT);
    field.setArmyVisionSources(SOURCES(), HEX);
    field.setDebug({ warpEnabled: true, showRawMask: false, showEffectiveMask: false });
    return { field, render, renderer };
  }

  it('does not render again while idle, however often unchanged values are pushed in', () => {
    const { field, render, renderer } = setup();
    field.tick(0, false);
    expect(field.update(renderer)).toBe(true);

    for (let i = 1; i <= 5; i++) {
      field.setArmyVisionSources(SOURCES(), HEX);
      field.setDebug({ warpEnabled: true, showRawMask: false, showEffectiveMask: false });
      field.setCamera({ ...CAMERA }, { ...VIEWPORT });
      field.tick(i * 1000, false);
      expect(field.update(renderer)).toBe(false);
    }

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders once per drift interval while drifting', () => {
    const { field, render, renderer } = setup();
    field.tick(0, true);
    field.update(renderer);

    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS - 1, true);
    field.update(renderer);
    expect(render).toHaveBeenCalledTimes(1);

    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS, true);
    field.update(renderer);
    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS + 50, true);
    field.update(renderer);
    expect(render).toHaveBeenCalledTimes(2);

    field.tick(2 * FOG_FIELD_DRIFT_INTERVAL_MS, true);
    field.update(renderer);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('cross-fades from the previous drift snapshot to the newest over one interval, and shows other renders alone', () => {
    const { field, renderer } = setup();
    const blendB = () => field.compositeUniforms.uniforms.uFieldBlendB as number;
    field.tick(0, true);
    field.update(renderer); // first render: slot B (newest starts at A), shown alone
    expect(blendB()).toBe(1);

    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS, true);
    field.update(renderer); // drift render into slot A; B is the previous snapshot
    expect(blendB()).toBe(1);
    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS + FOG_FIELD_DRIFT_INTERVAL_MS / 2, true);
    field.update(renderer);
    expect(blendB()).toBeCloseTo(0.5);
    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS * 2 - 1, true);
    field.update(renderer);
    expect(blendB()).toBeLessThan(0.01);

    field.setArmyVisionSources([{ x: 9, y: 9, radiusHexes: 3 }], HEX); // a non-drift trigger: only the new render shows
    field.tick(FOG_FIELD_DRIFT_INTERVAL_MS * 2, true);
    field.update(renderer);
    expect(blendB()).toBe(1);
  });

  // update() is not called while the fog quads are hidden, so a fade that ends in that time must still be rendered later.
  it('re-renders after a reveal fade that finished while the field was not being updated', () => {
    const { field, render, renderer } = setup();
    field.tick(0, false);
    field.update(renderer);
    const placeholder = new Texture({ source: new BufferImageSource({ resource: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1 }) });
    field.setMaskTexture(placeholder);
    field.tick(performance.now(), false);
    field.update(renderer);
    const rendered = render.mock.calls.length;

    field.tick(performance.now() + 5000, false); // the fade completes here, with no update() call
    field.tick(performance.now() + 6000, false);

    expect(field.update(renderer)).toBe(true);
    expect(render.mock.calls.length).toBe(rendered + 1);
    field.tick(performance.now() + 7000, false);
    expect(field.update(renderer)).toBe(false);
  });
});
