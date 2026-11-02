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
// Foam line style (design round 4): 0 strands, 1 tapered strands, 2 crest + shadow, 3 micro curls, 4 ring arcs, 5 glint squiggles.
uniform float uFoamStyle;
// The world rect the lake mask covers: its top-left corner and its size (vUV 0..1 maps linearly onto it).
uniform vec2 uLakeOrigin;
uniform vec2 uLakeSize;
// Blops (not gust-gated, ignore the wind): strength, 0 = off; density = chance a cell's cycle shows its curl.
uniform float uBlops;
uniform float uBlopDensity;
// Blop curl size multiplier (1 = ring radius 9 world units).
uniform float uBlopSize;

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

// The micro curl: a thin crescent ")" opening toward -x, p relative to its centre in world units, ring radius rad, the line fading
// out between lineIn and lineOut world units from the ring. Squashed in y like the ground. Shared by the micro curls foam style and
// the blops, so both draw the same mark.
float curlShape(vec2 p, float rad, float lineIn, float lineOut) {
  p *= vec2(1.0, 0.6);
  float ring = abs(length(p) - rad);
  float arc = 1.0 - smoothstep(0.4, 1.6, abs(atan(p.y, p.x)));
  return (1.0 - smoothstep(lineIn, lineOut, ring)) * arc;
}

// Distance to the nearest crest line across the wind, in world units, and the line's index: the crests are wiggly lines roughly
// perpendicular to the wind (+x), uFoamSpacing apart, sliding downwind.
vec2 crestField(vec2 w, float t) {
  float u = w.x + 7.0 * (fbm(vec2(w.y * 0.05, w.x * 0.01 + t * 0.2)) - 0.5) * 2.0;
  float k = u / max(uFoamSpacing, 1.0) - t * 1.2;
  return vec2((fract(k) - 0.5) * uFoamSpacing, floor(k));
}

// Foam look for uFoamStyle: x = light alpha, y = dark alpha (premultiplied black under it), before strength, envelope and mask.
vec2 foamLook(vec2 w, float t) {
  float halfW = uFoamWidth * uFoamSpacing;
  if (uFoamStyle < 0.5) {
    // 0 strands: the first version, even width, broken into pieces.
    vec2 c = crestField(w, t);
    float line = 1.0 - smoothstep(halfW * 0.5, halfW * 1.5, abs(c.x));
    float seg = smoothstep(0.45, 0.6, vnoise(vec2(c.y * 3.7, w.y * 0.07 + c.y)));
    return vec2(line * seg * 0.9, 0.0);
  }
  if (uFoamStyle < 2.5) {
    // 1 tapered strands: short pieces that swell in the middle and thin out to points at both ends.
    // 2 crest + shadow: the same, with a darker trough line just downwind of each crest (cel-shaded ripple).
    vec2 c = crestField(w, t);
    float segLen = 26.0;
    float a = w.y / segLen + hash21(vec2(c.y, 3.1));
    float id = floor(a);
    float along = fract(a);
    float keep = step(0.35, hash21(vec2(c.y, id)));
    float taper = pow(max(sin(3.14159 * along), 0.0), 0.8);
    float hw = halfW * (0.35 + 0.9 * taper);
    float line = (1.0 - smoothstep(hw * 0.6, hw * 1.3, abs(c.x))) * keep * smoothstep(0.02, 0.2, taper);
    if (uFoamStyle < 1.5) return vec2(line * 0.9, 0.0);
    float shadowOffset = halfW * 2.4;
    float shadow = (1.0 - smoothstep(hw * 0.5, hw * 1.4, abs(c.x - shadowOffset))) * keep * smoothstep(0.02, 0.2, taper);
    return vec2(line * 0.85, shadow * 0.45);
  }
  if (uFoamStyle < 3.5) {
    // 3 micro curls: small crescent ripples scattered in the band, opening downwind, each fading in and out.
    float cell = uFoamSpacing * 0.8;
    vec2 q = w + vec2(-t * 18.0, 0.0);
    vec2 id = floor(q / cell);
    float h = hash21(id + 0.7);
    if (h < 0.4) return vec2(0.0);
    vec2 centre = (id + 0.25 + 0.5 * vec2(hash21(id + 1.3), hash21(id + 2.9))) * cell;
    float rad = cell * (0.22 + 0.12 * hash21(id + 4.1));
    float curl = curlShape(q - centre, rad, halfW * 0.25, halfW * 0.7);
    float beat = smoothstep(0.25, 0.85, 0.5 + 0.5 * sin(t * (1.2 + 1.5 * h) + h * 30.0));
    return vec2(curl * beat * 0.9, 0.0);
  }
  if (uFoamStyle < 4.5) {
    // 4 ring arcs: fragments of wide concentric rings, like ripples spreading from a disturbance upwind, broken by noise.
    float cell = uFoamSpacing * 6.0;
    vec2 q = w + vec2(-t * 18.0, 0.0);
    vec2 id = floor(q / cell);
    vec2 centre = (id + vec2(0.1, 0.5)) * cell;
    vec2 p = (q - centre) * vec2(1.0, 1.6);
    float r = length(p);
    float k = r / uFoamSpacing - t * 0.8;
    float d = (fract(k) - 0.5) * uFoamSpacing;
    float ring = 1.0 - smoothstep(halfW * 0.5, halfW * 1.3, abs(d));
    float frag = smoothstep(0.45, 0.62, vnoise(vec2(floor(k) * 2.3, atan(p.y, p.x) * 3.0)));
    float fade = 1.0 - smoothstep(cell * 0.3, cell * 0.95, r);
    return vec2(ring * frag * fade * 0.85, 0.0);
  }
  // 5 glint squiggles: short bright wavy threads running with the wind, like light refracted on a ruffled surface.
  float row = uFoamSpacing * 0.7;
  float yy = w.y / row;
  float rid = floor(yy);
  float yIn = (fract(yy) - 0.5) * row;
  float x = w.x - t * 30.0 + hash21(vec2(rid, 9.0)) * 200.0;
  float hr = hash21(vec2(rid, 2.0));
  float wave = (sin(x * (0.22 + 0.25 * hr) + hr * 6.28) * (0.6 + 0.4 * vnoise(vec2(x * 0.05, rid))) + 0.4 * (vnoise(vec2(x * 0.11, rid * 3.3)) - 0.5)) * row * 0.16;
  float thread = 1.0 - smoothstep(halfW * 0.3, halfW * 0.8, abs(yIn - wave));
  float seg = smoothstep(0.55, 0.7, vnoise(vec2(x * 0.04, rid * 5.1)));
  return vec2(thread * seg * 0.9, 0.0);
}


// Lake mask at a world-unit offset from the pixel (the mask is 1 render-texture px per world unit, so this is a point sample).
float maskAt(vec2 w, vec2 off) {
  return texture(uLakeMask, (w + off - uLakeOrigin) / uLakeSize).a;
}

// Blops: micro curls (curlShape) that appear at random spots, all facing the same way, and fade again — about one per hex at a time.
// A jittered grid of hex-sized cells, each with its own cycle (period, phase) and a fresh random spot per cycle; a cycle shows its curl
// with probability uBlopDensity. The spot must sit well inside the water, else that cycle shows nothing, and the spot is inset so a curl
// never reaches the next cell.
float blops(vec2 w, float t) {
  // Cells smaller than a hex (TILE_W 168 -> ~77 world units square): spots near the bank fail the water check, so this lands at about one
  // curl per hex of lake on average.
  float cell = uTileW * 0.46;
  vec2 id = floor(w / cell);
  float h = hash21(id + 3.3);
  float period = 2.8 + 0.8 * h;
  float tt = t + hash21(id + 8.8) * period;
  float cycle = floor(tt / period);
  float local = fract(tt / period) * period;
  float lifeSec = 2.0 + 0.6 * hash21(id + cycle * 1.7);
  if (local > lifeSec) return 0.0;
  if (hash21(id * 1.3 + cycle * 7.1 + 0.4) > uBlopDensity) return 0.0;
  float rad = 9.0 * uBlopSize * (0.85 + 0.3 * hash21(id + cycle * 5.3));
  // The curl reaches rad across and rad / 0.6 up and down (squashed in y), plus its line and a margin.
  vec2 reach2 = vec2(rad + 4.0, rad / 0.6 + 4.0);
  float reach = reach2.y;
  float inset = min(0.45, reach / cell);
  vec2 centre = (id + inset + (1.0 - 2.0 * inset) * vec2(hash21(id + cycle * 2.3 + 1.1), hash21(id + cycle * 3.9 + 5.7))) * cell;
  vec2 p = w - centre;
  if (dot(p, p) > reach * reach) return 0.0;
  if (maskAt(centre, vec2(0.0)) < 0.9) return 0.0;
  if (maskAt(centre, vec2(reach2.x, 0.0)) < 0.9 || maskAt(centre, vec2(-reach2.x, 0.0)) < 0.9) return 0.0;
  if (maskAt(centre, vec2(0.0, reach2.y)) < 0.9 || maskAt(centre, vec2(0.0, -reach2.y)) < 0.9) return 0.0;
  float age = local / lifeSec;
  float life = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.55, 1.0, age));
  return curlShape(p, rad, 0.6, 1.5) * life * 0.85;
}

// Premultiplied colour c at alpha a.
vec4 over(vec3 c, float a) { return vec4(c * a, a); }

// a drawn over b, both premultiplied.
vec4 stack(vec4 a, vec4 b) { return a + b * (1.0 - a.a); }

void main() {
  float lake = texture(uLakeMask, vUV).a;
  bool gustLooks = uFoam > 0.0 || uSheen > 0.0 || uCatsPaws > 0.0;
  if (lake < 0.01 || (!gustLooks && uBlops <= 0.0)) {
    finalColor = vec4(0.0);
    return;
  }
  vec2 w = vWorld;
  float t = uTime;
  vec4 acc = vec4(0.0);

  // The wind gust looks, only inside the gust band.
  float env = gustLooks ? gustEnvelope(w) : 0.0;
  if (env > 0.0) {
    vec2 drift = vec2(-t * 40.0, 0.0);

    // Cat's paws: matte darker patches where the wind roughens the surface, with a fine grain inside. Bottom of the stack.
    if (uCatsPaws > 0.0) {
      float n = fbm((w + drift * 1.5) * vec2(0.02, 0.03));
      float paws = smoothstep(0.42, 0.55, n) * env;
      float grain = vnoise(w * vec2(0.6, 0.25) + vec2(-t * 9.0, 0.0));
      acc = vec4(vec3(0.0), clamp(uCatsPaws * paws * (0.26 + 0.1 * grain), 0.0, 1.0));
    }

    // Soft sheen: a broad, almost featureless lightening that sweeps across with the gust.
    if (uSheen > 0.0) {
      float n = 0.65 + 0.35 * vnoise(w * 0.008 + vec2(t * 0.05, 0.0));
      acc = stack(over(vec3(0.42, 0.60, 0.78), clamp(uSheen * env * n * 0.3, 0.0, 1.0)), acc);
    }

    // Foam lines (foamLook, uFoamStyle): light crests across the wind, sliding downwind; style 2 adds a dark trough line.
    if (uFoam > 0.0) {
      vec2 f = foamLook(w, t);
      acc = stack(vec4(vec3(0.0), clamp(uFoam * f.y * env, 0.0, 1.0)), acc);
      acc = stack(over(vec3(0.92, 0.95, 0.97), clamp(uFoam * f.x * env, 0.0, 1.0)), acc);
    }
  }

  // Blops: independent of the wind, top of the stack.
  if (uBlops > 0.0) {
    acc = stack(over(vec3(0.94, 0.97, 0.98), clamp(uBlops * blops(w, t), 0.0, 1.0)), acc);
  }

  finalColor = acc * lake;
}
`;
