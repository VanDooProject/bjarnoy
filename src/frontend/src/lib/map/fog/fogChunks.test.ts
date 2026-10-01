import { describe, expect, it } from 'vitest';
import {
  FOG_CHUNK_SIZE,
  FogChunkCache,
  MAX_FOG_WINDOW_CHUNKS,
  UNKNOWN_TEXEL,
  chunkKey,
  chunkOfTexel,
  chunkRangeOfTexels,
  fogWindowFor,
  rangeContains,
  rangesEqual,
  stitchWindow,
  windowBounds,
  worldChunkRange,
  type ChunkPixels,
} from './fogChunks';
import { toTexel } from './fogMaskLayout';

/** A chunk whose every texel is (r, g, b, 255) — distinct per chunk so a misplaced copy is visible. */
function solidChunk(r: number, g: number, b: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(FOG_CHUNK_SIZE * FOG_CHUNK_SIZE * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  }
  return pixels;
}

/** A chunk whose texel (x, y) encodes its own position: r = x, g = y. */
function positionalChunk(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(FOG_CHUNK_SIZE * FOG_CHUNK_SIZE * 4);
  for (let y = 0; y < FOG_CHUNK_SIZE; y++) {
    for (let x = 0; x < FOG_CHUNK_SIZE; x++) {
      const i = (y * FOG_CHUNK_SIZE + x) * 4;
      pixels[i] = x;
      pixels[i + 1] = y;
      pixels[i + 2] = 7;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function pixelAt(image: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4;
  return [image[i], image[i + 1], image[i + 2], image[i + 3]];
}

describe('chunk addressing', () => {
  it('uses floor division so negative texels tile without a double-wide chunk at zero', () => {
    expect(chunkOfTexel(0, 0)).toEqual({ cu: 0, cv: 0 });
    expect(chunkOfTexel(63, 63)).toEqual({ cu: 0, cv: 0 });
    expect(chunkOfTexel(64, -1)).toEqual({ cu: 1, cv: -1 });
    expect(chunkOfTexel(-64, -65)).toEqual({ cu: -1, cv: -2 });
  });

  it('agrees with the backend FogChunkLayout on a hex: same texel, same chunk', () => {
    // Mirrors FogChunkLayoutTests.cs — the client derives the viewport's
    // chunk rectangle from texels, the server addresses chunks by them.
    const t = toTexel({ q: -100, r: 40 });
    expect(t).toEqual({ u: -100, v: -20 });
    expect(chunkOfTexel(t.u, t.v)).toEqual({ cu: -2, cv: -1 });
  });

  it('covers a whole world analytically — radius 4000 is 126 x 252 chunks', () => {
    const range = worldChunkRange(4000);

    expect(range).toEqual({ cuMin: -63, cuMax: 62, cvMin: -126, cvMax: 125 });
    expect((range.cuMax - range.cuMin + 1) * (range.cvMax - range.cvMin + 1)).toBe(126 * 252);
  });

  it('builds a chunk range from an inclusive texel rectangle', () => {
    expect(chunkRangeOfTexels(-10, 70, 0, 63)).toEqual({ cuMin: -1, cuMax: 1, cvMin: 0, cvMax: 0 });
  });
});

describe('fogWindowFor', () => {
  const viewport = { cuMin: 0, cuMax: 1, cvMin: 0, cvMax: 0 };

  it('adds the margin on every side', () => {
    expect(fogWindowFor(viewport, null, 1)).toEqual({ cuMin: -1, cuMax: 2, cvMin: -1, cvMax: 1 });
  });

  it('clamps to the world so the window never asks for chunks that cannot exist', () => {
    const world = { cuMin: 0, cuMax: 1, cvMin: 0, cvMax: 0 };

    expect(fogWindowFor(viewport, world, 1)).toEqual({ cuMin: 0, cuMax: 1, cvMin: 0, cvMax: 0 });
  });

  it('keeps a viewport wholly off the world as asked rather than inventing an inverted range', () => {
    const world = { cuMin: 0, cuMax: 1, cvMin: 0, cvMax: 0 };
    const off = { cuMin: 10, cuMax: 10, cvMin: 10, cvMax: 10 };

    expect(fogWindowFor(off, world, 0)).toEqual(off);
  });

  it('caps an enormous zoom-out at the max window, centred on the viewport', () => {
    const wide = { cuMin: -40, cuMax: 40, cvMin: -3, cvMax: 3 };

    const window = fogWindowFor(wide, null, 1);

    expect(window.cuMax - window.cuMin + 1).toBe(MAX_FOG_WINDOW_CHUNKS);
    expect(window.cuMin).toBeLessThanOrEqual(0);
    expect(window.cuMax).toBeGreaterThanOrEqual(0);
    // The other axis wasn't too wide, so it is not capped.
    expect(window.cvMax - window.cvMin + 1).toBe(9);
  });

  it('rangeContains / rangesEqual compare inclusive rectangles', () => {
    const outer = { cuMin: -1, cuMax: 2, cvMin: -1, cvMax: 1 };
    expect(rangeContains(outer, viewport)).toBe(true);
    expect(rangeContains(viewport, outer)).toBe(false);
    expect(rangesEqual(outer, { ...outer })).toBe(true);
    expect(rangesEqual(outer, null)).toBe(false);
    expect(rangesEqual(null, null)).toBe(true);
  });
});

describe('stitchWindow', () => {
  const range = { cuMin: -1, cuMax: 0, cvMin: 2, cvMax: 3 }; // 2 x 2 chunks, negative u
  const bounds = windowBounds(range);

  it('sizes the window to whole chunks at the right texel origin', () => {
    expect(bounds).toEqual({ minU: -64, minV: 128, maxU: 64, maxV: 256, width: 128, height: 128 });
  });

  it('puts each chunk at its own place in the window', () => {
    const chunks = new Map<string, ChunkPixels>([
      [chunkKey(-1, 2), solidChunk(10, 0, 0)],
      [chunkKey(0, 2), solidChunk(20, 0, 0)],
      [chunkKey(-1, 3), solidChunk(30, 0, 0)],
      [chunkKey(0, 3), solidChunk(40, 0, 0)],
    ]);

    const image = stitchWindow(range, chunks);

    expect(image.length).toBe(bounds.width * bounds.height * 4);
    expect(pixelAt(image, bounds.width, 0, 0)[0]).toBe(10); // top-left chunk
    expect(pixelAt(image, bounds.width, 127, 0)[0]).toBe(20); // top-right
    expect(pixelAt(image, bounds.width, 0, 127)[0]).toBe(30); // bottom-left
    expect(pixelAt(image, bounds.width, 127, 127)[0]).toBe(40); // bottom-right
    // The seam between chunks is exact: last column of one, first of the next.
    expect(pixelAt(image, bounds.width, 63, 10)[0]).toBe(10);
    expect(pixelAt(image, bounds.width, 64, 10)[0]).toBe(20);
    expect(pixelAt(image, bounds.width, 10, 63)[0]).toBe(10);
    expect(pixelAt(image, bounds.width, 10, 64)[0]).toBe(30);
  });

  it('keeps a chunk texel-for-texel, not scaled or shifted', () => {
    const chunks = new Map<string, ChunkPixels>([[chunkKey(0, 3), positionalChunk()]]);

    const image = stitchWindow(range, chunks);

    // Chunk (0, 3) sits at window x 64.., y 64..; texel (5, 9) of it is at (69, 73).
    expect(pixelAt(image, bounds.width, 64 + 5, 64 + 9)).toEqual([5, 9, 7, 255]);
    expect(pixelAt(image, bounds.width, 64 + 63, 64 + 63)).toEqual([63, 63, 7, 255]);
  });

  it('reads an empty chunk and a chunk that never arrived as fully unknown, so nothing special-cases an unloaded chunk', () => {
    const chunks = new Map<string, ChunkPixels>([
      [chunkKey(-1, 2), solidChunk(0, 0, 0)],
      [chunkKey(0, 2), null], // the server said: empty
      // (-1, 3) and (0, 3): never fetched
    ]);

    const image = stitchWindow(range, chunks);

    expect(pixelAt(image, bounds.width, 10, 10)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(image, bounds.width, 100, 10)).toEqual([...UNKNOWN_TEXEL]);
    expect(pixelAt(image, bounds.width, 10, 100)).toEqual([...UNKNOWN_TEXEL]);
    expect(pixelAt(image, bounds.width, 100, 100)).toEqual([...UNKNOWN_TEXEL]);
    expect(UNKNOWN_TEXEL[0]).toBe(255);
  });
});

describe('FogChunkCache', () => {
  const wire = (cu: number, cv: number, version: string) => ({ cu, cv, version, png: null });

  it('is current only for the exact version it decoded', () => {
    const cache = new FogChunkCache();
    cache.set(wire(0, 0, 'v1'), solidChunk(1, 1, 1));

    expect(cache.isCurrent(wire(0, 0, 'v1'))).toBe(true);
    expect(cache.isCurrent(wire(0, 0, 'v2'))).toBe(false);
    expect(cache.isCurrent(wire(1, 0, 'v1'))).toBe(false);
  });

  it('remembers an empty chunk as current too (no image is not "not held")', () => {
    const cache = new FogChunkCache();
    cache.set(wire(2, 2, '0'), null);

    expect(cache.isCurrent(wire(2, 2, '0'))).toBe(true);
    expect(cache.pixelsByKey().get(chunkKey(2, 2))).toBeNull();
  });

  it('retains only the chunks of the window it is moved to, bounding its size', () => {
    const cache = new FogChunkCache();
    for (let cu = -3; cu <= 3; cu++) cache.set(wire(cu, 0, 'v'), null);

    cache.retain({ cuMin: 0, cuMax: 1, cvMin: 0, cvMax: 0 });

    expect([...cache.pixelsByKey().keys()].sort()).toEqual([chunkKey(0, 0), chunkKey(1, 0)]);
    expect(cache.size).toBe(2);
  });
});
