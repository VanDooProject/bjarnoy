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
// no-op. The mask's unknown ramp is `UNKNOWN_MARGIN_HEXES` = 10 hexes wide,
// so it spans ~0.2 of the mask texture in UV; a warp amplitude small enough
// to be safe there (the shipped value was 0.006 UV ≈ 0.4 hex) moves the
// sample point by ~4% of the ramp, i.e. changes the fog's opacity by ~4%.
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
// A fourth octave was tried (see git history) for finer wisps, but cloud()
// below evaluates fbm() twice per pixel and this shader draws twice a frame
// (once per fog tier, §4), so each octave here is 4 noise() calls across a
// full viewport, every frame — on the software-rendered runners CI and this
// repo's e2e suite run on, that quietly turned into real wall-clock (issue
// #167: ring-menu.spec.ts's drill-down test, already the slowest test in its
// file, blew its 90s budget once this went from three octaves to four). The
// visible loss is the finest half-hex-scale detail; the edge is still
// fluffy from the remaining three.
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

/**
 * The drifting cloud field, in world space. Two layers moving against each
 * other at different scales and speeds — one layer alone translates as a
 * rigid sheet, which reads as the whole map sliding rather than as fog
 * churning in place.
 */
float cloud(vec2 world) {
  vec2 p = world * uNoiseScale;
  vec2 drift = uTime * uWind;
  return mix(fbm(p + drift), fbm(p * 1.9 - drift * 0.55), 0.4);
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
 */
float edgeBand(float raw, float low, float reach) {
  return smoothstep(0.0, low, raw) * (1.0 - smoothstep(reach, 1.0, raw));
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
float tierAlpha(float raw, vec2 edge, float reach, float noiseAmp, float seedAmp, float clouds, float seed) {
  float displaced = raw + ((clouds - 0.5) * noiseAmp + seed * seedAmp) * edgeBand(raw, edge.x, reach);
  return smoothstep(edge.x, edge.y, displaced);
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

  vec4 prev = sampleMask(uMaskPrev, maskUV);
  vec4 current = sampleMask(uMask, maskUV);
  vec4 m = mix(prev, current, uMaskBlend);

  // §1c: a live army's real-time vision only ever reveals — it multiplies
  // both ramps toward 0 (fully explored/visible), never pushes them up, and
  // it is applied to the blended mask above (uMask/uMaskPrev already mixed
  // into m), so it can't leak into what gets cross-faded from/to on the next
  // mask swap.
  float reveal = 1.0 - armyVisionReveal(world);
  m.r *= reveal;
  m.g *= reveal;

  float clouds = cloud(world);
  float seed = m.b - 0.5;

  float unknown = tierAlpha(m.r, uUnknownEdge, uNoiseReach.x, uEdgeNoise.x, uSeedJitter.x, clouds, seed);

  if (uTier < 0.5) {
    // A full underlay, deliberately unmasked — see §1's "the two tiers are
    // nested, not adjacent": never-scouted ground is also out of sight, so
    // wherever the mist applies the dark tint applies too, and the mist
    // quad above simply covers it up where it is opaque. The G ramp
    // saturating a couple of hexes past the visible ring and staying
    // saturated to the edge of the world is that underlay, not an
    // unbounded-tint bug; the dark band you see is the window where the
    // mist has not gone fully opaque yet, whose width UNKNOWN_EDGE
    // (FogMaskLayer.ts) sets. Masking this by (1 - unknown), or bounding it
    // to the explored ring, deletes the underlay — §1 says why not.
    float outOfSight = tierAlpha(m.g, uOutOfSightEdge, uNoiseReach.y, uEdgeNoise.y, uSeedJitter.y, clouds, seed);
    float alpha = outOfSight * uScoutedAlpha;
    finalColor = vec4(uScoutedColor * alpha, alpha);
  } else {
    finalColor = vec4(uUnexploredColor * unknown, unknown);
  }
}
`;
