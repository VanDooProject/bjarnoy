// The river shader — docs/design/water-shader.md §4.4e. The river flow drawing, on its own mesh (RiverLayer) over the river flow
// texture's world rect only, so the water shader (waterShader.ts) that every water and land pixel runs carries none of this code.
//
// Same portable GLSL convention as the water shader (no `#version` pragma, `in`/`out`/`texture()`, an output named `finalColor`).
// It shares the water shader's vertex shader (WATER_VERTEX: it only needs the world position), the texture-backed noise
// (NOISE_LATTICE_GLSL) and `fbm` (WATER_FBM_GLSL) instead of repeating them.

import { NOISE_LATTICE_GLSL } from "../shaderNoise";
import { WATER_FBM_GLSL } from "./waterShader";

/**
 * How the river looks that drift downstream (cartoon patches, flow streaks' dashes, specks) are carried: each is a noise grid of
 * `grid` cells per noise cell scale (the river noise scale, `uRiverScale`), shifted along the flow by `shift` cells per cycle, at
 * `rate` cycles per second. Along-stream speed in world units per second = shift * rate / (grid * uRiverScale). They are chosen to
 * match the ripples' (`RIVER_SPEED_TURNS_PER_SECOND` periods per second of `RIPPLE_WAVELENGTH_TEXELS` texels).
 */
export const RIVER_DRIFT = {
  speck: { grid: 5, shift: 4, rate: 0.9, gain: 1.28 },
  patch: { grid: 0.15, shift: 0.28, rate: 0.5, gain: 1.6 },
} as const;
const glsl = (v: number): string => v.toFixed(3);

export const RIVER_FRAGMENT = `
precision highp float;

in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uWaterMask;
uniform sampler2D uRiverFlow;
uniform sampler2D uRiverPsi;

uniform float uTime;
uniform float uGroundSquash;
// The water mask's world rect: (minX, minY, 1 / width, 1 / height). The mask has its own UVs, not this mesh's.
uniform vec4 uMaskRect;
// The mask's signed near field is decoded back into tile widths with this, the same as the water shader does.
uniform float uNearSpan;
uniform float uShowRiverFlow;
uniform float uRiverStyle;
uniform vec4 uRiverRect;
uniform float uRiverSpeed;
uniform float uRiverArc;
uniform float uRiverStreakMix;
uniform float uRiverAlpha;
uniform vec3 uRiverColor;
uniform float uRiverScale;

${NOISE_LATTICE_GLSL}
${WATER_FBM_GLSL}

// The river ripple field (docs/design/water-shader.md §4.4e), premultiplied RGBA: rg = (cos, sin) of the ripple phase
// * 0.5 + 0.5, b = intensity (0 at the bank), a = 1 where the river hex has flow. Its own UVs (riverUV). Returns the
// un-premultiplied value, zero where no river hex is drawn.
vec4 sampleRiverFlowAt(vec2 uv) {
  vec4 f = texture(uRiverFlow, uv);
  return f.a > 0.01 ? vec4(f.rgb / f.a, f.a) : vec4(0.0);
}
// The river texture covers its own world rect (the river cells), not the water mask's: its UVs come from vWorld.
vec2 riverUV() {
  return (vWorld - uRiverRect.xy) * uRiverRect.zw;
}
vec4 sampleRiverFlow() {
  return sampleRiverFlowAt(riverUV());
}

// The stored phase as a unit (cos, sin) pair: filtering the encoded pair shortens it, so it is renormalised.
vec2 riverPhase(vec4 flow) {
  vec2 cs = flow.rg * 2.0 - 1.0;
  return cs / max(length(cs), 1e-3);
}

const float RIVER_CREST_EDGE = 0.85;

// The stored phase rotated by time: (cos, sin) of theta + uRiverSpeed * uTime. Moving along the stream means moving round this
// circle, so anything looked up with it repeats every wavelength; it is always mixed with ground noise to hide that.
vec2 riverPhaseNow(vec2 cs) {
  float t = uRiverSpeed * uTime;
  return vec2(cs.x * cos(t) - cs.y * sin(t), cs.x * sin(t) + cs.y * cos(t));
}

// Style 0, ripple arcs: thin light crests where the stored phase, rotated by uTime * uRiverSpeed, is near a whole turn, less a lag
// towards the banks (the crests bow downstream in the middle). The phase is a multiple of the potential, so the crests cross the
// channel and slide towards the out edge (potential 0). Low-frequency noise in ground space breaks each crest into ripple
// pieces. centre: 0 at the bank, 1 from the channel's middle. Returns premultiplied colour.
vec4 riverRipples(vec2 cs, float centre, vec2 ground) {
  // The ripples fade out over the first quarter of centre (4 of 16 texels); the crests lag at the banks by uRiverArc periods
  // (1 - centre)^2, so the middle leads downstream and a crest is an arc.
  float intensity = smoothstep(0.0, 0.25, centre);
  float lag = uRiverArc * (1.0 - centre) * (1.0 - centre) * 6.2831853;
  float turn = uRiverSpeed * uTime - lag;
  float c = cs.x * cos(turn) - cs.y * sin(turn);
  float crest = smoothstep(RIVER_CREST_EDGE, 0.985, c);
  // The break-up noise moves with the phase, so no stretch of the river stays empty for good.
  vec2 p = riverPhaseNow(cs);
  float broken = smoothstep(0.2, 0.4, noise(ground * uRiverScale + p * 1.1) * 0.7 + noise(ground * uRiverScale * 2.3 + 11.0 - p * 0.9) * 0.3);
  float alpha = crest * broken * intensity * uRiverAlpha;
  return vec4(uRiverColor * alpha, alpha);
}

// The ground gradient of the stored phase at this pixel (its direction is across the ripples, up the potential), from two more
// taps of the flow texture 3 world units away. No dFdx: this shader has to compile as WebGL1 (see the header).
vec2 riverPhaseGradient(vec2 cs) {
  const float H = 3.0;
  vec4 tx = sampleRiverFlowAt(riverUV() + vec2(H * uRiverRect.z, 0.0));
  vec4 ty = sampleRiverFlowAt(riverUV() + vec2(0.0, H * uRiverRect.w));
  vec2 px = tx.a > 0.5 ? riverPhase(tx) : cs;
  vec2 py = ty.a > 0.5 ? riverPhase(ty) : cs;
  // sin of the angle from cs to the tap: its cross product.
  return vec2(cs.x * px.y - cs.y * px.x, (cs.x * py.y - cs.y * py.x) * uGroundSquash) / H;
}

// Premultiplied "over": b drawn over a.
vec4 riverOver(vec4 a, vec4 b) {
  return b + a * (1.0 - b.a);
}

// The stream function psi (0 on the right bank looking downstream, 1 on the left) is the psi texture's blue channel, full range per
// cell; its contour lines are the streamlines. The lane coordinate is the mapped psi times a lane count, the same for every cell.

// The mapping bytes of the psi texture at a uv: offset and signed scale, so that offset + scale * psi is the cell's psi in the stream
// function of the whole drawn river (continuous across a confluence seam; RiverFlow.encodePsiRange).
vec2 riverPsiMappingAt(vec4 f) {
  if (f.a < 0.5) return vec2(0.0, 1.0);
  vec2 bytes = floor(f.rg / f.a * 255.0 + 0.5);
  float negative = bytes.y >= 128.0 ? 1.0 : 0.0;
  float scale = exp2(-(bytes.y - 128.0 * negative) / 16.0) * (1.0 - 2.0 * negative);
  return vec2(bytes.x / 128.0, scale);
}
vec2 riverPsiMapping() {
  return riverPsiMappingAt(texture(uRiverPsi, riverUV()));
}

// The mapped psi at a uv (0.5 where the hex has no flow): taps for gradients must be mapped, not raw, or the gradient across a seam
// between cells of different range jumps by the ratio of their scales (it made the lines fat and blocky near such seams).
float riverMappedAt(vec2 uv, float fallback) {
  vec4 f = texture(uRiverPsi, uv);
  if (f.a < 0.5) return fallback;
  vec2 m = riverPsiMappingAt(f);
  return m.x + m.y * (f.b / f.a);
}

// The lane coordinate: the mapped psi times the lane count.
float riverLaneCoord(float lanes) {
  return riverMappedAt(riverUV(), 0.5) * lanes;
}

// The gradient of the mapped psi on the ground, per world unit, by central differences over 2 * h world units.
vec2 riverMappedGradient(float h) {
  vec2 uv = riverUV();
  float p0 = riverMappedAt(uv, 0.5);
  float xm = riverMappedAt(uv - vec2(h * uRiverRect.z, 0.0), p0);
  float xp = riverMappedAt(uv + vec2(h * uRiverRect.z, 0.0), p0);
  float ym = riverMappedAt(uv - vec2(0.0, h * uRiverRect.w), p0);
  float yp = riverMappedAt(uv + vec2(0.0, h * uRiverRect.w), p0);
  // d/dY = squash * d/dy on the ground
  return vec2(xp - xm, (yp - ym) * uGroundSquash) / (2.0 * h);
}

// How many world units one lane is wide here: 1 / (|grad of the mapped psi| * lanes). Lanes far up a chain of confluences are
// narrow; the line width is kept in world px from this.
float riverLaneWidth(float lanes) {
  return 1.0 / max(length(riverMappedGradient(8.0)) * lanes, 1e-3);
}

// The direction of the flow, on the ground: perpendicular to the gradient of psi, which rises to the left of the flow
// (the cell's own psi: 0 on the right bank), so down = (-grad.y, grad.x), with the mapping's sign undone. Central differences over
// 16 world units; not normalised (the caller decides what a flat psi means).
vec2 riverDown() {
  vec2 grad = riverMappedGradient(8.0) * (riverPsiMapping().y < 0.0 ? -1.0 : 1.0);
  return vec2(-grad.y, grad.x);
}

// Style 1, toon strands: long thin light and dark strands along the flow (noise across the stream from centre, which is
// constant along it, times noise along the stream on the phase circle), curly white foam where centre is small (banks, islands,
// where channels meet) and a few sparkles.
vec4 riverStrands(vec2 cs, float centre, vec2 ground) {
  vec2 p = riverPhaseNow(cs);
  float k = uRiverScale;
  float turn = atan(p.y, p.x);
  // Lanes: B cut into thin strips (about 3 texels), nudged by noise so they are not exact contours. Most lanes are empty; a
  // present lane has its own width, tone and dash pattern.
  float laneCoord = riverLaneCoord(10.0) + (noise(ground * k * 2.5) - 0.5) * 0.8;
  float lane = floor(laneCoord);
  float h1 = hash(vec2(mod(lane, 289.0), 3.7));
  float h2 = hash(vec2(lane, 11.3));
  float h3 = hash(vec2(lane, 29.1));
  float present = step(0.4, h1);
  float halfWidth = min(0.8, (1.2 + 2.0 * h2) / riverLaneWidth(10.0));
  float across = abs(fract(laneCoord) - 0.5) * 2.0;
  float body = 1.0 - smoothstep(halfWidth, halfWidth + 0.18, across);
  // Dashes along the stream: the phase on its circle, offset per lane, so every lane has its own run of dashes (about a third of a
  // wavelength to most of one), and broken further by ground noise so they do not repeat each wavelength.
  float dash = smoothstep(-0.7 + 0.6 * h3, -0.5 + 0.6 * h3, cos(turn + h1 * 40.0));
  float broken = smoothstep(0.25, 0.45, noise(ground * k * 1.3 + lane * 7.0 + p * 0.8));
  float strand = body * dash * broken * present;
  float light = step(0.45, hash(vec2(lane, 51.7)));
  vec4 lightC = vec4(vec3(0.62, 0.86, 1.0) * 0.6, 0.6);
  vec4 darkC = vec4(vec3(0.02, 0.07, 0.3) * 0.7, 0.7);
  vec4 col = (light > 0.5 ? lightC : darkC) * strand * smoothstep(0.03, 0.12, centre);
  // Curly white foam in a thin band at the banks and round islands, broken into short squiggles.
  float nearBank = 1.0 - smoothstep(0.03, 0.11, centre);
  float f = fbm(ground * k * 9.0 + p * 0.3);
  float squiggle = (1.0 - smoothstep(0.0, 0.05, abs(f - 0.55))) * smoothstep(0.35, 0.55, noise(ground * k * 3.0 + 4.0));
  float curl = squiggle * nearBank;
  col = riverOver(col, vec4(vec3(0.9), 0.9) * curl);
  // Sparkles: a few small dots that twinkle.
  vec2 sp = ground * k * 30.0;
  // Wrapped before hashing: hash() of cell indices in the thousands loses its precision and the dots line up on a grid.
  vec2 cell = mod(floor(sp), 289.0);
  float h = hash(cell);
  vec2 jitter = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.5 + 0.25;
  float dotMask = (1.0 - smoothstep(0.08, 0.2, length(fract(sp) - jitter))) * step(0.975, h) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 60.0));
  col = riverOver(col, vec4(vec3(1.0), 1.0) * dotMask * 0.9);
  return col * (uRiverAlpha / 0.5);
}

// Value noise with the quintic fade (the cubic one of noise() leaves visible creases along the lattice lines), and an fbm of it that
// rotates the domain between octaves so no octave's lattice lines up with another's. Low frequencies thresholded sharply make
// the contours of the cartoon patches; with the plain noise they ran straight along the lattice axes.
float noiseQuintic(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(mod(i, 289.0));
  float b = hash(mod(i + vec2(1.0, 0.0), 289.0));
  float c = hash(mod(i + vec2(0.0, 1.0), 289.0));
  float d = hash(mod(i + vec2(1.0, 1.0), 289.0));
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbmRotated(vec2 p) {
  const mat2 R = mat2(0.8, 0.6, -0.6, 0.8);
  float sum = noiseQuintic(p) * 0.55;
  p = R * p * 2.03 + 17.0;
  sum += noiseQuintic(p) * 0.3;
  p = R * p * 2.01 + 31.0;
  sum += noiseQuintic(p) * 0.15;
  return sum;
}

// Lobed blobs of a hashed cell grid carried downstream (see riverDrift): one per cell with a probability, centre jittered, stretched
// along the flow, with a wavy edge from noise sampled in the carried grid coordinates, so the wobble travels with the blob.
float riverLobes(vec2 grid, vec2 down, float cycles, float shift) {
  vec2 side = vec2(-down.y, down.x);
  float total = 0.0;
  for (int i = 0; i < 2; i++) {
    float c = fract(cycles + (i == 0 ? 0.0 : 0.5));
    float w = 1.0 - abs(1.0 - 2.0 * c);
    vec2 g = grid - down * c * shift + (i == 0 ? 0.0 : 31.0);
    vec2 cell = mod(floor(g), 289.0);
    float h = hash(cell);
    // Centre in the middle fifth of the cell and a reach (radius * stretch * the edge wobble) under 0.4 cells: a lobe that reached
    // its cell's border was cut there, a straight edge across the channel.
    vec2 o = fract(g) - (vec2(hash(cell + 1.7), hash(cell + 9.3)) * 0.2 + 0.4);
    float radius = 0.12 + 0.06 * hash(cell + 4.1);
    float d = length(vec2(dot(o, down) / 1.3, dot(o, side))) / radius;
    float wavy = (noiseQuintic(g * 4.0 + cell) - 0.5) * 0.7;
    total += smoothstep(1.0, 0.7, d + wavy) * step(0.35, h) * w;
  }
  return min(total, 1.0);
}

// Style 2, cartoon bands: a lighter shallow band along each bank with a wobbly inner edge, large see-through lobed patches
// drifting downstream, and small white glints stretched along the flow.
vec4 riverBands(vec2 cs, float centre, vec2 ground) {
  vec2 p = riverPhaseNow(cs);
  float k = uRiverScale;
  // Bank band: its edge wobbles with noise and slowly with the phase.
  float wobble = noise(ground * k * 3.0 + p * 0.5) - 0.5;
  float edge = 0.3 + wobble * 0.08;
  float band = 1.0 - smoothstep(edge - 0.05, edge + 0.05, centre);
  vec4 col = vec4(vec3(0.42, 0.72, 0.9) * 0.6, 0.6) * band;
  // Patches: soft lobed blobs, each a drifting object (a hashed cell with a jittered centre, stretched along the flow, its edge
  // wobbled by noise that travels with it), faded in and out like the specks. A continuous noise field cross-faded between two
  // layers shows no net motion (the centroid of the blend stays put), and an fbm with a hard threshold did not translate in
  // measurements; discrete blobs do.
  vec2 down = riverDown();
  down /= length(down) + 0.0005;
  float patch = riverLobes(ground * k * ${glsl(RIVER_DRIFT.patch.grid)}, down, uTime * ${glsl(RIVER_DRIFT.patch.rate)}, ${glsl(RIVER_DRIFT.patch.shift)}) * smoothstep(0.0, 0.08, centre);
  col = riverOver(col, vec4(vec3(0.75, 0.94, 1.0) * 0.22, 0.22) * patch);
  // Glints: ellipses along the flow (the phase gradient points across it), shown while the wave passes their cell.
  vec2 g = ground * k * 14.0;
  // Wrapped before hashing, as for the sparkles: large cell indices put the glints on a regular grid.
  vec2 cell = mod(floor(g), 289.0);
  float h = hash(cell);
  vec2 o = fract(g) - (vec2(hash(cell + 1.7), hash(cell + 9.3)) * 0.4 + 0.3);
  vec2 phaseGrad = riverPhaseGradient(cs);
  vec2 across = phaseGrad / max(length(phaseGrad), 1e-6);
  vec2 along = vec2(-across.y, across.x);
  float e = pow(dot(o, along) / 0.34, 2.0) + pow(dot(o, across) / 0.07, 2.0);
  float shown = smoothstep(0.55, 0.9, cos(atan(p.y, p.x) + h * 6.2831853)) * step(0.93, h);
  col = riverOver(col, vec4(vec3(1.0), 1.0) * (1.0 - smoothstep(0.7, 1.0, e)) * shown * 0.85);
  return col * smoothstep(0.0, 0.04, centre) * (uRiverAlpha / 0.5);
}

// Ovals of a hashed cell grid carried downstream: two grids half a cycle apart, each shifted along down by shift cells per cycle
// and faded in and out by a triangle that is zero when it jumps back, so nothing pops. along and across are the oval's half axes
// in cells, threshold the hash a cell must reach to hold one, cycles is time in cycles.
float riverDrift(vec2 grid, vec2 down, float cycles, float shift, float along, float across, float threshold) {
  vec2 side = vec2(-down.y, down.x);
  float total = 0.0;
  for (int i = 0; i < 2; i++) {
    float c = fract(cycles + (i == 0 ? 0.0 : 0.5));
    float w = 1.0 - abs(1.0 - 2.0 * c);
    vec2 g = grid - down * c * shift + (i == 0 ? 0.0 : 31.0);
    vec2 cell = mod(floor(g), 289.0);
    float h = hash(cell);
    vec2 o = fract(g) - (vec2(hash(cell + 1.7), hash(cell + 9.3)) * 0.4 + 0.3);
    float e = pow(dot(o, down) / along, 2.0) + pow(dot(o, side) / across, 2.0);
    total += (1.0 - smoothstep(0.6, 1.0, e)) * step(threshold, h) * w;
  }
  return min(total, 1.0);
}

// Style 3, flow streaks: many long thin white streaks along the flow on the bare painted water, and a few small white ovals drifting
// downstream; denser near the banks and round islands. A streak is a lane of B (about a texel wide, so 1 to 2 px at zoom 1) with
// its own width, brighter where the ripple phase says so.
vec4 riverStreaks(vec2 cs, float centre, vec2 ground) {
  float k = uRiverScale;
  float nearBank = 1.0 - smoothstep(0.0, 0.35, centre);
  float laneCoord = riverLaneCoord(36.0) + (noise(ground * k * 2.5) - 0.5) * 0.8;
  float lane = floor(laneCoord);
  float h1 = hash(vec2(mod(lane, 289.0), 3.7));
  float h2 = hash(vec2(mod(lane, 289.0), 11.3));
  float present = step(mix(0.52, 0.25, nearBank), h1);
  // A line is about 1 to 2 world px wide whatever the lane: a cell with a small share of psi (an upstream arm) has wide lanes.
  float laneWidth = riverLaneWidth(36.0);
  float halfWidth = min(0.55, (0.9 + 0.8 * h2) / laneWidth);
  float across = abs(fract(laneCoord) - 0.5) * 2.0;
  // The edge is about a world px wide whatever the lane: a fixed fraction of a narrow lane is under a pixel and steps with the grid.
  float soft = clamp(1.0 / laneWidth, 0.15, 0.45);
  float body = 1.0 - smoothstep(halfWidth, halfWidth + soft, across);
  // The lines are streamlines and stay put; the bright part of each travels along it with the ripple crests: brightness follows
  // cos(theta' + a lane offset), theta' = theta + uRiverSpeed * t, so it moves at the crests' speed in their direction.
  vec2 pn = riverPhaseNow(cs);
  float offset = h2 * 6.2831853;
  float bright = smoothstep(0.0, 0.7, pn.x * cos(offset) - pn.y * sin(offset));
  float alpha = mix(0.85, 0.6, h2) * (0.25 + 0.75 * bright);
  float streak = body * present * smoothstep(0.02, 0.1, centre);
  vec4 col = vec4(vec3(1.0), 1.0) * alpha * streak;
  // Specks: small ovals along the flow, a few more near the banks.
  vec2 down = riverDown();
  down /= length(down) + 0.0005;
  float specks = riverDrift(ground * k * ${glsl(RIVER_DRIFT.speck.grid)}, down, uTime * ${glsl(RIVER_DRIFT.speck.rate)}, ${glsl(RIVER_DRIFT.speck.shift)}, 0.34, 0.13, 0.93 - 0.04 * nearBank);
  col = riverOver(col, vec4(vec3(1.0), 1.0) * specks * 0.85 * smoothstep(0.02, 0.1, centre));
  return col * (uRiverAlpha / 0.5);
}

// The river overlay of the chosen look (uRiverStyle, §4.4e "Styles"): 0 ripple arcs, 1 toon strands, 2 cartoon bands, 3 flow streaks, 4 bands with the streaks over them.
vec4 riverOverlay(vec2 cs, float centre, vec2 ground) {
  if (uRiverStyle > 3.5) return riverOver(riverBands(cs, centre, ground), riverStreaks(cs, centre, ground) * uRiverStreakMix);
  if (uRiverStyle > 2.5) return riverStreaks(cs, centre, ground);
  if (uRiverStyle > 1.5) return riverBands(cs, centre, ground);
  if (uRiverStyle > 0.5) return riverStrands(cs, centre, ground);
  return riverRipples(cs, centre, ground);
}

// Debug: hue = the static ripple phase (a whole turn per ripple), brightness = intensity (with a floor so the bank stays visible).
vec3 riverFlowDebugColor(vec2 cs, float intensity) {
  float angle = atan(cs.y, cs.x);
  vec3 hue = clamp(abs(mod(angle / 6.2831853 * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return hue * (0.2 + 0.8 * intensity);
}

void main() {
  // Painted river water is land as far as the mask knows (the water shader draws nothing there but the beach foam), so it is drawn
  // only where the mask says land. The flow texture is clipped to the river hex's own top face, which tessellates exactly with its
  // neighbours', so nothing else needs masking.
  vec2 maskUV = (vWorld - uMaskRect.xy) * uMaskRect.zw;
  // The water mesh covers the mask's rect and nothing outside it.
  if (maskUV.x < 0.0 || maskUV.x > 1.0 || maskUV.y < 0.0 || maskUV.y > 1.0) discard;
  float dist = (texture(uWaterMask, maskUV).r - 0.5) * uNearSpan * 2.0;
  if (dist > 0.0) discard;

  vec4 flow = sampleRiverFlow();
  if (flow.a <= 0.5) discard;
  vec2 ripple = riverPhase(flow);
  if (uShowRiverFlow > 0.5) {
    finalColor = vec4(riverFlowDebugColor(ripple, flow.b), 1.0);
    return;
  }
  if (flow.b <= 0.01) discard;

  // Ground space: world space with y un-foreshortened, as in the water shader.
  vec2 vGround = vec2(vWorld.x, vWorld.y / uGroundSquash);
  vec4 river = riverOverlay(ripple, flow.b, vGround);
  if (river.a < 0.004) discard;
  finalColor = river;
}
`;
