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

uniform float uTime;
uniform float uWaveTime;
uniform float uSeaBody;
uniform float uMidWaterWaves;
uniform float uShowMask;
uniform vec3 uShallowColor;
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
uniform float uCausticFine;
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
uniform float uFarReach;
uniform float uPropMute;
uniform float uPropFoamScale;

// Same cheap 2D value noise fogShader.ts uses — hash plus smooth
// interpolation, no dependency, and deliberately the same function so the two
// shaders' fields have the same character rather than two different kinds of
// procedural grain on screen at once.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}


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
float cellHash(vec2 cell, float salt) {
  return hash(cell * 1.13 + salt * 17.31 + 3.7);
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
  float scale, float bandCount, float width, float rate, float seed
) {
  vec2 p = ground * scale + seed;
  vec2 drift = vec2(t * 0.021, t * -0.014) * rate;

  // Two counter-drifting samples of the same field: the loops reshape as they
  // move instead of sliding across the water as a rigid pattern. Taken with
  // their derivatives, because the ribbon width below needs the field's
  // gradient and getting it this way is free — see \`noised\`.
  vec3 coarse = fbmd(p + drift);
  vec3 fine = noised(p * 2.1 + vec2(t * -0.017, t * 0.011));
  float n = coarse.x + 0.35 * fine.x;
  // Chain rule on the fine octave's own 2.1 scaling. The forward-difference
  // version this replaces only ever measured the coarse term's slope and
  // pretended the fine one was flat, which made the ribbons run visibly thin
  // wherever the two disagreed.
  vec2 dn = coarse.yz + 0.35 * 2.1 * fine.yz;

  // fract() turns one field into a whole family of nested contours for the
  // price of one; the time term walks the level set slowly through the field,
  // which is what makes the ribbons breathe rather than merely translate.
  float bands = n * bandCount + t * 0.05 * rate;
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
// seed. A: the prop-tile mute, 1 over a coastal tile carrying a boat or a rock
// and ramping to 0 just outside it.
//
// Nothing here branches on a *step* in the mask. Every channel is a continuous
// ramp, and that is deliberate: sampled with linear filtering, a 0/255 step's
// crossing is decided by the texel raster rather than by the hexagon the art
// draws — which is what made the foam's inner edge wobble around the tile edge
// instead of sitting on it, back when the shader picked a side off a coverage
// bit. Both R and A are continuous across their boundaries, so filtering places
// them within a fraction of a texel of the real edge.
vec4 sampleMask() {
  return texture(uWaterMask, vUV);
}

// The raw-channel debug view (§5's showWaterMask). Hard-stepped contour bands
// on R, so the coastline the mask believes in reads as a crisp line you can
// lay over the painted art and see any disagreement immediately. This is what
// the throwaway spike existed for, kept as a permanent option.
vec4 maskDebugColor(vec4 m) {
  float contour = step(0.5, fract(m.r * 8.0));
  vec3 col = vec3(m.r * contour, m.g, m.a);
  return vec4(col, 0.85);
}

void main() {
  vec4 m = sampleMask();

  // Ground space: world space with y un-foreshortened, so a pattern built here
  // reads as lying on the isometric ground plane rather than painted on the
  // glass in front of it. Everything with a shape of its own — the caustic
  // ribbons, the foam's ragged edge, the sea mottle — is evaluated here rather
  // than in vWorld. (The wave arcs of §4.2 are the deliberate exception: they
  // are the prototype's stroked marks *on* the sea, and it draws them in screen
  // space.)
  vec2 vGround = vec2(vWorld.x, vWorld.y / uGroundSquash);

  if (uShowMask > 0.5) {
    vec4 dbg = maskDebugColor(m);
    finalColor = vec4(dbg.rgb * dbg.a, dbg.a);
    return;
  }

  // Signed distance from the coastline, in tile widths: positive out into the
  // water, negative into the land. Everything below is a function of this one
  // number, which is the whole reason the mask exists.
  float dist = (m.r - 0.5) * uNearSpan * 2.0;
  bool water = dist > 0.0;

  // On land, only the foam's short reach onto the beach has anything to draw.
  if (!water && (uShorelineFoam < 0.5 || -dist > uFoamWidth * uFoamLandReach)) discard;

  // --- §4.4 prop-tile mute -------------------------------------------------
  // Two of the three coastal water variants paint a solid object sitting in the
  // water: a beached boat, a rock. A drifting surface pattern running across one
  // reads as painted onto the object rather than flowing around it, so over
  // those tiles the shader quietens down: the surface pattern goes entirely and
  // the foam narrows to uPropFoamScale of its width.
  //
  // Narrowed rather than removed, because removing it was worse than the artifact.
  // Foam is the coastline's outline as much as it is water, and taking it off one
  // hex leaves a bare stretch of shore that the eye finds immediately — much
  // faster than it finds a ribbon crossing a rock. A thin line still closes the
  // outline while leaving the prop its own patch of still water.
  //
  // A is baked as a ramp (1 on the tile, 0 just past it) rather than a per-hex
  // flag, so the handover is a soft edge rather than a hexagon stamped into the
  // coast.
  float mute = m.a * uPropMute;

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
      float quiet = 1.0 - mute;

      // Three layers, dark to light, in that order: the shadows are depth *in*
      // the water, so both light nets draw over them, and the fine net is the
      // highlight on top of the coarse one.
      if (uCausticBlobs > 0.5) {
        float shade = blobField(vGround, uWaveTime, offshore) * uCausticBlobAlpha * quiet;
        if (shade > 0.004) {
          acc = vec4(uCausticBlobColor * shade, shade) + acc * (1.0 - shade);
        }
      }

      float ribbon = causticNet(
        vGround, uWaveTime, offshore,
        uCausticScale, uCausticBands, uCausticWidth, 1.0, 0.0
      ) * uCausticAlpha * quiet;
      if (ribbon > 0.004) {
        acc = vec4(uCausticColor * ribbon, ribbon) + acc * (1.0 - ribbon);
      }

      if (uCausticFine > 0.5) {
        // Faster clock as well as a smaller field: a fine net drifting at the
        // coarse one's rate reads as one pattern that happens to have two
        // frequencies in it rather than as a second layer of water.
        float fine = causticNet(
          vGround, uWaveTime, offshore,
          uCausticFineScale, uCausticFineBands, uCausticFineWidth, 1.7, 11.0
        ) * uCausticFineAlpha * quiet;
        if (fine > 0.004) {
          acc = vec4(uCausticFineColor * fine, fine) + acc * (1.0 - fine);
        }
      }
    } else {
      float clearOfCoast = smoothstep(uWaveCoastFade.x, uWaveCoastFade.y, m.g);
      if (clearOfCoast > 0.004) {
        float crest = waveField(vWorld, uWaveTime) * clearOfCoast * uWaveAlpha * (1.0 - mute);
        acc = vec4(uWaveColor * crest, crest) + acc * (1.0 - crest);
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
  // is deliberately loose (it ignores the prop-tile narrowing, which can only
  // make the real band smaller) so it can never clip the band it is skipping.
  float foamReach = uFoamWidth * (1.0 + uFoamSurge) + uFoamNoise;
  if (uShorelineFoam > 0.5 && dist < foamReach) {
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
    // ...and narrows to uPropFoamScale of itself over a prop tile, so the
    // coastline keeps an unbroken outline while the boat or rock keeps its own
    // patch of still water. One factor, applied to the ragged edge below as
    // well: it is the whole band that shrinks, not only its centre line.
    float shrink = mix(1.0, uPropFoamScale, mute);
    float width = uFoamWidth * (1.0 + uFoamSurge * sin(surgePhase)) * shrink;

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
    // it takes the same \`shrink\` the width does. Left absolute it swamped the
    // narrowed band over a prop tile: measured, 0.08 tiles of wander on a
    // 0.15-tile band, which undid most of the narrowing and put the foam back on
    // the rock on every positive excursion.
    float edge = (fbm(np + uFoamWind * uTime) - 0.5) * 2.0
               + (noise(np * 4.0 + uFoamWind * uTime * 2.2) - 0.5);
    float reach = max(width + uFoamNoise * shrink * edge, width * uFoamInner + 0.001);

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

    float foam = max(inner * uFoamAlpha.x, outer * uFoamAlpha.y);
    acc = vec4(uFoamColor * foam, foam) + acc * (1.0 - foam);
  }

  if (acc.a < 0.004) discard;
  finalColor = acc;
}
`;
