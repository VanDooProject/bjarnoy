// The fog mask's B channel: a smooth, deterministic "lump" value of a texel's own position, which the fog field shader
// pushes the edge in or out by (fogShader.ts), so the edge is irregular at the scale of a hex or two instead of tracing the
// distance ramp's contours. The backend bakes the same value (`FogMaskGenerator.TexelLump`, C#); fogLump.test.ts and
// FogMaskGeneratorTests share one golden table of texels so the two ports cannot drift.
// Integer maths is 32-bit wrapping (`Math.imul`, `>>>`), which the C# port mirrors with unchecked uint arithmetic.

/** Hash of an integer lattice point and a salt to [0, 1). */
export function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise on the integer lattice (hermite-interpolated), in [0, 1]. */
export function valueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, salt);
  const b = hash01(ix + 1, iy, salt);
  const c = hash01(ix, iy + 1, salt);
  const d = hash01(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * The lump value (0..255) at mask texel (u, v), hex texel or interpolation texel alike: value noise at about two hexes (60%)
 * plus about one hex (40%). The texel is read as a continuous axial position (q = u, r = (v - u) / 2), then as unit-spaced
 * cartesian coordinates, so the lumps are round rather than stretched by the doubled-row layout.
 */
export function texelLump(u: number, v: number): number {
  const q = u;
  const r = (v - u) / 2;
  const x = q + r / 2;
  const y = (r * Math.sqrt(3)) / 2;
  const coarse = valueNoise(x / 2, y / 2, 11);
  const fine = valueNoise(x + 31.7, y + 5.3, 7);
  return Math.round(255 * (0.6 * coarse + 0.4 * fine));
}
