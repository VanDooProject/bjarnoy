// @vitest-environment jsdom
// Pixi's GlProgram probes a throwaway canvas for the max fragment precision
// as it compiles, so constructing a real FogField needs a DOM.
import { describe, expect, it } from 'vitest';
import type { UniformGroup } from 'pixi.js';
import { FogField } from './FogField';
import { MAX_ARMY_VISION_SOURCES } from './fogShader';

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
