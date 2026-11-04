import { BufferImageSource, Texture } from "pixi.js";

/**
 * Shared value noise for the map fragment shaders (fog, water).
 *
 * Why the lattice is a texture: the usual ALU hash (`fract(p * vec2(123.34,
 * 456.21))` ...) is not bit-stable across call sites on Mali GPUs (verified on
 * a Pixel 7 Pro, Mali-G710). The lattice corner two neighbouring noise cells
 * share then gets a different value from each side, which shows up as seams
 * along the lattice lines (blocky fog). A nearest-filtered texel read at an
 * exact texel centre is deterministic on every GPU, so the lattice values
 * come from `uNoiseLattice` instead. `shaderNoise.test.ts` keeps float hashes
 * out of the map shaders.
 */
export const NOISE_LATTICE_SIZE = 256;

/**
 * GLSL for `hash` and `noise`. Include once per fragment shader and bind
 * `noiseLatticeTexture().source` as `uNoiseLattice`. `hash` requires
 * whole-number input; the lattice repeats every NOISE_LATTICE_SIZE cells.
 */
export const NOISE_LATTICE_GLSL = `
uniform sampler2D uNoiseLattice;

float hash(vec2 i) {
  return texture(uNoiseLattice, (mod(i, ${NOISE_LATTICE_SIZE}.0) + 0.5) / ${NOISE_LATTICE_SIZE}.0).r;
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
`;

function latticeByte(x: number, y: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(0x5eed, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) & 0xff;
}

let sharedLattice: Texture | null = null;

/** The shared random-lattice texture (nearest filtering, repeating), created on first use. */
export function noiseLatticeTexture(): Texture {
  if (sharedLattice) return sharedLattice;
  const data = new Uint8Array(NOISE_LATTICE_SIZE * NOISE_LATTICE_SIZE * 4);
  for (let y = 0; y < NOISE_LATTICE_SIZE; y++) {
    for (let x = 0; x < NOISE_LATTICE_SIZE; x++) {
      const v = latticeByte(x, y);
      const o = (y * NOISE_LATTICE_SIZE + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  sharedLattice = new Texture({
    source: new BufferImageSource({
      resource: data,
      width: NOISE_LATTICE_SIZE,
      height: NOISE_LATTICE_SIZE,
      scaleMode: "nearest",
      addressMode: "repeat",
    }),
  });
  return sharedLattice;
}
