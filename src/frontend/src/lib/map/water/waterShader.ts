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
uniform float uCausticFadeStart;
uniform float uCausticFadeWidth;
uniform float uFarReach;
uniform float uPropMute;

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
float causticField(vec2 ground, float t) {
  vec2 p = ground * uCausticScale;
  vec2 drift = vec2(t * 0.021, t * -0.014);

  // Two counter-drifting samples of the same field: the loops reshape as they
  // move instead of sliding across the water as a rigid pattern.
  float base = fbm(p + drift);
  float n = base + 0.35 * noise(p * 2.1 + vec2(t * -0.017, t * 0.011));

  // fract() turns one field into a whole family of nested contours for the
  // price of one; the time term walks the level set slowly through the field,
  // which is what makes the ribbons breathe rather than merely translate.
  float bands = n * uCausticBands + t * 0.05;
  float band = abs(fract(bands) - 0.5) * 2.0;

  // Divide by the field's own gradient so every ribbon comes out the same
  // thickness. Without this the "thickness" is measured in *field* units, so
  // wherever the field is flat — at every local maximum and minimum, which is
  // everywhere the noise has an extremum — a whole basin falls inside one band
  // and paints as a filled smudge or a stray dot. Those were most of the fizz;
  // the big readable loops were only ever the minority of what was drawn.
  //
  // Forward differences rather than fwidth(): dFdx/dFdy need
  // GL_OES_standard_derivatives on a WebGL1 context, and nothing else in this
  // codebase's shaders relies on it.
  // Forward differences, two extra fbm evaluations rather than four: this runs
  // on every water pixel of a settlement view.
  float e = 0.06;
  float gx = fbm(p + vec2(e, 0.0) + drift) - base;
  float gy = fbm(p + vec2(0.0, e) + drift) - base;
  float grad = max(length(vec2(gx, gy)) / e * uCausticBands, 1e-3);

  // The band is in field units; dividing by the gradient converts it to a
  // distance in p-space, which uCausticWidth is then a plain width in.
  return 1.0 - smoothstep(uCausticWidth * 0.55, uCausticWidth, band / grad);
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
  // water: a beached boat, a rock. Animated foam and caustics drawn flat across
  // one read as painted onto the object rather than flowing around it, so the
  // shader steps back over those tiles entirely. A is baked as a ramp that is 1
  // on the tile and fades out just past it, so the handover is a soft edge
  // rather than a hexagon stamped into the coastline.
  //
  // Read here rather than folded in at the end so a fully muted pixel can leave
  // before evaluating the fbm-heavy fields it is about to multiply by zero.
  float mute = m.a * uPropMute;
  if (mute > 0.996) discard;

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
      // Close up, and faded in with distance from the shore. Running the
      // ribbons right up to the coastline puts two bright white patterns on top
      // of each other in the one place the eye is already reading an edge: the
      // foam band stops looking like the boundary of the water and starts
      // looking like the brightest part of a texture. Holding them off until
      // the foam has finished gives the coast a band of plain water to sit
      // against, and reads as the surface only catching the light once there is
      // some depth under it.
      //
      // Off the far channel, not the signed near one: the fade has to run well
      // past where R saturates.
      float offshore = m.g * uFarReach;
      float clearOfCoast = smoothstep(uCausticFadeStart, uCausticFadeStart + uCausticFadeWidth, offshore);
      if (clearOfCoast > 0.004) {
        float ribbon = causticField(vGround, uWaveTime) * uCausticAlpha * clearOfCoast;
        acc = vec4(uCausticColor * ribbon, ribbon) + acc * (1.0 - ribbon);
      }
    } else {
      float clearOfCoast = smoothstep(uWaveCoastFade.x, uWaveCoastFade.y, m.g);
      if (clearOfCoast > 0.004) {
        float crest = waveField(vWorld, uWaveTime) * clearOfCoast * uWaveAlpha;
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
  if (uShorelineFoam > 0.5) {
    // World-anchored, slowly drifting — the same reasoning as fog's cloud
    // field: anchored to the world rather than the screen, the pattern neither
    // stretches with world size nor slides out from under a camera pan.
    vec2 np = vGround * uFoamNoiseScale;
    float d = dist + uFoamNoise * uFoamWidth * (fbm(np + uFoamWind * uTime) - 0.5);

    // The band's width breathes. The low-frequency term de-synchronises the
    // surge along a coastline so it laps rather than pulsing as one ring, and
    // the mask's per-hex seed adds grain on top of that.
    float surgePhase = uTime * uSurgeRate + (noise(np * 0.22) + m.b) * 6.2831853;
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
    float shore = d >= 0.0
      ? 1.0 - smoothstep(width * uFoamInner, width, d)
      : 1.0 - smoothstep(0.0, width * uFoamLandReach, -d);

    // Two tiers. The inner line is nearly opaque and hard against the shore —
    // it is what makes the coast read as wet. The outer lace is wider, fainter
    // and broken up by thresholded noise — it is what makes it read as foam.
    float inner = smoothstep(0.55, 0.95, shore);
    float lace = smoothstep(0.40, 0.72, fbm(np * 2.7 + uFoamWind * uTime * 1.6));
    float outer = smoothstep(0.02, 0.5, shore) * lace;

    float foam = max(inner * uFoamAlpha.x, outer * uFoamAlpha.y);
    acc = vec4(uFoamColor * foam, foam) + acc * (1.0 - foam);
  }

  // Premultiplied, so one multiply mutes colour and coverage together.
  acc *= 1.0 - mute;

  if (acc.a < 0.004) discard;
  finalColor = acc;
}
`;
