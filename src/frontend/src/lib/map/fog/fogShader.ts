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
// Deliberately not implemented here: §1c's live army-granted vision
// (`uArmyVisionSources`). It composites into `outOfSight` in the design
// doc's own pseudocode, but nothing in this codebase threads army live
// positions into the renderer yet (see docs/design/map-fog-v2.md §1c: "not
// implemented today, design for it anyway") — wiring a uniform array for a
// value that would only ever be empty is machinery with nothing to verify,
// so it's left as a real follow-up rather than dead plumbing.
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
// has none of.
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
  return mix(fbm(p + drift), fbm(p * 1.9 - drift * 0.55), 0.35);
}

/**
 * How much of the edge noise is allowed to act at a given ramp value: full
 * strength through the middle of the ramp, tapering to exactly zero at both
 * endpoints. This is what makes the displacement safe — see the file header.
 */
float edgeBand(float raw, vec2 edge) {
  return smoothstep(0.0, edge.x, raw) * (1.0 - smoothstep(edge.y, 1.0, raw));
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
float tierAlpha(float raw, vec2 edge, float noiseAmp, float seedAmp, float clouds, float seed) {
  float displaced = raw + ((clouds - 0.5) * noiseAmp + seed * seedAmp) * edgeBand(raw, edge);
  return smoothstep(edge.x, edge.y, displaced);
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

  float clouds = cloud(world);
  float seed = m.b - 0.5;

  float unknown = tierAlpha(m.r, uUnknownEdge, uEdgeNoise.x, uSeedJitter.x, clouds, seed);

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
    float outOfSight = tierAlpha(m.g, uOutOfSightEdge, uEdgeNoise.y, uSeedJitter.y, clouds, seed);
    float alpha = outOfSight * uScoutedAlpha;
    finalColor = vec4(uScoutedColor * alpha, alpha);
  } else {
    finalColor = vec4(uUnexploredColor * unknown, unknown);
  }
}
`;
