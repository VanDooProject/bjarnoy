// The water shader — docs/design/water-shader.md §4. One GlProgram, both
// effects inside one fragment shader, each behind a uniform.
//
// Written in the same portable convention fogShader.ts documents at length and
// for the same reasons: no `#version 300 es` pragma, `in`/`out`/`texture()`,
// and an output named exactly `finalColor`. That name is not a style choice —
// it is what Pixi's own macro layer expects (`#define finalColor
// gl_FragColor`); any other name leaves a stray `out` declaration behind that
// fails to compile on a WebGL1 context.
//
// --- Why this one is a world-space mesh and fog's is a clip-space quad -----
//
// FogMaskLayer's geometry is four clip-space corners on an `app.stage` child,
// and its fragment shader reconstructs a world position per pixel from
// uCameraPos/uZoom/uViewport. That is right for fog, which genuinely belongs
// on top of everything.
//
// Water does not. It has to be inserted *between* existing `world` children —
// under the island polygons on the world map, between ground art and tall art
// in the settlement view (§3). A clip-space stage child cannot go there
// without splitting `world` into two camera-synced containers, which means two
// places to keep the camera transform in sync and a new class of "which half
// is this layer in" bug. So the mesh is an ordinary `world` child with
// world-space vertices, and it buys three things: it can be inserted at any
// depth with no split; the vertex shader hands the fragment shader a world
// position as a plain varying, so none of fog's inverse-projection math is
// needed at all; and Pixi camera-transforms it like everything else, so it
// pans and zooms in lockstep with the coastline it is drawing foam on.

import { NOISE_LATTICE_GLSL } from "../shaderNoise";

/**
 * Vertex shader for a world-space quad inside the camera-transformed `world`
 * container.
 *
 * `uProjectionMatrix`/`uWorldTransformMatrix`/`uTransformMatrix` are not ours
 * to set: Pixi's mesh pipe binds them automatically as part of `globalUniforms`
 * (group 100) and `localUniforms` (group 101) for any custom GlProgram on a
 * Mesh — see node_modules/pixi.js/lib/scene/mesh/gl/GlMeshAdaptor.mjs and
 * lib/rendering/high-shader/shader-bits/localUniformBit.mjs. Declaring them is
 * all it takes to inherit the camera.
 */
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

export const WATER_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vUV = aUV;
  vWorld = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

export const WATER_FRAGMENT = `
precision highp float;

in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uWaterMask;
uniform sampler2D uWaterTaint;
uniform sampler2D uWaterNoFoam;
uniform sampler2D uWaterDry;
uniform sampler2D uRiverFlow;
uniform sampler2D uRiverPsi;

uniform float uTime;
uniform float uWaveTime;
uniform float uSeaBody;
uniform float uMidWaterWaves;
uniform float uShowMask;
uniform vec3 uShallowColor;
uniform float uTaintWash;
uniform vec3 uDeepColor;
uniform float uSeaMottle;
uniform float uMottleScale;
uniform vec3 uWaveColor;
uniform float uWaveAlpha;
uniform vec2 uWaveCoastFade;
uniform float uWaveScale;
uniform float uShorelineFoam;
uniform vec3 uFoamColor;
uniform float uFoamWidth;
uniform float uFoamInner;
uniform float uFoamLandReach;
uniform vec2 uFoamAlpha;
uniform float uFoamNoise;
uniform float uFoamNoiseScale;
uniform float uFoamSurge;
uniform float uSurgeRate;
uniform vec2 uFoamWind;
uniform float uNearSpan;
uniform float uGroundSquash;
uniform float uCaustics;
uniform float uCausticScale;
uniform float uCausticBands;
uniform float uCausticWidth;
uniform float uCausticAlpha;
uniform vec3 uCausticColor;
uniform float uCausticCull;
uniform float uCausticCullSoften;
uniform float uCausticCullSpread;
uniform float uCausticCoarse;
uniform float uCausticFine;
uniform float uCausticFinePhase;
uniform float uCausticFineScale;
uniform float uCausticFineBands;
uniform float uCausticFineWidth;
uniform float uCausticFineAlpha;
uniform vec3 uCausticFineColor;
uniform float uCausticBlobs;
uniform float uCausticBlobScale;
uniform float uCausticBlobLevel;
uniform float uCausticBlobSoft;
uniform float uCausticBlobAlpha;
uniform vec3 uCausticBlobColor;
uniform float uRiverFlowOn;
uniform float uShowRiverFlow;
uniform float uRiverStyle;
uniform vec4 uRiverRect;
uniform float uRiverSpeed;
uniform float uRiverArc;
uniform float uRiverStreakMix;
uniform float uRiverAlpha;
uniform vec3 uRiverColor;
uniform float uRiverScale;
uniform float uFarReach;
uniform vec3 uTaintShallowColor;
uniform vec3 uTaintDeepColor;
uniform vec3 uTaintFoamColor;

// The same value noise fogShader.ts uses (shaderNoise.ts), so the two shaders'
// fields have the same character. Its lattice is a texture lookup, so \`hash\`
// only takes whole numbers.
${NOISE_LATTICE_GLSL}
// Two octaves, normalised back to roughly 0..1. Two and not fog's three: this
// is evaluated per-pixel along every coastline, and the third octave would
// carry an eighth of the amplitude at a scale finer than the foam band is
// wide. An octave that cannot be seen is not free detail.
float fbm(vec2 p) {
  float sum = noise(p) * 0.5 + noise(p * 2.03) * 0.25;
  return sum / 0.75;
}

// The same value noise, returning its **analytic derivative** alongside its
// value: vec3(value, d/dx, d/dy).
//
// Value noise is a bilinear blend of four corner hashes under a smoothstep
// weight, and a bilinear blend is a closed-form polynomial — so its gradient
// falls out of the same four hashes that produced the value, for a handful of
// multiplies and no extra memory traffic at all. \`noised(p).x\` is bit-for-bit
// \`noise(p)\`: expand \`mix(a,b,ux) + (c-a)uy(1-ux) + (d-b)ux·uy\` and it is the
// standard \`a + (b-a)ux + (c-a)uy + (a-b-c+d)ux·uy\`, which is what is
// differentiated here.
//
// This exists because the caustic ribbons need the field's gradient to hold
// their thickness (§4.2b), and the first version got it from two extra forward
// differences — three fbm evaluations where one would do. That is 24 hashes per
// net where 8 suffice, on every water pixel of a settlement view, twice over
// now that §4.2c draws a second net. The exact derivative is also strictly
// better than a difference quotient at e = 0.06.
vec3 noised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;
  return vec3(
    a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
    du.x * (k1 + k3 * u.y),
    du.y * (k2 + k3 * u.x)
  );
}

// fbm's value and gradient together, same two octaves and same normalisation.
// The second octave's gradient carries the chain rule's 2.03, which is why it
// contributes more to the slope than its 0.25 amplitude suggests — and why
// dropping it to save four hashes would misjudge ribbon thickness by half.
vec3 fbmd(vec2 p) {
  vec3 n0 = noised(p);
  vec3 n1 = noised(p * 2.03);
  return vec3(
    (n0.x * 0.5 + n1.x * 0.25) / 0.75,
    (n0.yz * 0.5 + n1.yz * 0.25 * 2.03) / 0.75
  );
}

// --- §4.2 mid-water waves -------------------------------------------------
//
// A per-pixel port of the Graphics squiggles this replaces, not a new look:
// zip 7's prototype (prototypes/worldmap/Viking Realm.dc.html, sea()) is the
// art direction of record and docs/design/img/worldmap.png is what the result
// gets compared against. So the numbers below are the prototype's own, in its
// own 40px hex, scaled by uWaveScale exactly the way HexMapRenderer's
// WAVE_STEP_X/WAVE_WIDTH/... constants are — they are meant to be read
// side by side with those.
const float PROTO_HEX_W = 40.0;
const float PROTO_STEP_X = 46.0;
const float PROTO_STEP_Y = 26.0;
const float PROTO_WIDTH = 26.0;
const float PROTO_STROKE = 2.0;
const float PROTO_JITTER_X = 16.0;
const float PROTO_JITTER_Y = 12.0;
const float PROTO_BUMP = 4.5;
const float PROTO_SWELL_X = 7.0;
const float PROTO_SWELL_Y = -3.0;
const float WAVE_DENSITY = 0.62;

// What the shader cannot reproduce is HexMapRenderer's \`hash01\`, which is
// 32-bit integer arithmetic (Math.imul, >>>) and has no equivalent in the
// GL1-compatible GLSL Pixi may compile this down to. So the *field* here has
// the same grid, density, jitter range and period range as the Graphics one,
// but individual crests land in different places. That is the intended
// relationship: \`legacyWaveSquiggles\` exists to A/B the look against the
// reference screenshot, not to overlay two copies of the same wave.
// \`cell\` is a whole number (floor()'d), the salt offsets it by whole numbers
// too, so the lattice lookup in \`hash\` stays exact.
float cellHash(vec2 cell, float salt) {
  return hash(cell + vec2(salt * 17.0, salt * 31.0));
}

/**
 * Distance from \`p\` to one wave arc that starts at \`a\` and is \`w\` wide.
 *
 * The prototype strokes two quadratic Beziers — a -> (a + (w/4, -bump)) ->
 * (a + (w/2, 0)), then -> (a + (3w/4, +bump)) -> (a + (w, 0)). Each one's
 * control point sits at the horizontal midpoint of its span, which makes x
 * exactly linear in the Bezier parameter; so the arc is a plain graph y(x)
 * built of two parabolas, and its distance needs no curve-fitting iteration
 * at all. Its peak displacement is bump/2, not bump — worth stating because
 * the plan's prose called it "amplitude bump".
 */
float waveArcDistance(vec2 p, vec2 a, float w, float bump) {
  float v = (p.x - a.x) / w;

  // Past either end, the nearest point is the endpoint itself — which is what
  // gives the stroke the prototype's round cap.
  if (v < 0.0 || v > 1.0) {
    vec2 end = a + vec2(clamp(v, 0.0, 1.0) * w, 0.0);
    return length(p - end);
  }

  float second = step(0.5, v);
  float u = v * 2.0 - second;          // 0..1 within whichever half
  float sign_ = second * 2.0 - 1.0;    // first half dips, second half rises
  float offset = sign_ * 2.0 * bump * u * (1.0 - u);
  float dOffset = sign_ * 4.0 * bump * (1.0 - 2.0 * u);

  // Vertical distance alone would make the stroke visibly fatten where the arc
  // is steep (the slope reaches ~0.7 at the ends); dividing by the gradient's
  // length converts it to the perpendicular distance and keeps the stroke one
  // width all the way along.
  float slope = dOffset / w;
  return abs(p.y - (a.y + offset)) * inversesqrt(1.0 + slope * slope);
}

// Coverage of the wave field at \`world\`, 0..1. The most expensive thing in
// this shader — 3x3 cells, each up to one arc — so every caller gates it on
// water coverage first and on being clear of the coast second.
float waveField(vec2 world, float t) {
  float stepX = PROTO_STEP_X * uWaveScale;
  float stepY = PROTO_STEP_Y * uWaveScale;
  float width = PROTO_WIDTH * uWaveScale;
  float stroke = PROTO_STROKE * uWaveScale;
  float bump = PROTO_BUMP * uWaveScale;

  vec2 base = floor(vec2(world.x / stepX, world.y / stepY));
  float covered = 0.0;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cell = base + vec2(float(dx), float(dy));
      if (cellHash(cell, 1.0) > WAVE_DENSITY) continue;

      vec2 anchor = vec2(cell.x * stepX, cell.y * stepY);
      anchor.x += (cellHash(cell, 2.0) - 0.5) * PROTO_JITTER_X * uWaveScale;
      anchor.y += (cellHash(cell, 3.0) - 0.5) * PROTO_JITTER_Y * uWaveScale;

      // The prototype's swell: each crest nudges up-and-right and back on its
      // own clock, in place — not a drifting or scrolling pattern.
      float phase = cellHash(cell, 4.0) * 6.2831853;
      float period = 3.4 + cellHash(cell, 5.0) * 3.2;
      float swell = (sin(t / period * 6.2831853 + phase) + 1.0) * 0.5;
      anchor += vec2(PROTO_SWELL_X, PROTO_SWELL_Y) * uWaveScale * swell;

      float d = waveArcDistance(world, anchor, width, bump);
      // Feather either side of the stroke so the crest has the anti-aliased
      // edge a stroked Graphics path gets for free. Kept narrow: a wide
      // feather eats into the opaque core and the crest reads visibly thinner
      // and fainter than the Graphics squiggle of the same nominal width,
      // which is the first thing the legacyWaveSquiggles A/B shows up.
      float alias = stroke * 0.2;
      float hit = 1.0 - smoothstep(stroke * 0.5 - alias, stroke * 0.5 + alias, d);
      // Alpha breathes with the swell as well as the position moving, so
      // crests read as swelling in place rather than only sliding. Bounded
      // well above zero — they should never blink out entirely — and biased
      // high, so the field's mean alpha stays close to the flat WAVE_ALPHA the
      // Graphics squiggles use rather than reading as a dimmer sea.
      covered = max(covered, hit * (0.7 + 0.3 * swell));
    }
  }
  return covered;
}

// --- §4.2b caustic ribbons ------------------------------------------------
//
// The close-up look — a connected, branching network of pale ribbons over the
// water, some loops nested inside others. That shape is exactly the set of
// *contour lines* of a slowly churning noise field, so that is literally what
// this draws: level sets of an fbm, banded with fract(). No attempt at real
// refraction, which would need a surface normal this shader has no business
// inventing.
//
// Deliberately a different idiom from the wave arcs above rather than a tuning
// of them. Scattered arcs read as an ocean seen from orbit and are what
// docs/design/img/worldmap.png shows; ribbons read as shallow water seen from a
// few metres up. Which one a view gets is uSurface, set from the view's mode.
// Parameterised rather than wired straight to one set of uniforms, because
// §4.2b draws this twice: a coarse net, and a smaller, brighter one over it.
// \`seed\` shifts the field's domain *and* the per-ribbon keep-off hash and
// \`rate\` its clock, so the second net is an unrelated field rather than a
// scaled copy of the first — two copies of one field at different sizes read as
// a moire, not as two layers of caustics.
float causticNet(
  vec2 ground, float t, float offshore,
  float scale, float bandCount, float width, float rate, float seed, float phase
) {
  vec2 p = ground * scale + seed;
  // Every time term below reads this, not \`t\`, so one net can be slid along its
  // own history relative to the other. The two are built to be independent
  // fields, but independent is not the same as *out of step*: both breathe as
  // their level set walks, and with the clocks aligned the busy and empty
  // moments line up, so the water goes from bare to crowded and back with both
  // nets doing it together. A phase offset is the one thing that cannot be
  // fixed by making the fields more different from each other.
  float ct = t + phase;
  vec2 drift = vec2(ct * 0.021, ct * -0.014) * rate;

  // Two counter-drifting samples of the same field: the loops reshape as they
  // move instead of sliding across the water as a rigid pattern. Taken with
  // their derivatives, because the ribbon width below needs the field's
  // gradient and getting it this way is free — see \`noised\`.
  vec3 coarse = fbmd(p + drift);
  // \`rate\` here too. It was missing, so this counter-drifting term moved at
  // exactly the same speed and heading in both nets — half of each field's
  // motion was common to the two, which is a good way to make two independent
  // fields look like one.
  vec3 fine = noised(p * 2.1 + vec2(ct * -0.017, ct * 0.011) * rate);
  float n = coarse.x + 0.35 * fine.x;
  // Chain rule on the fine octave's own 2.1 scaling. The forward-difference
  // version this replaces only ever measured the coarse term's slope and
  // pretended the fine one was flat, which made the ribbons run visibly thin
  // wherever the two disagreed.
  vec2 dn = coarse.yz + 0.35 * 2.1 * fine.yz;

  // fract() turns one field into a whole family of nested contours for the
  // price of one; the time term walks the level set slowly through the field,
  // which is what makes the ribbons breathe rather than merely translate.
  float bands = n * bandCount + ct * 0.05 * rate;
  float band = abs(fract(bands) - 0.5) * 2.0;

  // Each ribbon gets its own keep-off distance from the shore, and this is the
  // line that makes that possible: rounding the banding coordinate gives the
  // index of the *nearest contour*, which is the same integer everywhere along
  // that contour and in the neighbourhood either side of it. A fragment shader
  // has no connectivity — it cannot ask whether the loop through this pixel
  // touches land somewhere else on the map — but it can ask which loop this is,
  // and that is enough to decide something consistently for the whole of it.
  //
  // So instead of every ribbon stopping on one line a fixed distance offshore,
  // each one stops at its own distance, spread over uCausticCullSpread. Loops
  // that lie entirely inside their own keep-off never appear at all, which is
  // the "remove the ones that touch the shore" case; the rest end at distances
  // that have nothing to do with each other, so there is no line to see.
  float ribbon = floor(bands + 0.5);
  float keepOff = uCausticCull + hash(vec2(ribbon, 17.0 + seed)) * uCausticCullSpread;
  float clearOfCoast = smoothstep(keepOff, keepOff + uCausticCullSoften, offshore);
  if (clearOfCoast <= 0.0) return 0.0;

  // Divide by the field's own gradient so every ribbon comes out the same
  // thickness. Without this the "thickness" is measured in *field* units, so
  // wherever the field is flat — at every local maximum and minimum, which is
  // everywhere the noise has an extremum — a whole basin falls inside one band
  // and paints as a filled smudge or a stray dot. Those were most of the fizz;
  // the big readable loops were only ever the minority of what was drawn.
  //
  // Analytic, not fwidth(): dFdx/dFdy need GL_OES_standard_derivatives on a
  // WebGL1 context and nothing else in this codebase's shaders relies on it.
  // And not forward differences either, which is what this was — two extra fbm
  // evaluations, tripling the field's cost on every water pixel of a settlement
  // view, twice over once §4.2c added a second net.
  float grad = max(length(dn) * bandCount, 1e-3);

  // The band is in field units; dividing by the gradient converts it to a
  // distance in p-space, which uCausticWidth is then a plain width in.
  return (1.0 - smoothstep(width * 0.55, width, band / grad)) * clearOfCoast;
}

// --- §4.2c drifting shadows ------------------------------------------------
//
// The third caustic layer, and the only one that darkens: soft dark pools
// wandering under the surface. Reference art builds its water out of light
// cells *and* deeper pools between them, and two white nets over a flat ground
// only ever add — the water ends up brighter overall and no deeper.
//
// The pools are the low ground of one drifting fbm. That is a rewrite of the
// first version, which scattered discs on a 3x3 cell grid so that each blob
// could draw its own keep-off distance from the shore: nine cells of hashing
// plus a sine and a cosine each, about eight times this, on every water pixel
// of the view. And it had to be tuned until the discs were big enough to merge
// into pools — at which point a thresholded field is what it was approximating
// anyway.
//
// The per-pool keep-off survives the rewrite for free. \`n\` is what defines this
// pool, so using it as the jitter gives each one its own distance from land
// instead of a single cut line running along the whole coast — the same idea as
// the ribbons' contour index, off a value that is already in hand.
float blobField(vec2 ground, float t, float offshore) {
  vec2 p = ground * uCausticBlobScale;
  float n = fbm(p + vec2(t * 0.011, t * -0.008));

  float keepOff = uCausticCull + n * uCausticCullSpread;
  float clearOfCoast = smoothstep(keepOff, keepOff + uCausticCullSoften, offshore);
  if (clearOfCoast <= 0.0) return 0.0;

  // Below the level, not above it: the pools are where the field is low, so the
  // smoothstep runs downward and the deepest ground is the most opaque.
  return smoothstep(uCausticBlobLevel, uCausticBlobLevel - uCausticBlobSoft, n) * clearOfCoast;
}

// The mask's channels, named. R: the **signed** near distance, 0.5 exactly on
// the coastline, below it land and above it water. G: unsigned distance from
// land over the far range, which is all the wave coast-fade needs. B: per-hex
// seed. A: unused.
//
// Nothing here branches on a *step* in the mask. Every channel is a continuous
// ramp, and that is deliberate: sampled with linear filtering, a 0/255 step's
// crossing is decided by the texel raster rather than by the hexagon the art
// draws — which is what made the foam's inner edge wobble around the tile edge
// instead of sitting on it, back when the shader picked a side off a coverage
// bit. R is continuous across the coastline, so filtering places it within a
// fraction of a texel of the real edge.
vec4 sampleMask() {
  return texture(uWaterMask, vUV);
}

// The art dry mask (docs/design/water-shader.md §4.4b): 1 where the painted
// tile art under the water is not plain water (rock, boat, dock, hut, their
// reflections), 0 elsewhere, in the alpha channel. A render texture over the
// same world rect as the mask, so it takes the same UVs.
float sampleDry() {
  return texture(uWaterDry, vUV).a;
}

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

// The tainted-water field (docs/design/water-shader.md's "Tainted water"
// section): 1 in water close to a revealed wasted island, fading to 0 by
// TAINT_REACH_TILES, and 1 on the wasted land itself. Same UVs and filtering
// as the main mask, so its own zero crossing sits at a sub-texel position too
// — see WaterLayer.setMask's taint texture for why.
float sampleTaint() {
  return texture(uWaterTaint, vUV).r;
}

// The no-foam field (WaterMask.noFoam): 1 around a river mouth (out to
// NO_FOAM_INNER_TILES, fading by NO_FOAM_REACH_TILES), 0 elsewhere. Same UVs
// and filtering as the main mask. The shoreline foam is multiplied by one
// minus this, so the sea does not lap foam across the mouth's outflow.
float sampleNoFoam() {
  return texture(uWaterNoFoam, vUV).r;
}

// The raw-channel debug view (§5's showWaterMask). Hard-stepped contour bands
// on R, so the coastline the mask believes in reads as a crisp line you can
// lay over the painted art and see any disagreement immediately. This is what
// the throwaway spike existed for, kept as a permanent option.
vec4 maskDebugColor(vec4 m, float dry) {
  float contour = step(0.5, fract(m.r * 8.0));
  vec3 col = vec3(m.r * contour, m.g, dry);
  return vec4(col, 0.85);
}

void main() {
  vec4 m = sampleMask();
  float taint = sampleTaint();

  // Ground space: world space with y un-foreshortened, so a pattern built here
  // reads as lying on the isometric ground plane rather than painted on the
  // glass in front of it. Everything with a shape of its own — the caustic
  // ribbons, the foam's ragged edge, the sea mottle — is evaluated here rather
  // than in vWorld. (The wave arcs of §4.2 are the deliberate exception: they
  // are the prototype's stroked marks *on* the sea, and it draws them in screen
  // space.)
  vec2 vGround = vec2(vWorld.x, vWorld.y / uGroundSquash);

  if (uShowMask > 0.5) {
    vec4 dbg = maskDebugColor(m, sampleDry());
    finalColor = vec4(dbg.rgb * dbg.a, dbg.a);
    return;
  }

  // Signed distance from the coastline, in tile widths: positive out into the
  // water, negative into the land. Everything below is a function of this one
  // number, which is the whole reason the mask exists.
  float dist = (m.r - 0.5) * uNearSpan * 2.0;
  bool water = dist > 0.0;

  // --- §4.4e river flow ----------------------------------------------------
  // Painted river water is land as far as the mask knows, so it is drawn here, before the land discard. The flow texture is
  // clipped to the river hex's own top face, which tessellates exactly with its neighbours', so nothing else needs masking.
  vec4 flow = (uRiverFlowOn > 0.5 || uShowRiverFlow > 0.5) ? sampleRiverFlow() : vec4(0.0);
  vec2 ripple = riverPhase(flow);
  if (!water && flow.a > 0.5) {
    if (uShowRiverFlow > 0.5) {
      finalColor = vec4(riverFlowDebugColor(ripple, flow.b), 1.0);
      return;
    }
    if (flow.b > 0.01) {
      vec4 river = riverOverlay(ripple, flow.b, vGround);
      if (river.a >= 0.004) {
        finalColor = river;
        return;
      }
    }
  }

  // On land, only the foam's short reach onto the beach has anything to draw.
  if (!water && (uShorelineFoam < 0.5 || -dist > uFoamWidth * uFoamLandReach)) discard;

  // --- §4.4b art dry mask --------------------------------------------------
  // Pixels of the painted tile art that are not plain water (a rock, a boat, a
  // dock, a hut, their reflections). Caustics and foam are drawn only on water,
  // so both are multiplied by what is left of this.
  float dry = sampleDry();

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // --- §4.1 sea body ------------------------------------------------------
  // World mode only; in settlement mode the painted watertile_*/
  // coastalwatertile_* art *is* the sea body and this term is always off.
  //
  // The two stops are WorldMapCanvas.vue's own CSS gradient endpoints, so
  // flipping this flag off is a small change rather than a jarring one — and
  // their linear midpoint (#1a677f) lands within a couple of levels of that
  // gradient's own middle stop (#14657f), which is why a two-stop ramp
  // reproduces a three-stop gradient here.
  if (water && uSeaBody > 0.5) {
    float depth = smoothstep(0.0, 1.0, m.g);
    col = mix(uShallowColor, uDeepColor, depth);
    // Tainted water around a revealed wasted island mixes toward the same
    // shallow/deep pair the baked coastal-water art already uses, at the same
    // depth — so the shader's sea picks up exactly where that art's own
    // taint left off rather than blending in a third, unrelated colour.
    vec3 taintedCol = mix(uTaintShallowColor, uTaintDeepColor, depth);
    col = mix(col, taintedCol, taint);
    // One octave, not three. This is a very low-frequency mottle whose whole
    // job is that a large expanse of open water isn't a flat fill; the finer
    // octaves would cost the same each and be invisible under the waves and
    // foam drawn on top.
    float mottle = noise(vGround * uMottleScale) - 0.5;
    col += mottle * uSeaMottle;
    alpha = 1.0;
  }

  // Everything from here composites over what is already there, so carry it
  // premultiplied — one \`src + dst * (1 - srcA)\` per term.
  vec4 acc = vec4(col * alpha, alpha);

  // Tainted water in settlement mode. There the painted watertile_* art *is*
  // the sea body (the term above is off), so mixing the body colour alone
  // leaves plain blue tiles around a wasted island, and fading the caustics
  // out by taint below only bares that flat blue. Wash the taint colour over
  // the tile art instead, by the same field, so the sea darkens smoothly from
  // the tainted coast tiles out to open water.
  if (water && uSeaBody < 0.5 && taint > 0.0) {
    float depthT = smoothstep(0.0, 1.0, m.g);
    float wash = taint * uTaintWash;
    acc = vec4(mix(uTaintShallowColor, uTaintDeepColor, depthT) * wash, wash) + acc * (1.0 - wash);
  }


// --- §4.2 mid-water waves ----------------------------------------------
  // Suppressed near the coast by the mask's R channel: the continuous
  // successor to \`isNearLand\`, which is a hard per-hex boolean today and
  // leaves a visibly hexagonal hole in the wave field around every island.
  // The fade is deliberately wide — it is read out where the distance field is
  // coarsest, so a narrow one would show the mask's own texel stepping.
  if (water && uMidWaterWaves > 0.5) {
    if (uCaustics > 0.5) {
      // Close up, and kept off the shore. Running the ribbons right up to the
      // coastline puts two bright white patterns on top of each other in the one
      // place the eye is already reading an edge: the foam band stops looking
      // like the boundary of the water and starts looking like the brightest
      // part of a texture.
      //
      // How far off is decided per ribbon inside causticNet, not here — see
      // there. Off the far channel rather than the signed near one, since the
      // keep-off sits past where R saturates.
      float offshore = m.g * uFarReach;
      // Caustics read as sunlight through clear water, and tainted water
      // isn't clear — so the field is faded out by taint, multiplied with the
      // art dry mask rather than picking one.
      // Kept faintly rather than switched off: with the taint wash under them
      // a few dim ribbons stop tainted water reading as a flat fill.
      float quiet = (1.0 - dry) * (1.0 - 0.75 * taint);

      // Three layers, dark to light, in that order: the shadows are depth *in*
      // the water, so both light nets draw over them, and the fine net is the
      // highlight on top of the coarse one.
      if (uCausticBlobs > 0.5) {
        float shade = blobField(vGround, uWaveTime, offshore) * uCausticBlobAlpha * quiet;
        if (shade > 0.004) {
          acc = vec4(uCausticBlobColor * shade, shade) + acc * (1.0 - shade);
        }
      }

      if (uCausticCoarse > 0.5) {
        float ribbon = causticNet(
          vGround, uWaveTime, offshore,
          uCausticScale, uCausticBands, uCausticWidth, 1.0, 0.0, 0.0
        ) * uCausticAlpha * quiet;
        if (ribbon > 0.004) {
          acc = vec4(uCausticColor * ribbon, ribbon) + acc * (1.0 - ribbon);
        }
      }

      if (uCausticFine > 0.5) {
        // Faster clock as well as a smaller field: a fine net drifting at the
        // coarse one's rate reads as one pattern that happens to have two
        // frequencies in it rather than as a second layer of water.
        float fine = causticNet(
          vGround, uWaveTime, offshore,
          uCausticFineScale, uCausticFineBands, uCausticFineWidth, 1.7, 11.0, uCausticFinePhase
        ) * uCausticFineAlpha * quiet;
        if (fine > 0.004) {
          acc = vec4(uCausticFineColor * fine, fine) + acc * (1.0 - fine);
        }
      }
    } else {
      float clearOfCoast = smoothstep(uWaveCoastFade.x, uWaveCoastFade.y, m.g);
      if (clearOfCoast > 0.004) {
        // Tainted crests mix toward the same ash grey-green the foam does —
        // white water breaking over a dead sea reads wrong, and a second,
        // separate wave-taint colour would just be one more thing to keep in
        // step with the foam's.
        vec3 crestColor = mix(uWaveColor, uTaintFoamColor, taint);
        float crest = waveField(vWorld, uWaveTime) * clearOfCoast * uWaveAlpha * mix(1.0, 0.4, taint);
        acc = vec4(crestColor * crest, crest) + acc * (1.0 - crest);
      }
    }
  }

  // --- §4.3 shoreline foam -----------------------------------------------
  //
  // Foam is not an outline. A band at a fixed offset from the coast reads as a
  // sticker; the two things that make it read as water are a ragged edge and a
  // surge, and both are here.
  //
  // Everything is a function of one *shore proximity* — 1 exactly on the
  // coastline, falling to 0 at uFoamWidth out into the water and at
  // uFoamWidth * uFoamLandReach into the land. Building it this way rather than
  // thresholding the signed distance directly is what keeps the band centred on
  // the coastline: the first version tested a plain 'd less than something', which is a
  // half-plane, so everything on the land side sat at full strength while the
  // water side got a sliver the edge noise then erased. Measured on screen it
  // put 0 pixels of foam on the water and 8 on the beach.
  //
  // Gated on the band's own widest possible outer edge — full surge, full
  // positive noise excursion — because past that \`shore\` is 0 and every one of
  // the four noise fields below is dead work. It was ungated, so a third of a
  // tile's worth of foam was costing four fbm-scale evaluations on every water
  // pixel of the viewport, and open sea is most of a settlement view. The bound
  // is deliberately loose (full surge, full noise) so it can never clip the band it is skipping.
  float foamReach = uFoamWidth * (1.0 + uFoamSurge) + uFoamNoise;
  // River mouths carry no foam: skip the block (and its noise) where the
  // field has fully suppressed it, and scale the result by what is left of it
  // in the fade-out ring below.
  float noFoam = sampleNoFoam();
  if (uShorelineFoam > 0.5 && dist < foamReach && noFoam < 0.999) {
    // World-anchored, slowly drifting — the same reasoning as fog's cloud
    // field: anchored to the world rather than the screen, the pattern neither
    // stretches with world size nor slides out from under a camera pan.
    vec2 np = vGround * uFoamNoiseScale;

    // The band's width breathes, out of step along the coast so it laps rather
    // than pulsing as one ring. Two scales of de-synchronisation: one at about
    // seven hexes, which is the swell, and one at about one hex, which is the
    // individual lap.
    //
    // Deliberately *not* the mask's per-hex seed, which is what this used to
    // use. A per-hex value sampled with linear filtering is a step, and a step
    // in the surge phase is a step in the band's width: measured on screen the
    // foam ran at one width along a hex edge and 1.9x that (3.3x at the 90th
    // percentile) along the next, changing over the ~12px that one mask texel
    // interpolates across. That is why the band read as drawn rather than as
    // water — its only variation was per-hex and discontinuous.
    float surgePhase = uTime * uSurgeRate + (noise(np * 0.22) + noise(np * 1.6)) * 6.2831853;
    float width = uFoamWidth * (1.0 + uFoamSurge * sin(surgePhase));

    // Shore proximity: a *plateau* at 1 from the coastline out to
    // uFoamInner of the band, then a falloff to 0 at its edge. The plateau is
    // the point — a proximity that peaks at d = 0 and falls off both ways is a
    // knife edge only a sub-texel sliver of pixels ever sits on, and the edge
    // noise below then wobbles even that off the coastline. Measured on screen,
    // that version left 1-3px of foam on a 24px band.
    //
    // Asymmetric on purpose: foam belongs on the water, licking the beach
    // rather than covering it, so the land side gets uFoamLandReach of the
    // water side's reach and no plateau at all. In the settlement view that
    // land side is really drawn over the sand — the ground art is *below* the
    // mesh there, only the tall art in terrainTop is above it — so this is what
    // decides how far up the beach the foam runs.
    // The *outer* edge is displaced by noise; the inner one is not. Both tore
    // together in the first version — one displaced distance fed both ends — so
    // the band slid back and forth across the coastline instead of changing
    // shape, and displacing it enough to see was enough to lift its inner edge
    // off the tile edge. Held apart, the outer edge can be as ragged as it needs
    // to be while the inner one stays exactly on the coast, which is where the
    // whole signed-field design put it.
    //
    // Two octaves: the coarse one tears the boundary at the scale of a cove, the
    // fine one at the scale of the band's own width. uFoamNoise is in tile
    // widths — an absolute displacement rather than a fraction of the band — so
    // it is not scaled by the width.
    float edge = (fbm(np + uFoamWind * uTime) - 0.5) * 2.0
               + (noise(np * 4.0 + uFoamWind * uTime * 2.2) - 0.5);
    float reach = max(width + uFoamNoise * edge, width * uFoamInner + 0.001);

    float shore = dist >= 0.0
      ? 1.0 - smoothstep(width * uFoamInner, reach, dist)
      : 1.0 - smoothstep(0.0, width * uFoamLandReach, -dist);

    // Two tiers. The inner line is nearly opaque and hard against the shore —
    // it is what makes the coast read as wet. The outer lace is wider, fainter
    // and broken up by thresholded noise — it is what makes it read as foam.
    float inner = smoothstep(0.55, 0.95, shore);
    float lace = smoothstep(0.40, 0.72, fbm(np * 2.7 + uFoamWind * uTime * 1.6));
    // The lace starts at 0.12 of the proximity rather than 0.02. Near-white at
    // low alpha over navy is not faint foam, it is grey: measured, the tail of
    // the lace sat at (98,116,133) against water at (35,56,80) — nothing darker
    // than the water, but desaturated from 0.57 to 0.28, which reads as murk.
    // Cutting the tail and carrying the rest at a higher alpha keeps it blue-white.
    float outer = smoothstep(0.12, 0.55, shore) * lace;

    // Tainted foam mixes toward the same ash grey-green the crests do, and
    // dims a little further than they do — foam is brighter than open water
    // to begin with, so it needs more of a pull to stop reading as clean surf
    // against a dead coast.
    vec3 foamColor = mix(uFoamColor, uTaintFoamColor, taint);
    float foam = max(inner * uFoamAlpha.x, outer * uFoamAlpha.y) * mix(1.0, 0.55, taint) * (1.0 - noFoam) * (1.0 - dry);
    acc = vec4(foamColor * foam, foam) + acc * (1.0 - foam);
  }

  if (acc.a < 0.004) discard;
  finalColor = acc;
}
`;
