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
// The mask/noise/army/edge math lives in ONE pass, FOG_FIELD_FRAGMENT, run by
// FogField into a world-anchored render texture: R = out-of-sight (dark)
// tier alpha, G = unknown (white mist) tier alpha. Both tiers' colours are
// constants (uScoutedColor x uScoutedAlpha, uUnexploredColor), so the two
// stage quads (FogMaskLayer) are cheap composites, FOG_COMPOSITE_FRAGMENT,
// that only sample that texture and tint it. The two quads exist because
// markerLayer sits between them (dark fog under markers, mist over them).
//
// §1c's live army-granted vision: `uArmyVisionSources` is a small, bounded
// (MAX_ARMY_VISION_SOURCES) array of world-space points, uploaded fresh every
// frame from HexMapRenderer's already-computed live army render positions
// (FogMaskLayer.setArmyVisionSources) — never written into `uMask`/`uMaskPrev`
// themselves, so an army in transit never busts the server's cached PNG (see
// FogMaskService's own remarks on why §1c stays shader-only). The troop writes
// its own pair of ramps (`armyRamps` below) in the mask's own units — 0 at the
// troop, 1 far away, one ramp per channel — and takes the min() with the
// mask's R/G before edgeBand()/tierAlpha run, so the troop's clearing is shaped
// by exactly the same edge window, noise displacement, softness and wisps as
// the village's. Only the ramp widths differ: the troop's margins are much
// narrower than the village's 14/2, so its edge is the village look at a
// smaller scale. Distance is hex-euclidean (world offset divided by
// uArmyHexSize, so every neighbouring hex is exactly 1 away), the same metric
// as demoFogMask.ts's ringDistance/hexEuclideanDistance, so the clearing is
// the same flat ellipse on screen as the village's rather than a world-unit
// circle.
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

import { NOISE_LATTICE_GLSL } from '../shaderNoise';
import { EDGE_NOISE_FADE_RAMP } from './fogRamp';

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

export const FOG_FIELD_FRAGMENT = `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uMask;
uniform sampler2D uMaskPrev;

uniform float uMaskBlend;
// The world rectangle this render covers: vUV (0..1, top-down) maps onto it.
uniform vec2 uFieldOrigin;
uniform vec2 uFieldSize;
uniform vec2 uWorldToMaskScale;
uniform vec2 uWorldToMaskOffset;
// The placement uMaskPrev was uploaded with: the mask is a chunk window that
// moves with the camera, so the texture being faded out generally sits at a
// different place than the one fading in (see FogMaskLayer.setMaskTexture).
uniform vec2 uWorldToMaskScalePrev;
uniform vec2 uWorldToMaskOffsetPrev;
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
// uShowEffective is uShowRaw's complement: it dumps the mask channels right
// after the army-vision ramps below have been min()'d in, so it's the
// one debug view that can show a troop's live contribution to fog (uShowRaw
// returns before that reveal ever runs, so it never can).
uniform float uShowEffective;
// §1c's live army vision — see this file's header comment. Only the first
// uArmyVisionCount entries of uArmyVisionSources are read (world units, the
// same space the world position below is computed in). uArmyHexSize is the
// world-unit size of one hex step along x and y, which turns a world offset
// into the hex-euclidean distance used by armyRamps. uArmyVisionRadii[i] is
// source i's own vision radius in hexes (ArmyResponse.visionRadius: the
// best-sighted unit type plus Odin's Ravens). uArmyRamp is
// (blackOffset, blackMargin, whiteOffset, whiteMargin), all in hexes and
// relative to a source's own radius, so one set of ramp widths serves every
// army whatever it sees.
uniform vec2 uArmyVisionSources[${MAX_ARMY_VISION_SOURCES}];
uniform float uArmyVisionRadii[${MAX_ARMY_VISION_SOURCES}];
uniform float uArmyVisionCount;
uniform vec2 uArmyHexSize;
uniform vec4 uArmyRamp;

// Value noise (hash + smooth interpolation) from shaderNoise.ts: the lattice
// values are a texture lookup, because a float ALU hash is not bit-stable on
// Mali GPUs and seams the noise.
${NOISE_LATTICE_GLSL}
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
 * §1c's troop ramps at a world-space point, in the mask's own units: x is the
 * unknown (white) ramp, y the out-of-sight (black) ramp — 0 where the troop
 * clears the fog, 1 where it does not, linear in between over the margin
 * given in uArmyRamp. The distance d is the hex-euclidean distance to a
 * live source (world offset divided by uArmyHexSize) less that source's own
 * vision radius, so a neighbouring hex is 1 away and the clearing is a flat
 * ellipse on screen like the village's. The most revealing source wins (min
 * over the sources' ramps, each with its own radius), so two
 * armies standing close together read as one unbroken clearing. With no
 * sources the result is vec2(1.0), which min() against the mask leaves
 * untouched.
 */
vec2 armyRamps(vec2 world) {
  if (uArmyVisionCount < 0.5) return vec2(1.0);
  vec2 ramps = vec2(1.0);
  for (int i = 0; i < ${MAX_ARMY_VISION_SOURCES}; i++) {
    if (float(i) >= uArmyVisionCount) break;
    float d = length((world - uArmyVisionSources[i]) / uArmyHexSize) - uArmyVisionRadii[i];
    ramps = min(ramps, clamp(vec2((d - uArmyRamp.z) / uArmyRamp.w, (d - uArmyRamp.x) / uArmyRamp.y), 0.0, 1.0));
  }
  return ramps;
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
  vec2 world = uFieldOrigin + vUV * uFieldSize;
  vec2 maskUV = world * uWorldToMaskScale + uWorldToMaskOffset;

  if (uShowRaw > 0.5) {
    finalColor = sampleMask(uMask, maskUV);
    return;
  }

  // uMaskPrev only matters while a reveal cross-fade is actually running
  // (§2.6), which is a few hundred milliseconds after a mask swap and never
  // again — the steady state is uMaskBlend == 1, where the mix is the
  // identity and the second fetch is a texture read thrown away.
  vec4 m = sampleMask(uMask, maskUV);
  if (uMaskBlend < 1.0) {
    vec2 maskUVPrev = world * uWorldToMaskScalePrev + uWorldToMaskOffsetPrev;
    m = mix(sampleMask(uMaskPrev, maskUVPrev), m, uMaskBlend);
  }

  // §1c: a live army's real-time vision only ever reveals — min() with the
  // troop's own ramps (armyRamps) pulls each channel toward 0 (fully
  // explored/visible), never pushes it up, and it is applied to the blended
  // mask above, so it can't leak into what gets cross-faded from/to on the
  // next mask swap. Applied before the tier/band selection below so the
  // troop's ramp opens the edge-noise window exactly like the village's.
  vec2 army = armyRamps(world);
  m.r = min(m.r, army.x);
  m.g = min(m.g, army.y);

  // uShowEffective dumps right here — after the troop ramps above have landed
  // but before tier/band selection reshapes it into an edge.
  if (uShowEffective > 0.5) {
    finalColor = vec4(m.r, m.g, m.b, 1.0);
    return;
  }

  // The dark tier is a full underlay, deliberately unmasked by the mist —
  // see §1's "the two tiers are nested, not adjacent": never-scouted ground
  // is also out of sight, so wherever the mist applies the dark tint
  // applies too, and the mist quad above simply covers it up where it is
  // opaque. Masking this by 1 minus the mist, or bounding it to the explored
  // ring, deletes the underlay — §1 says why not.
  float rawDark = m.g;
  float rawMist = m.r;
  float bandDark = edgeBand(rawDark, uOutOfSightEdge.x, uNoiseReach.y);
  float bandMist = edgeBand(rawMist, uUnknownEdge.x, uNoiseReach.x);

  // Everything the cloud field feeds is multiplied by band, which is zero
  // across solid mist and across clear ground alike — most of any frame.
  // Skipping it there is declining to do work with no effect: two
  // multi-octave fbm evaluations, tens of hashes per pixel.
  vec2 clouds = vec2(0.5, 1.0); // neutral: no displacement, no thinning
  if (bandDark > 0.0 || bandMist > 0.0) {
    clouds = cloudLayers(world);
  }

  float seed = m.b - 0.5;
  float alphaDark = tierAlpha(rawDark, uOutOfSightEdge, bandDark, uEdgeNoise.y, uSeedJitter.y, uEdgeSoftness.y, clouds, seed);
  float alphaMist = tierAlpha(rawMist, uUnknownEdge, bandMist, uEdgeNoise.x, uSeedJitter.x, uEdgeSoftness.x, clouds, seed);
  finalColor = vec4(alphaDark, alphaMist, 0.0, 1.0);
}
`;

/**
 * The stage quads' fragment shader: samples the field texture (FogField) at the
 * pixel's world position and tints the tier's alpha with its constant colour,
 * premultiplied. The debug views (raw / effective mask) are written straight
 * into the field's RGB by FOG_FIELD_FRAGMENT and shown as-is.
 */
export const FOG_COMPOSITE_FRAGMENT = `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uField;
uniform vec2 uViewport;
uniform vec2 uCameraPos;
uniform float uZoom;
uniform vec2 uFieldOrigin;
uniform vec2 uFieldSize;
uniform float uDebugView;
uniform float uTier;
uniform vec3 uScoutedColor;
uniform vec3 uUnexploredColor;
uniform float uScoutedAlpha;

void main() {
  vec2 screen = vUV * uViewport;
  vec2 world = (screen - uViewport * 0.5) / uZoom + uCameraPos;
  vec2 f = (world - uFieldOrigin) / uFieldSize;
  // The field is drawn through a clip-space quad, so its first texel row is its bottom edge: flip v.
  vec4 field = texture(uField, vec2(f.x, 1.0 - f.y));

  if (uDebugView > 0.5) {
    finalColor = vec4(field.rgb, 1.0);
    return;
  }
  if (uTier < 0.5) {
    float alpha = field.r * uScoutedAlpha;
    finalColor = vec4(uScoutedColor * alpha, alpha);
  } else {
    finalColor = vec4(uUnexploredColor * field.g, field.g);
  }
}
`;
