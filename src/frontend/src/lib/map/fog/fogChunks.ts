// Client half of chunked fog delivery (docs/design/map-fog-v2.md §3).
//
// The server bakes the mask per 64 x 64-texel chunk (FogChunkLayout,
// backend) and hands over a whole viewport rectangle of them in one call.
// Chunking is a network/cache granularity only — the shader must keep
// sampling *one* texture so hardware bilinear filtering never sees a seam —
// so this module stitches the chunks it holds into one RGBA window covering
// the chunk rectangle around the camera. The window is what becomes the
// texture; `fogMaskPlacement(windowBounds(range), ...)` places it.
//
// Everything here is pure (no DOM, no network) so the stitching and window
// arithmetic are unit-testable; decoding PNGs and creating the bitmap live in
// fogChunkCodec.ts.
import { maskBounds, worldMaskBounds, type MaskBounds } from './fogMaskLayout';

/** Texels per chunk edge — must equal the backend's FogChunkLayout.ChunkSize (the response carries it, and the client refuses a mismatch). */
export const FOG_CHUNK_SIZE = 64;

/**
 * Chunks per window axis, at most — 16 x 16 matches the backend's
 * FogChunkService.MaxChunksPerRequest (256) and is a 1024 x 1024 texture.
 */
export const MAX_FOG_WINDOW_CHUNKS = 16;

/**
 * Chunks fetched beyond the viewport on every side. Also the hysteresis: the
 * window is only re-fetched once the viewport leaves it, so a pan of up to
 * this many chunks costs nothing.
 */
export const FOG_WINDOW_MARGIN_CHUNKS = 1;

/** An inclusive rectangle of chunk coordinates — the shape of the endpoint's query. */
export interface ChunkRange {
  cuMin: number;
  cuMax: number;
  cvMin: number;
  cvMax: number;
}

/**
 * What a chunk holds: RGBA8, `FOG_CHUNK_SIZE` square, row-major; `null` for
 * an *empty* chunk (fully unknown — the server sent no image).
 */
export type ChunkPixels = Uint8ClampedArray | null;

/**
 * What §3 says a texel nobody has told us about reads as: fully unknown
 * (R = 255). G is 255 too, which is what the generator itself bakes for
 * ground with no source in reach (the invariant unknown ⊆ outOfSight, §1);
 * B (the noise seed) is 0 — it only ever shifts a ramp that is still inside
 * its window, and a saturated texel is outside it.
 */
export const UNKNOWN_TEXEL: readonly [number, number, number, number] = [255, 255, 0, 255];

export function chunkKey(cu: number, cv: number): string {
  return `${cu},${cv}`;
}

export function chunkOfTexel(u: number, v: number): { cu: number; cv: number } {
  return { cu: Math.floor(u / FOG_CHUNK_SIZE), cv: Math.floor(v / FOG_CHUNK_SIZE) };
}

/** The chunk rectangle covering an inclusive texel rectangle. */
export function chunkRangeOfTexels(minU: number, maxU: number, minV: number, maxV: number): ChunkRange {
  const lo = chunkOfTexel(minU, minV);
  const hi = chunkOfTexel(maxU, maxV);
  return { cuMin: lo.cu, cuMax: hi.cu, cvMin: lo.cv, cvMax: hi.cv };
}

/** The chunk rectangle of a whole world — analytic, no walk of the world. */
export function worldChunkRange(radius: number): ChunkRange {
  const bounds = worldMaskBounds(radius);
  return chunkRangeOfTexels(bounds.minU, bounds.maxU - 1, bounds.minV, bounds.maxV - 1);
}

export function rangeContains(outer: ChunkRange, inner: ChunkRange): boolean {
  return (
    inner.cuMin >= outer.cuMin &&
    inner.cuMax <= outer.cuMax &&
    inner.cvMin >= outer.cvMin &&
    inner.cvMax <= outer.cvMax
  );
}

export function rangesEqual(a: ChunkRange | null, b: ChunkRange | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cuMin === b.cuMin && a.cuMax === b.cuMax && a.cvMin === b.cvMin && a.cvMax === b.cvMax;
}

function clampAxis(min: number, max: number, worldMin: number, worldMax: number): [number, number] {
  const lo = Math.max(min, worldMin);
  const hi = Math.min(max, worldMax);
  // A viewport wholly off the world on this axis has nothing to clamp to:
  // keep it as asked (the server answers empty chunks) rather than invent an
  // inverted range.
  return lo <= hi ? [lo, hi] : [min, max];
}

function capAxis(min: number, max: number, viewMin: number, viewMax: number, cap: number): [number, number] {
  if (max - min + 1 <= cap) return [min, max];
  // Wider than the window may be (an extreme zoom-out): centre it on the
  // viewport; ground beyond it reads as unknown, never as a leak.
  const centre = Math.floor((viewMin + viewMax) / 2);
  const lo = centre - Math.floor((cap - 1) / 2);
  return [lo, lo + cap - 1];
}

/**
 * The chunk window to fetch for a viewport: the viewport's chunk rectangle
 * plus `margin` on every side, clamped to the world (when known) and capped
 * at `MAX_FOG_WINDOW_CHUNKS` per axis around the viewport's centre.
 */
export function fogWindowFor(
  viewport: ChunkRange,
  world: ChunkRange | null,
  margin = FOG_WINDOW_MARGIN_CHUNKS,
  maxSpan = MAX_FOG_WINDOW_CHUNKS,
): ChunkRange {
  let [cuMin, cuMax] = [viewport.cuMin - margin, viewport.cuMax + margin];
  let [cvMin, cvMax] = [viewport.cvMin - margin, viewport.cvMax + margin];
  if (world) {
    [cuMin, cuMax] = clampAxis(cuMin, cuMax, world.cuMin, world.cuMax);
    [cvMin, cvMax] = clampAxis(cvMin, cvMax, world.cvMin, world.cvMax);
  }
  [cuMin, cuMax] = capAxis(cuMin, cuMax, viewport.cuMin, viewport.cuMax, maxSpan);
  [cvMin, cvMax] = capAxis(cvMin, cvMax, viewport.cvMin, viewport.cvMax, maxSpan);
  return { cuMin, cuMax, cvMin, cvMax };
}

/** The texel rectangle a chunk window covers — what the stitched texture is placed by. */
export function windowBounds(range: ChunkRange): MaskBounds {
  return maskBounds(
    range.cuMin * FOG_CHUNK_SIZE,
    range.cvMin * FOG_CHUNK_SIZE,
    (range.cuMax + 1) * FOG_CHUNK_SIZE,
    (range.cvMax + 1) * FOG_CHUNK_SIZE,
  );
}

/**
 * Stitches the held chunks into one RGBA8 image covering `range` (row-major,
 * `windowBounds(range)` texels). A chunk that is empty *or not held at all*
 * reads `UNKNOWN_TEXEL` — §3's "missing chunks default to fully unknown", so
 * a window can be rendered before every chunk has arrived and nothing needs
 * special-casing for the ones that haven't.
 */
export function stitchWindow(range: ChunkRange, chunks: ReadonlyMap<string, ChunkPixels>): Uint8ClampedArray {
  const bounds = windowBounds(range);
  const out = new Uint8ClampedArray(bounds.width * bounds.height * 4);

  // Start from "unknown" everywhere, then overwrite the held chunks.
  for (let i = 0; i < out.length; i += 4) {
    out[i] = UNKNOWN_TEXEL[0];
    out[i + 1] = UNKNOWN_TEXEL[1];
    out[i + 2] = UNKNOWN_TEXEL[2];
    out[i + 3] = UNKNOWN_TEXEL[3];
  }

  const rowBytes = FOG_CHUNK_SIZE * 4;
  for (let cv = range.cvMin; cv <= range.cvMax; cv++) {
    for (let cu = range.cuMin; cu <= range.cuMax; cu++) {
      const pixels = chunks.get(chunkKey(cu, cv));
      if (!pixels) continue;
      const originX = (cu - range.cuMin) * FOG_CHUNK_SIZE;
      const originY = (cv - range.cvMin) * FOG_CHUNK_SIZE;
      for (let row = 0; row < FOG_CHUNK_SIZE; row++) {
        const src = row * rowBytes;
        const dst = ((originY + row) * bounds.width + originX) * 4;
        out.set(pixels.subarray(src, src + rowBytes), dst);
      }
    }
  }

  return out;
}

/** One chunk of the endpoint's response — `png` is base64, or null for an empty chunk. */
export interface FogChunkWire {
  cu: number;
  cv: number;
  version: string;
  png: string | null;
}

/**
 * The client's memory of decoded chunks, keyed by address and remembering the
 * server `version` each was decoded from, so a refetch only decodes the chunks
 * that actually changed. Holds just what the current window needs: `retain`
 * drops the rest when the window moves, which bounds it at
 * `MAX_FOG_WINDOW_CHUNKS`² chunks.
 */
export class FogChunkCache {
  private readonly entries = new Map<string, { version: string; pixels: ChunkPixels }>();

  /** Whether the held copy of this chunk is the one the server would send now. */
  isCurrent(chunk: FogChunkWire): boolean {
    return this.entries.get(chunkKey(chunk.cu, chunk.cv))?.version === chunk.version;
  }

  set(chunk: FogChunkWire, pixels: ChunkPixels): void {
    this.entries.set(chunkKey(chunk.cu, chunk.cv), { version: chunk.version, pixels });
  }

  retain(range: ChunkRange): void {
    for (const key of [...this.entries.keys()]) {
      const [cu, cv] = key.split(',').map(Number);
      if (cu < range.cuMin || cu > range.cuMax || cv < range.cvMin || cv > range.cvMax) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  pixelsByKey(): ReadonlyMap<string, ChunkPixels> {
    const map = new Map<string, ChunkPixels>();
    for (const [key, entry] of this.entries) map.set(key, entry.pixels);
    return map;
  }
}
