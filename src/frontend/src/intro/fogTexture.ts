const OCTAVES = 4;
const BASE_CELLS = 4;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Periodic fractal value noise in [0,1]: `size` is the period in both axes, so
 * `field(x, y) === field(x + size, y)` and the texture tiles seamlessly.
 */
export function createFogField(size: number, seed = 0x5a6a): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const lattices: { cells: number; values: Float32Array; amp: number }[] = [];
  let amp = 1;
  let total = 0;
  for (let o = 0; o < OCTAVES; o++) {
    const cells = BASE_CELLS << o;
    const values = new Float32Array(cells * cells);
    for (let i = 0; i < values.length; i++) values[i] = rand();
    lattices.push({ cells, values, amp });
    total += amp;
    amp *= 0.5;
  }
  return (x, y) => {
    let sum = 0;
    for (const { cells, values, amp: a } of lattices) {
      const gx = (((x / size) % 1) + 1) % 1 * cells;
      const gy = (((y / size) % 1) + 1) % 1 * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = smooth(gx - x0);
      const fy = smooth(gy - y0);
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const top = values[y0 * cells + x0] * (1 - fx) + values[y0 * cells + x1] * fx;
      const bottom = values[y1 * cells + x0] * (1 - fx) + values[y1 * cells + x1] * fx;
      sum += (top * (1 - fy) + bottom * fy) * a;
    }
    return sum / total;
  };
}

/** size*size noise values in [0,1], row-major, deterministic for a seed. */
export function fogNoise(size: number, seed = 0x5a6a): Float32Array {
  const field = createFogField(size, seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = field(x, y);
  return out;
}

/** White RGB with alpha = noise, so the fog colour comes from the CSS / layer behind. */
export function createFogCanvas(size = 256, seed = 0x5a6a): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const noise = fogNoise(size, seed);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < noise.length; i++) {
    // Stretch the mid-range so the fog has clear wisps and gaps.
    const a = Math.min(1, Math.max(0, (noise[i] - 0.25) / 0.6));
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let cachedUrl: string | null = null;

/** Generated once, then reused by every beat. */
export function introFogUrl(): string {
  cachedUrl ??= createFogCanvas().toDataURL('image/png');
  return cachedUrl;
}
