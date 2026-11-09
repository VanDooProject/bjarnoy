// Vite plugin: builds the water shader's art "dry" masks (docs/design/water-shader.md §4.4b)
// from the vendored tile atlas and serves them as `virtual:water-dry-masks`.
//
// For every `_base` frame of the non-showcase atlas pages that repeats a plain
// water tile (see dryMaskCore.ts) it computes a half-resolution mask of the
// pixels that are not plain water, and packs all masks into one grey+alpha PNG (alpha = dry).
// Every bog lake `_base` frame gets a wet mask (the lake water in it, `lakeWetMaskHalf`) packed into a second PNG,
// served as the module's `lake` atlas (docs/design/water-shader.md, "Bog lakes").
// `virtual:river-water-masks` serves the river water masks (docs/design/water-shader.md §4.4e): every river, bog creek and
// river building `_base` frame's painted water (riverMaskCore.ts), packed the same way.
// The results are computed once per build / dev-server start and cached.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { hasRiverWater, riverMaskHalf, riverTexelCount, RIVER_MASK_MIN_TEXELS } from '../src/lib/map/water/riverMaskCore.ts';
import { LAKE_FRAME_RE, LAKE_REFERENCE_FRAME_RE, LAKE_TOP_FRAME_RE, REFERENCE_FRAME_RE, SOURCE_H, SOURCE_W, TOP_FACE_H, TOP_FACE_Y, WATER_MATCH_MIN_RATIO, bestReference, cellSourceRect, cropHalf, dryMaskHalf, lakeWetMaskHalf, orientationOf, } from '../src/lib/map/water/dryMaskCore.ts';
const VIRTUAL_ID = 'virtual:water-dry-masks';
const RIVER_ID = 'virtual:river-water-masks';
const ATLAS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor/bg_assets_hextile/atlas');
/** Width of the packed mask atlas in texels. */
const ATLAS_WIDTH = 2048;
/** Empty texels between cells, so linear filtering never bleeds one frame's mask into its neighbour's. */
const CELL_GAP = 1;
/**
 * Every non-showcase page's `_base` frames (the ones drawn under the water mesh), as full 200x300 RGBA canvases. Decoded once
 * and shared by both virtual modules (and the river tests' fixtures).
 */
export function loadBaseCanvases() {
    baseCanvases ??= readBaseCanvases();
    return baseCanvases;
}
let baseCanvases = null;
async function readBaseCanvases() {
    const result = new Map();
    const pages = readdirSync(ATLAS_DIR).filter((f) => f.endsWith('.json') && !f.includes('showcase'));
    for (const jsonName of pages) {
        const manifest = JSON.parse(readFileSync(join(ATLAS_DIR, jsonName), 'utf8'));
        const tile = manifest.meta?.bjarnoy?.tile;
        if (tile && (tile.w !== SOURCE_W || tile.h !== SOURCE_H || tile.topFaceY !== TOP_FACE_Y || tile.topFaceH !== TOP_FACE_H)) {
            throw new Error(`waterDryMasks: ${jsonName} has tile geometry ${JSON.stringify(tile)}, dryMaskCore assumes ${SOURCE_W}x${SOURCE_H} with the top face at ${TOP_FACE_Y}+${TOP_FACE_H}`);
        }
        // The base frames, plus the bog lake frames' top layers (their lily pads and islands are cut out of the lake wet mask).
        const names = Object.entries(manifest.frames).filter(([name, f]) => ((name.endsWith('_base') && f.bjarnoy?.layer === 'base') || (LAKE_TOP_FRAME_RE.test(name) && f.bjarnoy?.layer === 'top')) &&
            !f.rotated &&
            f.sourceSize.w === SOURCE_W &&
            f.sourceSize.h === SOURCE_H);
        if (names.length === 0)
            continue;
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
/** Shelf-packs `cells` (tallest first) into one grey+alpha PNG: grey 0, alpha = the mask. The sea and lake atlases both use it. */
async function packMaskAtlas(cells) {
    cells.sort((a, b) => b.rect.sh - a.rect.sh);
    const frames = {};
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
    const raw = new Uint8Array(ATLAS_WIDTH * height * 2);
    for (const cell of cells) {
        const { x: cx, y: cy } = frames[cell.name];
        const w = cell.rect.sw >> 1;
        const h = cell.rect.sh >> 1;
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                raw[((cy + row) * ATLAS_WIDTH + cx + col) * 2 + 1] = cell.mask[row * w + col];
            }
        }
    }
    const png = await sharp(raw, { raw: { width: ATLAS_WIDTH, height, channels: 2 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
    return { url: `data:image/png;base64,${png.toString('base64')}`, width: ATLAS_WIDTH, height, frames };
}
/**
 * Computes every dry mask (sea) and every lake wet mask (bog lakes) and packs each set into its own PNG. Exported for the build
 * log and tooling.
 */
export async function buildWaterDryMasks() {
    const bases = await loadBaseCanvases();
    const referencesByOrientation = new Map();
    const lakeReferenceByOrientation = new Map();
    for (const [name, { canvas }] of bases) {
        if (LAKE_REFERENCE_FRAME_RE.test(name))
            lakeReferenceByOrientation.set(orientationOf(name), canvas);
        if (!REFERENCE_FRAME_RE.test(name))
            continue;
        const orientation = orientationOf(name);
        referencesByOrientation.set(orientation, [...(referencesByOrientation.get(orientation) ?? []), canvas]);
    }
    const seaCells = [];
    const lakeCells = [];
    for (const [name, { canvas, trim }] of bases) {
        // A lake top layer only feeds its base frame's wet mask; it is no frame of its own.
        if (LAKE_TOP_FRAME_RE.test(name))
            continue;
        const orientation = orientationOf(name);
        // Every bog lake frame gets a wet mask, the plain lake included: the family name decides, not a match ratio.
        if (LAKE_FRAME_RE.test(name)) {
            const reference = orientation ? lakeReferenceByOrientation.get(orientation) : undefined;
            if (!reference)
                continue;
            const rect = cellSourceRect(trim);
            const top = bases.get(name.replace(/_base$/, ''))?.canvas;
            lakeCells.push({ name, rect, mask: cropHalf(lakeWetMaskHalf(canvas, reference, top), rect) });
            continue;
        }
        if (REFERENCE_FRAME_RE.test(name))
            continue;
        const references = orientation ? referencesByOrientation.get(orientation) : undefined;
        if (!references)
            continue;
        const best = bestReference(canvas, references);
        if (!best || best.ratio < WATER_MATCH_MIN_RATIO)
            continue;
        const rect = cellSourceRect(trim);
        seaCells.push({ name, rect, mask: cropHalf(dryMaskHalf(canvas, references[best.index]), rect) });
    }
    const [sea, lake] = await Promise.all([packMaskAtlas(seaCells), packMaskAtlas(lakeCells)]);
    return { ...sea, lake };
}
/** Computes every river water mask (river, bog creek and river building frames with painted river water) and packs them into one PNG. */
export async function buildRiverWaterMasks() {
    const bases = await loadBaseCanvases();
    const cells = [];
    for (const [name, { canvas, trim }] of bases) {
        if (!hasRiverWater(name) || riverTexelCount(canvas) < RIVER_MASK_MIN_TEXELS)
            continue;
        const rect = cellSourceRect(trim);
        cells.push({ name, rect, mask: cropHalf(riverMaskHalf(canvas), rect) });
    }
    return packMaskAtlas(cells);
}
export function waterDryMasksPlugin() {
    const cache = new Map();
    const builders = { [VIRTUAL_ID]: buildWaterDryMasks, [RIVER_ID]: buildRiverWaterMasks };
    return {
        name: 'water-dry-masks',
        resolveId(id) {
            return Object.hasOwn(builders, id) ? '\0' + id : null;
        },
        async load(id) {
            const virtualId = id.startsWith('\0') ? id.slice(1) : '';
            if (!Object.hasOwn(builders, virtualId))
                return null;
            if (!cache.has(virtualId))
                cache.set(virtualId, builders[virtualId]());
            return `export default ${JSON.stringify(await cache.get(virtualId))};`;
        },
    };
}
