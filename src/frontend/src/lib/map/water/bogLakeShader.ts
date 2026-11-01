// The bog lake shader — docs/design/water-shader.md, "Bog lakes — gusts in step with the forest".
//
// Same portable conventions as waterShader.ts (no `#version` pragma, `in`/`out`, output named `finalColor`) and the same world-space vertex
// shader. It draws a premultiplied-alpha overlay over the painted lake water: a gust band travelling +x in step with the forests' sway
// (bogLakeGust.ts), in which the water gets darker fine ripples (the ruffle) and sparse bright glints. Between gusts the overlay is empty:
// calm water. Where the lake is comes from the baked wet mask (dryMaskCore.ts `lakeWetMaskHalf`), drawn into a render texture over the
// lakes' bounding rect by BogLakeLayer.
import { GUST_WAVELENGTH } from './bogLakeGust';

export { WATER_VERTEX as BOG_LAKE_VERTEX } from './waterShader';

/** A JS number as a GLSL float literal. */
const glFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Half-width of the gust band, in periods (the band is twice this wide): about 0.9 hex at the forest's wavelength. */
export const GUST_BAND_HALF_WIDTH = 0.16;

export const BOG_LAKE_FRAGMENT = `
precision highp float;

in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uLakeMask;

// Seconds on the animation clock (the forests' clock), for the ripples and glints.
uniform float uTime;
// The gust phase's time term in periods, wrapped to [0, 1) (bogLakeGust.ts gustTime).
uniform float uGustTime;
uniform float uTileW;
uniform float uGustPeak;
// 0 turns a look off; otherwise its strength.
uniform float uRuffle;
uniform float uGlints;

// bogLakeGust.ts gustPhase, with the time term already in uGustTime: the same wave the forest sway frames are drawn in.
const float GUST_WAVELENGTH = ${glFloat(GUST_WAVELENGTH)};
const float BAND_HALF = ${glFloat(GUST_BAND_HALF_WIDTH)};

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

float gustPhase(float x) {
  return uGustTime - x / (uTileW * 0.5) / GUST_WAVELENGTH;
}

// 1 at the gust's peak, 0 outside the band; the band's centre line wanders with y so it is not a ruler-straight vertical.
float gustEnvelope(vec2 w) {
  float wander = (vnoise(vec2(w.y / (uTileW * 0.9), uTime * 0.07)) - 0.5) * 0.14;
  float d = gustPhase(w.x) + wander - uGustPeak;
  d -= floor(d + 0.5);
  float e = 1.0 - smoothstep(0.0, BAND_HALF, abs(d));
  return e * e * (3.0 - 2.0 * e);
}

void main() {
  float lake = texture(uLakeMask, vUV).a;
  if (lake < 0.01 || (uRuffle <= 0.0 && uGlints <= 0.0)) {
    finalColor = vec4(0.0);
    return;
  }
  vec2 w = vWorld;
  float env = gustEnvelope(w);
  if (env <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }

  vec4 acc = vec4(0.0);

  // Ruffle: fine ripples, streaked perpendicular to the wind (narrow in x, long in y), drifting slowly with the gust and flickering.
  if (uRuffle > 0.0) {
    vec2 p = vec2(w.x * 0.22 - uTime * 7.0, w.y * 0.035);
    float n = 0.6 * vnoise(p) + 0.4 * vnoise(vec2(p.x * 2.3 + uTime * 1.3, p.y * 2.1 + uTime * 0.4));
    float streak = smoothstep(0.38, 0.78, n);
    float crest = smoothstep(0.66, 0.9, n);
    float shade = uRuffle * env * lake * (0.12 + 0.34 * streak);
    float light = uRuffle * env * lake * 0.16 * crest;
    // Premultiplied: a pale crest over a darkening.
    vec3 lightColor = vec3(0.45, 0.62, 0.78);
    acc = vec4(lightColor * light, light);
    acc.rgb *= 1.0 - shade;
    acc.a = acc.a + shade * (1.0 - acc.a);
  }

  // Glints: sun glitter on the gust-roughened water. Short horizontal streaks (a bright core in a soft halo) in a jittered grid, each
  // fading in and out on its own beat, only inside the band — so they ride with the gust and the calm water between gusts has none.
  if (uGlints > 0.0) {
    float cell = 12.0;
    vec2 id = floor(w / cell);
    float h = hash21(id + 7.31);
    float keep = step(0.55, h);
    vec2 centre = (id + 0.2 + 0.6 * vec2(hash21(id + 1.7), hash21(id + 3.9))) * cell;
    vec2 d = (w - centre) / vec2(7.0, 2.0);
    float r = length(d);
    float core = 1.0 - smoothstep(0.15, 0.55, r);
    float halo = 1.0 - smoothstep(0.4, 1.0, r);
    float beat = 0.5 + 0.5 * sin(uTime * (2.0 + 3.0 * hash21(id + 5.5)) + h * 40.0);
    float flicker = smoothstep(0.35, 0.9, beat);
    float g = clamp(keep * flicker * env * lake * uGlints * (0.95 * core + 0.35 * halo), 0.0, 1.0);
    vec3 glintColor = vec3(0.86, 0.94, 1.0);
    acc.rgb = acc.rgb * (1.0 - g) + glintColor * g;
    acc.a = acc.a + g * (1.0 - acc.a);
  }

  finalColor = acc;
}
`;
