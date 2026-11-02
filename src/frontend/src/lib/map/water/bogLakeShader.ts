// The bog lake shader — docs/design/water-shader.md, "Bog lakes — gusts in step with the forest".
//
// Same portable conventions as waterShader.ts (no `#version` pragma, `in`/`out`, output named `finalColor`) and the same world-space vertex
// shader. It draws a premultiplied-alpha overlay over the painted lake water: a gust band travelling +x in step with the forests' sway
// (bogLakeGust.ts). Inside the band the water gets up to three looks, each with its own strength (0 = off): white foam lines across the
// wind, a soft sheen, and cat's paws (darker matte patches). Between gusts the overlay is empty: calm water. Where the lake is comes from
// the baked wet mask (dryMaskCore.ts `lakeWetMaskHalf`), drawn into a render texture over the lakes' bounding rect by BogLakeLayer.
import { GUST_WAVELENGTH } from './bogLakeGust';

export { WATER_VERTEX as BOG_LAKE_VERTEX } from './waterShader';

/** A JS number as a GLSL float literal. */
const glFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Default half-width of the gust band, in periods (the band is twice this wide): about 0.9 hex at the forest's wavelength. */
export const GUST_BAND_HALF_WIDTH = 0.16;

export const BOG_LAKE_FRAGMENT = `
precision highp float;

in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uLakeMask;

// Seconds on the animation clock (the forests' clock), for the drift inside the band.
uniform float uTime;
// The gust phase's time term in periods, wrapped to [0, 1) (bogLakeGust.ts gustTime).
uniform float uGustTime;
uniform float uTileW;
uniform float uGustPeak;
// Half-width of the gust band, in periods.
uniform float uBandHalf;
// Each look's strength; 0 turns it off.
uniform float uFoam;
uniform float uSheen;
uniform float uCatsPaws;
// Foam lines: half-width of a line as a share of the line spacing, and the spacing in world units.
uniform float uFoamWidth;
uniform float uFoamSpacing;

// bogLakeGust.ts gustPhase, with the time term already in uGustTime: the same wave the forest sway frames are drawn in.
const float GUST_WAVELENGTH = ${glFloat(GUST_WAVELENGTH)};

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 17.1) + 0.2 * vnoise(p * 4.01 + 41.7);
}

float gustPhase(float x) {
  return uGustTime - x / (uTileW * 0.5) / GUST_WAVELENGTH;
}

// 1 at the gust's peak, 0 outside the band; the band's centre line wanders with y so it is not a ruler-straight vertical.
float gustEnvelope(vec2 w) {
  float wander = (vnoise(vec2(w.y / (uTileW * 0.9), uTime * 0.07)) - 0.5) * 0.14;
  float d = gustPhase(w.x) + wander - uGustPeak;
  d -= floor(d + 0.5);
  float e = 1.0 - smoothstep(0.0, max(uBandHalf, 0.001), abs(d));
  return e * e * (3.0 - 2.0 * e);
}

// Premultiplied colour c at alpha a.
vec4 over(vec3 c, float a) { return vec4(c * a, a); }

// a drawn over b, both premultiplied.
vec4 stack(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }

void main() {
  float lake = texture(uLakeMask, vUV).a;
  if (lake < 0.01 || (uFoam <= 0.0 && uSheen <= 0.0 && uCatsPaws <= 0.0)) {
    finalColor = vec4(0.0);
    return;
  }
  vec2 w = vWorld;
  float env = gustEnvelope(w);
  if (env <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  float t = uTime;
  vec2 drift = vec2(-t * 40.0, 0.0);
  vec4 acc = vec4(0.0);

  // Cat's paws: matte darker patches where the wind roughens the surface, with a fine grain inside. Bottom of the stack.
  if (uCatsPaws > 0.0) {
    float n = fbm((w + drift * 1.5) * vec2(0.02, 0.03));
    float patch = smoothstep(0.42, 0.55, n) * env;
    float grain = vnoise(w * vec2(0.6, 0.25) + vec2(-t * 9.0, 0.0));
    acc = vec4(vec3(0.0), clamp(uCatsPaws * patch * (0.26 + 0.1 * grain), 0.0, 1.0));
  }

  // Soft sheen: a broad, almost featureless lightening that sweeps across with the gust.
  if (uSheen > 0.0) {
    float n = 0.65 + 0.35 * vnoise(w * 0.008 + vec2(t * 0.05, 0.0));
    acc = stack(over(vec3(0.42, 0.60, 0.78), clamp(uSheen * env * n * 0.3, 0.0, 1.0)), acc);
  }

  // Foam lines: wiggly white crest strands across the wind, broken into pieces, sliding downwind. Top of the stack.
  if (uFoam > 0.0) {
    float u = w.x + 7.0 * (fbm(vec2(w.y * 0.05, w.x * 0.01 + t * 0.2)) - 0.5) * 2.0;
    float k = u / max(uFoamSpacing, 1.0) - t * 1.2;
    float f = fract(k) - 0.5;
    float line = 1.0 - smoothstep(uFoamWidth * 0.5, uFoamWidth * 1.5, abs(f));
    float seg = smoothstep(0.45, 0.6, vnoise(vec2(floor(k) * 3.7, w.y * 0.07 + floor(k))));
    acc = stack(over(vec3(0.92, 0.95, 0.97), clamp(uFoam * line * seg * env * 0.9, 0.0, 1.0)), acc);
  }

  finalColor = acc * lake;
}
`;
