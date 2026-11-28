// The fog's dark tier (map-fog-v2.md §1): not an overlay but a Pixi filter over everything under the markers, which greys
// the picture where the shared fog field's R channel (dark tier alpha) is set. It samples the same field as the mist quad,
// through the same shared GLSL (fogShader.ts's FOG_FIELD_SAMPLE_GLSL) and the same uniform group (FogField.compositeUniforms),
// so there is exactly one implementation of the field's world mapping and snapshot blend.
//
// Cost: while the filter is on, the container it sits on is rendered into one offscreen render target per frame and drawn
// back through this shader. `filterArea` is pinned to the renderer's screen rectangle (setScreenSize) so Pixi does not
// measure the world's bounds every frame, and `resolution`/`antialias` 'inherit' the canvas's, so the target is the canvas's size.
import { defaultFilterVert, Filter, GlProgram, Rectangle, UniformGroup } from 'pixi.js';
import { hexToRgb01 } from '../shaderResources';
import { FOG_DESATURATE_FRAGMENT } from './fogShader';
import type { FogField } from './FogField';

/** The dark tier's tint where the canvas is transparent (a CSS backdrop shows through): today's scouted-but-out-of-sight colour. */
export const FOG_SCOUTED = 0x0b1116;

/** The live-tunable strengths (FogDebugPanel's sliders), each 0..1. */
export interface FogDesaturateTuning {
  /** How much of the colour is removed where the dark tier is full. */
  desaturate: number;
  /** How far bright tones (sand, foam, snow) are pulled toward mid grey first. */
  brightPull: number;
  /** How much the dark tier dims the picture. */
  darken: number;
  /**
   * How fast the greying (desaturate and bright pull) reaches full strength across the dark tier's ramp: the strength is
   * 1 - (1 - alpha)^ramp, so 1 is linear and higher values grey the land closer to the edge of sight. Dimming stays linear.
   */
  desaturateRamp: number;
}

export const FOG_DESATURATE_DEFAULTS: FogDesaturateTuning = { desaturate: 0.88, brightPull: 0.6, darken: 0.5, desaturateRamp: 1.5 };

let sharedGlProgram: GlProgram | null = null;
function desaturateGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: defaultFilterVert, fragment: FOG_DESATURATE_FRAGMENT, name: 'fog-desaturate' });
  return sharedGlProgram;
}

export class FogDesaturateFilter extends Filter {
  private readonly tuning: UniformGroup;

  constructor(field: FogField) {
    const [r, g, b] = hexToRgb01(FOG_SCOUTED);
    const tuning = new UniformGroup({
      uDesat: { value: FOG_DESATURATE_DEFAULTS.desaturate, type: 'f32' },
      uPull: { value: FOG_DESATURATE_DEFAULTS.brightPull, type: 'f32' },
      uDarken: { value: FOG_DESATURATE_DEFAULTS.darken, type: 'f32' },
      uSatRamp: { value: FOG_DESATURATE_DEFAULTS.desaturateRamp, type: 'f32' },
      uScoutedColor: { value: new Float32Array([r, g, b]), type: 'vec3<f32>' },
    });
    super({
      glProgram: desaturateGlProgram(),
      resolution: 'inherit',
      antialias: 'inherit',
      resources: {
        fogDesaturateUniforms: tuning,
        fogFieldUniforms: field.compositeUniforms,
        uFieldA: field.textures[0].source,
        uFieldB: field.textures[1].source,
      },
    });
    this.tuning = tuning;
  }

  /** Writes the slider values; cheap (four uniforms), called every frame. */
  setTuning(values: FogDesaturateTuning): void {
    const u = this.tuning.uniforms;
    u.uDesat = values.desaturate;
    u.uPull = values.brightPull;
    u.uDarken = values.darken;
    u.uSatRamp = values.desaturateRamp;
  }
}

/** The renderer's screen rectangle in the filtered container's own coordinates (the container sits at the stage origin). */
export function fogFilterArea(width: number, height: number): Rectangle {
  return new Rectangle(0, 0, width, height);
}
