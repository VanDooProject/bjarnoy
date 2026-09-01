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
// which channel a given FogMaskLayer instance outputs, so the sampling/warp
// math (identical for both tiers) is written once, not duplicated.
//
// Deliberately not implemented here: §1c's live army-granted vision
// (`uArmyVisionSources`). It composites into `outOfSight` in the design
// doc's own pseudocode, but nothing in this codebase threads army live
// positions into the renderer yet (see docs/design/map-fog-v2.md §1c: "not
// implemented today, design for it anyway") — wiring a uniform array for a
// value that would only ever be empty is machinery with nothing to verify,
// so it's left as a real follow-up rather than dead plumbing.

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
uniform vec2 uWarp;
uniform float uTime;
uniform vec2 uWind;
// §2.8 debug flags — real functional toggles (FogDebugPanel), not cosmetic.
// uShowRaw bypasses both the warp and the tier compositing entirely, for
// inspecting the fetched mask texture itself (chunk-stitching seams, once
// §3's chunking lands).
uniform float uShowRaw;

// Cheap 2D value noise (hash + smooth interpolation) — no external
// dependency, good enough for a subtle UV wobble; not aiming for the
// visual quality a real simplex/perlin implementation would give.
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

// A hex-shaped 2D warp offset, two octaves (matches the doc's "two noise
// octave scales") — each axis independently noised (offset by a constant so
// the x/y components decorrelate) rather than the single scalar the design
// doc's own pseudocode sketches, which would only ever slide maskUV along
// one diagonal.
vec2 warpOffset(vec2 maskUV) {
  vec2 drift = uTime * uWind;
  vec2 n1 = vec2(noise(maskUV * 40.0 + drift), noise(maskUV * 40.0 + drift + 17.0)) - 0.5;
  vec2 n2 = vec2(noise(maskUV * 90.0 - drift * 0.6), noise(maskUV * 90.0 - drift * 0.6 + 31.0)) - 0.5;
  return n1 * uWarp + n2 * uWarp * 0.4;
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

  vec2 warp = warpOffset(maskUV);

  vec4 prev = sampleMask(uMaskPrev, maskUV + warp);
  vec4 current = sampleMask(uMask, maskUV + warp);
  vec4 m = mix(prev, current, uMaskBlend);

  float unknown = smoothstep(0.0, 1.0, m.r);
  float outOfSight = smoothstep(0.0, 1.0, m.g);

  if (uTier < 0.5) {
    float alpha = outOfSight * uScoutedAlpha;
    finalColor = vec4(uScoutedColor * alpha, alpha);
  } else {
    float alpha = unknown;
    finalColor = vec4(uUnexploredColor * alpha, alpha);
  }
}
`;
