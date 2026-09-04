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
uniform float uSeaBody;
uniform float uShowMask;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uSeaMottle;
uniform float uMottleScale;

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

// The mask's channels, named. R: distance from land, 0 at the coastline and 1
// at FOAM_REACH_TILES. G: distance from water, ramped inward over
// FOAM_BLEED_TILES. B: per-hex seed. A: water coverage.
//
// Sampled with linear filtering, which is what makes the land/water boundary
// land on a sub-texel position rather than a texel edge — see WaterLayer's
// own note on the sampler's scale mode.
vec4 sampleMask() {
  return texture(uWaterMask, vUV);
}

// The raw-channel debug view (§5's showWaterMask). Hard-stepped contour bands
// on R, so the coastline the mask believes in reads as a crisp line you can
// lay over the painted art and see any disagreement immediately. This is what
// the throwaway spike existed for, kept as a permanent option.
vec4 maskDebugColor(vec4 m) {
  float contour = step(0.5, fract(m.r * 8.0));
  vec3 col = vec3(m.r * contour, m.g, m.a * 0.5);
  return vec4(col, 0.85);
}

void main() {
  vec4 m = sampleMask();

  if (uShowMask > 0.5) {
    vec4 dbg = maskDebugColor(m);
    finalColor = vec4(dbg.rgb * dbg.a, dbg.a);
    return;
  }

  // Land per the mask. Nothing this shader draws belongs on land except the
  // foam's inward bleed (§3.5), which reads G rather than getting here.
  if (m.a < 0.5) discard;

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
  if (uSeaBody > 0.5) {
    float depth = smoothstep(0.0, 1.0, m.r);
    col = mix(uShallowColor, uDeepColor, depth);
    // One octave, not three. This is a very low-frequency mottle whose whole
    // job is that a large expanse of open water isn't a flat fill; the finer
    // octaves would cost the same each and be invisible under the waves and
    // foam drawn on top.
    float mottle = noise(vWorld * uMottleScale) - 0.5;
    col += mottle * uSeaMottle;
    alpha = 1.0;
  }

  if (alpha < 0.004) discard;
  finalColor = vec4(col * alpha, alpha);
}
`;
