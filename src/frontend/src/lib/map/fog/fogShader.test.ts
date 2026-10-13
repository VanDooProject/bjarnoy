import { describe, expect, it } from 'vitest';

// A JS mirror of fogShader.ts's (and waterShader.ts's identical) hash(),
// used to guard the mobile fog-banding fix without needing a real
// reduced-precision fragment shader to reproduce it in: the point of that
// fix is to keep every intermediate value the hash computes bounded by a
// small constant, however far `p` is from the origin, rather than growing
// linearly with it — see this file's own tests for why that's what a
// mediump-precision GPU (common on mobile, and what Pixi's own shader
// preprocessor falls back to on hardware that can't honour `highp` — see
// fogShader.ts's/waterShader.ts's leading precision line) needs in order
// for fract() not to lose every fractional bit and collapse the noise
// field into flat, blocky cells.
function fract(x: number): number {
  return x - Math.floor(x);
}

function mod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

/** fogShader.ts's hash() as it stood before the mobile-fog-banding fix: float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); } — kept here only as the counter-example the other tests are contrasted against. */
function preFixHashPreFractMagnitude(px: number, py: number): number {
  // The argument fract() is first asked to reduce — this is exactly the
  // value that needs enough fractional precision left to matter, and it
  // scales linearly with |p|, unbounded.
  return Math.max(Math.abs(px * 123.34), Math.abs(py * 456.21));
}

/** Current fogShader.ts / waterShader.ts hash(): float hash(vec2 p) { vec2 q = mod(p, 289.0); vec3 p3 = fract(vec3(q.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); } */
function hash(px: number, py: number): number {
  const qx = mod(px, 289.0);
  const qy = mod(py, 289.0);
  const p3x = fract(qx * 0.1031);
  const p3y = fract(qy * 0.1031);
  const p3z = fract(qx * 0.1031);
  const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  const x = p3x + dot;
  const y = p3y + dot;
  const z = p3z + dot;
  return fract((x + y) * z);
}

/** The value hash()'s own final fract() has to resolve — the quantity whose magnitude the fix bounds. */
function hashFinalPreFractMagnitude(px: number, py: number): number {
  const qx = mod(px, 289.0);
  const qy = mod(py, 289.0);
  const p3x = fract(qx * 0.1031);
  const p3y = fract(qy * 0.1031);
  const p3z = fract(qx * 0.1031);
  const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  const x = p3x + dot;
  const y = p3y + dot;
  const z = p3z + dot;
  return Math.abs((x + y) * z);
}

/** Distinct-value count over a lattice grid — a cheap stand-in for "did the hash actually vary" across neighbouring noise cells. */
function distinctValueCount(gridOrigin: number, gridSize: number): number {
  const seen = new Set<number>();
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      seen.add(Math.round(hash(gridOrigin + i, gridOrigin + j) * 1e6));
    }
  }
  return seen.size;
}

describe('fog/water noise hash (fogShader.ts / waterShader.ts hash())', () => {
  it('the pre-fix hash grows its pre-fract() magnitude unboundedly with distance from the origin', () => {
    // A world position a few thousand noise-space units out — an ordinary
    // large world (uNoiseScale is 1/900, and the world radius alone puts
    // `world` well into the thousands), or an ordinary play session's
    // accumulated cloud drift (uTime * uWind, unbounded over a long
    // session) — is exactly the range that pushed the old hash's fract()
    // argument into the thousands and beyond, which is where a
    // mediump-precision fragment shader (10-bit mantissa) has no
    // fractional bits left to give it.
    expect(preFixHashPreFractMagnitude(0, 0)).toBe(0);
    expect(preFixHashPreFractMagnitude(1_000, 1_000)).toBeGreaterThan(1e5);
    expect(preFixHashPreFractMagnitude(1_000_000, 1_000_000)).toBeGreaterThan(1e8);
  });

  it('the current hash keeps its intermediate magnitude bounded by a small constant at any distance', () => {
    // `mod(p, 289.0)` is what makes this true regardless of how far `p`
    // grows: every intermediate value the hash computes stays inside a
    // world-size-independent bound, so it behaves — everywhere in the
    // world, however long a session has been running — the way this
    // formula behaves for the small, bounded coordinates it's normally
    // used and tested with.
    for (const origin of [0, 1_000, 1_000_000, 1_000_000_000]) {
      expect(hashFinalPreFractMagnitude(origin, origin + 1)).toBeLessThan(22_000);
    }
  });

  it('stays well distributed across neighbouring noise cells at any distance from the origin', () => {
    for (const origin of [0, 500, 20_000, 1_000_000, 1_000_000_000]) {
      // 8x8 = 64 lattice cells; a healthy hash lands close to 64 distinct
      // values however far `origin` pushes the input — a hash that only
      // varies well near zero would reintroduce visible repetition or
      // flatness far from the world's centre.
      expect(distinctValueCount(origin, 8)).toBeGreaterThan(48);
    }
  });
});
