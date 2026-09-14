// @vitest-environment jsdom
// Pixi's GlProgram probes a throwaway canvas for the max fragment precision
// as it compiles, so constructing a real FogMaskLayer needs a DOM.
import { describe, expect, it } from 'vitest';
import type { UniformGroup } from 'pixi.js';
import { FogMaskLayer } from './FogMaskLayer';
import { MAX_ARMY_VISION_SOURCES } from './fogShader';

const COLORS = { scoutedColor: 0x102030, unexploredColor: 0xe9f0f4, scoutedAlpha: 0.5 };

function fogUniformsOf(layer: FogMaskLayer): UniformGroup {
  return layer.mesh.shader.resources.fogUniforms as UniformGroup;
}

describe('FogMaskLayer army vision sources', () => {
  // Regression: the uniform was declared without `size`, which Pixi defaults
  // to 1. A size-1 vec2 syncs via gl.uniform2f(v[0], v[1]), so only the first
  // point reached the GPU and every other slot of the shader's
  // `uArmyVisionSources[MAX_ARMY_VISION_SOURCES]` stayed at its (0, 0)
  // default. One army in transit hid the bug; a second one had the shader
  // read slot 1 as world origin and punch a reveal disc into the fog there,
  // far from any army.
  it('declares as many array slots as the shader reads', () => {
    const layer = new FogMaskLayer('unknown', COLORS);

    expect(fogUniformsOf(layer).uniformStructures.uArmyVisionSources.size).toBe(MAX_ARMY_VISION_SOURCES);
  });

  it('uploads every source, not just the first', () => {
    const layer = new FogMaskLayer('unknown', COLORS);

    layer.setArmyVisionSources(
      [
        { x: 11, y: 22 },
        { x: 33, y: 44 },
      ],
      7,
    );

    const uniforms = fogUniformsOf(layer).uniforms;
    expect(Array.from(uniforms.uArmyVisionSources as Float32Array).slice(0, 4)).toEqual([11, 22, 33, 44]);
    expect(uniforms.uArmyVisionCount).toBe(2);
    expect(uniforms.uArmyVisionRadius).toBe(7);
  });

  // The shader loops to uArmyVisionCount, so a count past the array length
  // would read slots that were never written — the same (0, 0) disc again.
  it('clamps the count to the array length', () => {
    const layer = new FogMaskLayer('unknown', COLORS);
    const points = Array.from({ length: MAX_ARMY_VISION_SOURCES + 3 }, (_, i) => ({ x: i, y: i }));

    layer.setArmyVisionSources(points, 7);

    expect(fogUniformsOf(layer).uniforms.uArmyVisionCount).toBe(MAX_ARMY_VISION_SOURCES);
  });
});
