// @vitest-environment jsdom
// Pixi's GlProgram probes a throwaway canvas for the max fragment precision
// as it compiles, so constructing a real filter needs a DOM.
import { describe, expect, it } from 'vitest';
import type { UniformGroup } from 'pixi.js';
import { FOG_DESATURATE_DEFAULTS, FogDesaturateFilter } from './FogDesaturateFilter';
import { FogField } from './FogField';
import { FOG_DESATURATE_FRAGMENT } from './fogShader';

function tuningUniformsOf(filter: FogDesaturateFilter): Record<string, unknown> {
  return (filter as unknown as { tuning: UniformGroup }).tuning.uniforms;
}

// Each fog debug slider and the uniform the dark tier's shader reads for it. A name that does not match the GLSL
// leaves the shader on its zero default without any error, so both ends are checked.
const SLIDER_UNIFORMS = [
  ['desaturate', 'uDesat'],
  ['brightPull', 'uPull'],
  ['darken', 'uDarken'],
  ['desaturateRamp', 'uSatRamp'],
] as const;

describe('FogDesaturateFilter', () => {
  it.each(SLIDER_UNIFORMS)('feeds the %s slider to a uniform the shader declares (%s)', (key, uniform) => {
    const filter = new FogDesaturateFilter(new FogField());

    filter.setTuning({ ...FOG_DESATURATE_DEFAULTS, [key]: 0.37 });

    expect(tuningUniformsOf(filter)[uniform]).toBeCloseTo(0.37);
    expect(FOG_DESATURATE_FRAGMENT).toMatch(new RegExp(`uniform float ${uniform};`));
  });

  it('starts on the default tuning before the first setTuning', () => {
    const uniforms = tuningUniformsOf(new FogDesaturateFilter(new FogField()));

    for (const [key, uniform] of SLIDER_UNIFORMS) {
      expect(uniforms[uniform]).toBeCloseTo(FOG_DESATURATE_DEFAULTS[key]);
    }
  });

  // The greying ramp eases only the colour: the dimming must stay on the plain ramp, or raising the ramp would also
  // darken the band past the edge of sight.
  it('applies the ramp to the greying but not to the dimming', () => {
    expect(FOG_DESATURATE_FRAGMENT).toMatch(/mix\(t, vec3\(lt\), aSat \* uDesat\)/);
    expect(FOG_DESATURATE_FRAGMENT).toMatch(/mix\(lum, pulled, aSat\)/);
    expect(FOG_DESATURATE_FRAGMENT).toMatch(/g \*= 1\.0 - uDarken \* aDark;/);
  });
});
