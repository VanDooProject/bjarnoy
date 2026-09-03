// Fog v2's fragment shader, per docs/design/map-fog-v2.md §2.4. Written in
// Pixi's portable GL1/GL2-compatible convention — `in`/`out`, `texture()),
// and (critically) an output variable named exactly `finalColor` — with no
// `#version 300 es` pragma. Pixi's GlProgram only treats a shader as GLSL ES
// 300 if that pragma is literally present in the source; without it, Pixi's
// own addProgramDefines preprocessor macros this in/out/finalColor/texture()
// syntax down to WebGL1-compatible GLSL (varying/gl_FragColor/texture2D) for
// contexts that need it, and leaves it untouched where GLSL ES 300 is
// natively supported. `finalColor` isn't an arbitrary choice: it's the exact
// name Pixi's own macro layer expects (`#define finalColor gl_FragColor`) —
// any other name leaves a stray `out` declaration that fails to compile.
//
// One shared fragment shader for both fog tiers (§4's "one layer that draws
// two passes") — `uTier` (0 = out-of-sight/black, 1 = unknown/white) picks
// which channel a given FogMaskLayer instance outputs, so the sampling/edge
// math (identical for both tiers) is written once, not duplicated.
//
// §1c's live army-granted vision: `uArmyVisionSources` is a small, bounded
// (MAX_ARMY_VISION_SOURCES) array of world-space points, uploaded fresh every
// frame from HexMapRenderer's already-computed live army render positions
// (FogMaskLayer.setArmyVisionSources) — never written into `uMask`/`uMaskPrev`
// themselves, so an army in transit never busts the server's cached PNG (see
// FogMaskService's own remarks on why §1c stays shader-only). Composites as a
// straight multiplicative reveal on the ramp values (`armyReveal` below,
// applied to both m.r and m.g before tierAlpha) rather than through
// edgeBand()'s noise displacement — this is a real-time visibility bonus, not
// part of the organic edge's cloud texture, so it gets its own simple radial
// falloff instead of inheriting the vision edge's noise machinery.
//
// --- Why the edge noise displaces the ramp, not the sample UV -------------
//
// §2.4's pseudocode sketches the organic edge as a *UV* warp: sample the
// mask at `maskUV + noise`. Implemented literally that is, measurably, a
// no-op. The mask's unknown ramp was `UNKNOWN_MARGIN_HEXES` = 10 hexes wide
// at the time, spanning ~0.2 of the mask texture in UV; a warp amplitude
// small enough to be safe there (the shipped value was 0.006 UV ≈ 0.4 hex)
// moves the sample point by ~4% of the ramp, i.e. changes the fog's opacity
// by ~4%.
// Nothing about that is visible, animated or not — which is also why the
// `warp` and `drift` debug toggles looked like they did nothing.
//
// So the noise is applied where the visible quantity actually lives: to the
// *ramp value itself*, in ramp units, where an amplitude is directly
// readable as "this edge wobbles by N hexes." The safety property §2.4
// wanted from the UV formulation — that jitter can never push a value past
// its own ramp's endpoints, v1's bug class where black fog bled into the
// player's own realm — is kept explicitly instead of structurally, by
// `edgeBand()` below: the noise is windowed to zero at both ends of the
// ramp, so a fully-explored texel (0) can never be nudged into fog and a
// fully-unknown one (1) can never be thinned out of it.
//
// That windowing is also what keeps the deep mist exactly as opaque as it
// is today — the organic, drifting, cloudy behaviour is confined to the
// vision edge, which is the only place it belongs.

/**
 * Width, in ramp units, of the taper that closes the edge-noise window past
 * each tier's `reach` (see edgeBand). Exported and interpolated into the
 * GLSL below rather than written twice, because the renderer derives its
 * terrain cull radius from where this window shuts: past that point the mist
 * is provably fully opaque, and drawing ground under it is wasted fill.
 */
export const EDGE_NOISE_FADE_RAMP = 0.25;

export const FOG_VERTEX = `
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;

void main() {
  vUV = aUV;
  // Positions are already in clip space (see FogMaskLayer's geometry) — this
  // mesh always covers the whole viewport, independent of camera/world
  // transforms, so there is no projection/world matrix to apply.
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Upper bound on live army sources composited into the fog shader per frame
 * — see FOG_FRAGMENT's `uArmyVisionSources` array. "A handful of entries —
 * current armies in transit" per §1c; a real GLSL array needs a fixed
 * compile-time size, and 8 is comfortably above what a single settlement
 * view or world map would ever show moving at once. FogMaskLayer.ts truncates
 * to this count if HexMapRenderer ever hands it more.
 */
export const MAX_ARMY_VISION_SOURCES = 8;

export const FOG_FRAGMENT = `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uMask;
uniform sampler2D uMaskPrev;

uniform float uMaskBlend;
uniform vec2 uViewport;
uniform vec2 uCameraPos;
uniform float uZoom;
uniform vec2 uWorldToMaskScale;
uniform vec2 uWorldToMaskOffset;
uniform float uTier;
uniform vec3 uScoutedColor;
uniform vec3 uUnexploredColor;
uniform float uScoutedAlpha;
// Where each tier's ramp turns over, in ramp units (0 = at the ring, 1 = the
// generator's full margin — 10 hexes for unknown, 2 for out-of-sight). x is
// where the tier starts showing at all, y where it saturates.
uniform vec2 uUnknownEdge;
uniform vec2 uOutOfSightEdge;
// Per-tier amplitude of the drifting cloud displacement (x) and of the
// mask's baked per-hex seed (y), both in ramp units. See the file header for
// why these displace the ramp rather than the sample UV.
uniform vec2 uEdgeNoise;
uniform vec2 uSeedJitter;
// Per-tier strength of the density thinning applied on top of the threshold
// displacement — see tierAlpha().
uniform vec2 uEdgeSoftness;
// Per-tier ramp value at which the noise starts tapering off, reaching zero
// at 1.0. Deliberately independent of where the tier's opacity saturates —
// see edgeBand().
uniform vec2 uNoiseReach;
// Reciprocal of the largest noise octave's feature size, in world units —
// the fog's cloud structure is anchored to the *world*, not to the mask
// texture, so it neither scales with world radius (a bigger world would
// otherwise stretch every billow) nor slides around under a camera pan.
uniform float uNoiseScale;
uniform float uTime;
uniform vec2 uWind;
// §2.8 debug flags — real functional toggles (FogDebugPanel), not cosmetic.
// uShowRaw bypasses the edge shaping and tier compositing entirely, for
// inspecting the fetched mask texture itself (chunk-stitching seams, once
// §3's chunking lands).
uniform float uShowRaw;
// §1c's live army vision — see this file's header comment. Only the first
// uArmyVisionCount entries of uArmyVisionSources are read; uArmyVisionRadius
// is in world units (the same space the world position below is computed
// in), shared by every source rather than per-army, matching
// FogVisionRadii.ArmyVisionRadiusHexes (backend) having no per-unit-type
// variant to draw from either.
uniform vec2 uArmyVisionSources[${MAX_ARMY_VISION_SOURCES}];
uniform float uArmyVisionCount;
uniform float uArmyVisionRadius;

// Cheap 2D value noise (hash + smooth interpolation) — no external
// dependency, good enough for a fog edge; not aiming for the visual quality
// a real simplex/perlin implementation would give.
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

// Three octaves, normalised back to roughly 0..1. A single octave of value
// noise reads as smooth blobs — recognisably procedural; the octaves are
// what give the edge the frayed, wispy silhouette a hex-ring distance field
// has none of, each one adding detail at half the scale of the last.
//
// Three, not more, because octaves cost the same each and are worth less
// each: the fourth carries 1/16 of the amplitude and the fifth 1/32, at a
// scale finer than the mask texel grid the whole field is displacing. This
// is the hot path — cloud() evaluates fbm() twice per pixel on a
// full-viewport quad, drawn once per tier (§4), so an octave is 4 noise()
// calls over the whole viewport every frame. An octave that cannot be seen
// is not free detail, it is a quarter of the noise budget. #168 trimmed the
// fourth octave on main for the same reason, arriving here independently.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.875;
}

// The haze layer's cheaper cousin. It only feeds tierAlpha's density term —
// a soft, broad thinning — where the fine octaves are invisible but cost the
// same as the coarse ones. Half the noise evaluations of fbm() for a term
// nothing can see the detail of.
float fbmCoarse(vec2 p) {
  float sum = noise(p) * 0.5;
  sum += noise(p * 2.03) * 0.25;
  return sum / 0.75;
}

/**
 * The drifting cloud field, in world space: two layers at different scales,
 * drifting the same way at different speeds. The scale and speed difference
 * is what keeps them from reading as one rigid sheet sliding across the map
 * — parallax, the way two layers of real cloud at different altitudes move
 * with the same wind.
 *
 * They used to drift in *opposite* directions, which decorrelates them more
 * thoroughly but is visibly wrong: the edge and the haze inside it slide
 * past each other, and whichever one you happen to be watching, the other
 * one is going the wrong way.
 *
 * Note the sign. The drift offset is added to the sample *coordinate*, so a positive
 * uWind moves the pattern in the negative world direction — the wind vector
 * points where the fog comes from, not where it goes. Flip uWind to reverse
 * it; do not flip these terms individually, or the two layers separate
 * again.
 *
 * Both layers are returned rather than pre-mixed because tierAlpha wants two
 * weakly-correlated fields: x drives the edge displacement, y the density
 * thinning.
 */
vec2 cloudLayers(vec2 world) {
  vec2 p = world * uNoiseScale;
  vec2 drift = uTime * uWind;
  return vec2(fbm(p + drift), fbmCoarse(p * 1.9 + drift * 0.55));
}

/**
 * How much of the edge noise is allowed to act at a given ramp value: full
 * strength through the middle of the ramp, tapering to exactly zero at both
 * endpoints. The taper to zero is what makes the displacement safe — see
 * the file header.
 *
 * The outer taper starts at reach, not at the tier's own saturation point
 * (edge.y), because the two want different things. Opacity has to climb
 * fairly promptly — every hex it spends still translucent is a hex of bare
 * terrain showing through the mist. The noise wants to keep acting well
 * past that, thinning ground that is otherwise solid mist, because that is
 * where the outermost wisps and detached banks come from. Tying them
 * together forces a choice between a wide fluffy edge and a mist that
 * actually covers.
 *
 * It also *ends* before the ramp does. That is what gives the renderer a
 * radius past which the mist is provably opaque — the one thing that lets
 * terrain drawing stop somewhere defensible instead of at a guessed margin,
 * and the difference is measurable: culling on the ramp's full width rather
 * than on where this window shuts costs about 30ms a frame on a
 * software-rendered runner.
 */
float edgeBand(float raw, float low, float reach) {
  return smoothstep(0.0, low, raw) * (1.0 - smoothstep(reach, reach + ${EDGE_NOISE_FADE_RAMP}, raw));
}

/**
 * One tier's opacity: the baked distance ramp, displaced by the drifting
 * cloud and the mask's per-hex seed (§2.2's B channel — deterministic
 * per-hex variation, so the edge breaks up differently over each hex instead
 * of tracing one clean curve), then remapped onto the tier's own window.
 *
 * The displacement is what removes the hexagonal banding the raw mask has:
 * both generators measure hexDistance, an integer, so the ramp's contours
 * are concentric hexagons and the fog boundary inherits their straight
 * edges. An amplitude of more than one hex scrambles those rings into a
 * boundary with no preferred direction left.
 */
float tierAlpha(
  float raw,
  vec2 edge,
  float band,
  float noiseAmp,
  float seedAmp,
  float softness,
  vec2 clouds,
  float seed
) {
  float displaced = raw + ((clouds.x - 0.5) * noiseAmp + seed * seedAmp) * band;
  float alpha = smoothstep(edge.x, edge.y, displaced);

  // Displacing the threshold alone gives a *hard* edge, however irregular
  // its shape: every pixel is on one side of the ramp or the other, and the
  // transition is only as gradual as the ramp is wide. Real fog also just
  // gets thinner in places. So thin the result by a second, independent
  // cloud layer, windowed to the same band — a multiplicative density term
  // rather than another displacement, which is what puts soft gradients
  // inside the frayed silhouette instead of only at its outline.
  return alpha * (1.0 - softness * band * (1.0 - clouds.y));
}

/**
 * §1c's real-time reveal at a world-space point: 1.0 within
 * uArmyVisionRadius of the nearest live army source, smoothly tapering to
 * 0.0 by 1.5x that radius, 0.0 with no sources at all. A max, not a sum,
 * across sources — two armies standing close together should read as one
 * unbroken revealed patch, not a brighter one.
 */
float armyVisionReveal(vec2 world) {
  float reveal = 0.0;
  for (int i = 0; i < ${MAX_ARMY_VISION_SOURCES}; i++) {
    if (float(i) >= uArmyVisionCount) break;
    float dist = distance(world, uArmyVisionSources[i]);
    reveal = max(reveal, 1.0 - smoothstep(uArmyVisionRadius, uArmyVisionRadius * 1.5, dist));
  }
  return reveal;
}

// Outside the fetched/generated mask entirely (past the world's own
// radius) reads as "never scouted" — never a leak, always correct, per
// map-fog-v2.md §3's missing-chunk-default rule, which applies just as much
// to ground past the world edge as to a chunk that hasn't arrived yet.
vec4 sampleMask(sampler2D tex, vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(1.0, 0.0, 0.0, 1.0);
  }
  return texture(tex, uv);
}

void main() {
  vec2 screen = vUV * uViewport;
  vec2 world = (screen - uViewport * 0.5) / uZoom + uCameraPos;
  vec2 maskUV = world * uWorldToMaskScale + uWorldToMaskOffset;

  if (uShowRaw > 0.5) {
    finalColor = sampleMask(uMask, maskUV);
    return;
  }

  // uMaskPrev only matters while a reveal cross-fade is actually running
  // (§2.6), which is a few hundred milliseconds after a mask swap and never
  // again — the steady state is uMaskBlend == 1, where the mix is the
  // identity and the second fetch is a full-viewport texture read thrown
  // away. uMaskBlend is a uniform, so this branch is uniform across the
  // draw, not per-pixel divergence.
  vec4 m = sampleMask(uMask, maskUV);
  if (uMaskBlend < 1.0) {
    m = mix(sampleMask(uMaskPrev, maskUV), m, uMaskBlend);
  }

  // §1c: a live army's real-time vision only ever reveals — it multiplies
  // both ramps toward 0 (fully explored/visible), never pushes them up, and
  // it is applied to the blended mask above (uMask/uMaskPrev already mixed
  // into m), so it can't leak into what gets cross-faded from/to on the next
  // mask swap. Applied before the tier/band selection below so the reveal
  // also opens the edge-noise window, rather than being shaped by a band
  // computed from the un-revealed ramp.
  float reveal = 1.0 - armyVisionReveal(world);
  m.r *= reveal;
  m.g *= reveal;

  // This quad draws one tier, so it reads one channel and one set of edge
  // parameters. uTier is a uniform, so these select without divergence —
  // and evaluating both tiers here would mean every pixel of the dark quad
  // paying for a mist alpha it then discards.
  //
  // The dark tier is a full underlay, deliberately unmasked by the mist —
  // see §1's "the two tiers are nested, not adjacent": never-scouted ground
  // is also out of sight, so wherever the mist applies the dark tint
  // applies too, and the mist quad above simply covers it up where it is
  // opaque. The G ramp saturating a couple of hexes past the visible ring
  // and staying saturated to the edge of the world is that underlay, not an
  // unbounded-tint bug; the dark band you see is the window where the mist
  // has not gone fully opaque yet, whose width UNKNOWN_EDGE
  // (FogMaskLayer.ts) sets. Masking this by 1 minus the mist, or bounding it
  // to the explored ring, deletes the underlay — §1 says why not.
  bool dark = uTier < 0.5;
  float raw = dark ? m.g : m.r;
  vec2 edge = dark ? uOutOfSightEdge : uUnknownEdge;
  float reach = dark ? uNoiseReach.y : uNoiseReach.x;
  float noiseAmp = dark ? uEdgeNoise.y : uEdgeNoise.x;
  float seedAmp = dark ? uSeedJitter.y : uSeedJitter.x;
  float softness = dark ? uEdgeSoftness.y : uEdgeSoftness.x;

  float band = edgeBand(raw, edge.x, reach);

  // Everything the cloud field feeds is multiplied by band, which is zero
  // across solid mist and across clear ground alike — most of any frame,
  // and nearly all of a zoomed-out one. Skipping it there isn't an
  // optimisation of the maths, it's declining to do work with no effect:
  // two multi-octave fbm evaluations, tens of hashes per pixel, over a
  // full-screen quad, twice a frame for the two tiers. Left unconditional
  // it is enough to stall a software renderer's main thread — the same
  // hazard §2.5 documents for v1's per-frame BlurFilter, which is what its
  // half-res pass exists to bound.
  vec2 clouds = vec2(0.5, 1.0); // neutral: no displacement, no thinning
  if (band > 0.0) {
    clouds = cloudLayers(world);
  }

  float alpha = tierAlpha(raw, edge, band, noiseAmp, seedAmp, softness, clouds, m.b - 0.5);

  if (dark) {
    alpha *= uScoutedAlpha;
    finalColor = vec4(uScoutedColor * alpha, alpha);
  } else {
    finalColor = vec4(uUnexploredColor * alpha, alpha);
  }
}
`;
