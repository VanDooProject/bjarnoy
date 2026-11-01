// Vite plugin: builds the water shader's art "dry" masks (docs/design/water-shader.md §4.4b)
// from the vendored tile atlas and serves them as `virtual:water-dry-masks`.
//
// For every `_base` frame of the non-showcase atlas pages that repeats a plain
// water tile (see dryMaskCore.ts) it computes a half-resolution mask of the
// pixels that are not plain water, and packs all masks into one grey+alpha PNG.
// The result is computed once per build / dev-server start and cached.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Plugin } from 'vite';
import {
  REFERENCE_FRAME_RE,
  SOURCE_H,
  SOURCE_W,
  WATER_MATCH_MIN_RATIO,
  bestReference,
  cellSourceRect,
  cropHalf,
  dryMaskHalf,
  orientationOf,
  type DryMaskFrame,
  type SourceRect,
  type WaterDryMasksData,
} from '../src/lib/map/water/dryMaskCore.ts';

const VIRTUAL_ID = 'virtual:water-dry-masks';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const ATLAS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor/bg_assets_hextile/atlas');
/** Width of the packed mask atlas in texels. */
const ATLAS_WIDTH = 2048;
/** Empty texels between cells, so linear filtering never bleeds one frame's mask into its neighbour's. */
const CELL_GAP = 1;

interface ManifestFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: SourceRect & { w: number; h: number };
  sourceSize: { w: number; h: number };
  rotated?: boolean;
  bjarnoy?: { layer?: string };
}
interface Manifest {
  frames: Record<string, ManifestFrame>;
}

/** Every non-showcase page's `_base` frames (the ones drawn under the water mesh), as full 200x300 RGBA canvases. */
async function loadBaseCanvases(): Promise<Map<string, { canvas: Uint8Array; trim: SourceRect }>> {
  const result = new Map<string, { canvas: Uint8Array; trim: SourceRect }>();
  const pages = readdirSync(ATLAS_DIR).filter((f) => f.endsWith('.json') && !f.includes('showcase'));
  for (const jsonName of pages) {
    const manifest = JSON.parse(readFileSync(join(ATLAS_DIR, jsonName), 'utf8')) as Manifest;
    const names = Object.entries(manifest.frames).filter(
      ([name, f]) => name.endsWith('_base') && f.bjarnoy?.layer === 'base' && !f.rotated && f.sourceSize.w === SOURCE_W && f.sourceSize.h === SOURCE_H,
    );
    if (names.length === 0) continue;
    const { data, info } = await sharp(join(ATLAS_DIR, jsonName.replace(/\.json$/, '.webp')))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const [name, f] of names) {
      const canvas = new Uint8Array(SOURCE_W * SOURCE_H * 4);
      const { frame: src, spriteSourceSize: trim } = f;
      for (let y = 0; y < src.h; y++) {
        const from = ((src.y + y) * info.width + src.x) * 4;
        canvas.set(data.subarray(from, from + src.w * 4), ((trim.y + y) * SOURCE_W + trim.x) * 4);
      }
      result.set(name, { canvas, trim });
    }
  }
  return result;
}

/** Computes every dry mask and packs them into one PNG. Exported for the build log and tooling. */
export async function buildWaterDryMasks(): Promise<WaterDryMasksData> {
  const bases = await loadBaseCanvases();
  const referencesByOrientation = new Map<string, Uint8Array[]>();
  for (const [name, { canvas }] of bases) {
    if (!REFERENCE_FRAME_RE.test(name)) continue;
    const orientation = orientationOf(name)!;
    referencesByOrientation.set(orientation, [...(referencesByOrientation.get(orientation) ?? []), canvas]);
  }

  const cells: { name: string; rect: ReturnType<typeof cellSourceRect>; mask: Uint8Array }[] = [];
  for (const [name, { canvas, trim }] of bases) {
    if (REFERENCE_FRAME_RE.test(name)) continue;
    const orientation = orientationOf(name);
    const references = orientation ? referencesByOrientation.get(orientation) : undefined;
    if (!references) continue;
    const best = bestReference(canvas, references);
    if (!best || best.ratio < WATER_MATCH_MIN_RATIO) continue;
    const rect = cellSourceRect(trim);
    cells.push({ name, rect, mask: cropHalf(dryMaskHalf(canvas, references[best.index]), rect) });
  }

  // Shelf packing, tallest first.
  cells.sort((a, b) => b.rect.sh - a.rect.sh);
  const frames: Record<string, DryMaskFrame> = {};
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const cell of cells) {
    const w = cell.rect.sw >> 1;
    const h = cell.rect.sh >> 1;
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += shelfH + CELL_GAP;
      shelfH = 0;
    }
    frames[cell.name] = { x, y, ...cell.rect };
    x += w + CELL_GAP;
    shelfH = Math.max(shelfH, h);
  }
  const height = Math.max(1, y + shelfH);

  // Grey + alpha, both the mask: the browser decodes it to (v, v, v, v) once premultiplied.
  const raw = new Uint8Array(ATLAS_WIDTH * height * 2);
  for (const cell of cells) {
    const { x: cx, y: cy } = frames[cell.name];
    const w = cell.rect.sw >> 1;
    const h = cell.rect.sh >> 1;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const v = cell.mask[row * w + col];
        const o = ((cy + row) * ATLAS_WIDTH + cx + col) * 2;
        raw[o] = 255;
        raw[o + 1] = v;
      }
    }
  }
  const png = await sharp(raw, { raw: { width: ATLAS_WIDTH, height, channels: 2 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { url: `data:image/png;base64,${png.toString('base64')}`, width: ATLAS_WIDTH, height, frames };
}

export function waterDryMasksPlugin(): Plugin {
  let cached: Promise<WaterDryMasksData> | null = null;
  return {
    name: 'water-dry-masks',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      cached ??= buildWaterDryMasks();
      const data = await cached;
      return `export default ${JSON.stringify(data)};`;
    },
  };
}
