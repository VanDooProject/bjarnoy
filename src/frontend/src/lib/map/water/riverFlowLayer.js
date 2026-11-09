// The river flow layer at runtime — docs/design/water-shader.md §4.4e.
//
// `build/waterDryMasks.ts` bakes a river water mask per river frame
// (`virtual:river-water-masks`). This file decodes that atlas once, turns a
// frame's mask into a ripple cell (riverFlow.ts) for the tile's downstream edge,
// and draws the cells, placed where the tile art is drawn, into one render
// texture covering the water mask's world rect. The water shader samples it
// with the same UVs as the water mask and draws the moving ripple crests on the
// river pixels.
import { BufferImageSource, Texture } from 'pixi.js';
import { topFaceEdgeIndex } from '../riverPath';
import { SOURCE_W } from './dryMaskCore';
import { dryCellWorldRect, MaskRenderTarget } from './waterDryMask';
import { RiverRippleSolver } from './riverRippleSolver';
import { buildBankContext, confluenceArmRanges, topFacePolygonTexels } from './riverFlow';
/**
 * Where the water of a hex goes, from the data: a river's `outDirection` (a mouth without one flows towards `seaDirection`),
 * a bog creek's, creek spring's or lake mouth's. `null` for hexes that have no flow: lava streams, springs without an
 * out edge, plain bog and lake hexes. A lake mouth fades away from its creek edge (the one of in/out that is not a lake edge).
 */
export function riverFlowOf(river, bog, seaDirection) {
    if (river) {
        if (river.wasted)
            return null;
        const outDirection = river.outDirection ?? (river.shape === 'mouth' ? seaDirection : null);
        return outDirection ? { outDirection, inDirections: river.inDirections } : null;
    }
    if (bog && (bog.kind === 'creek' || bog.kind === 'creekspring' || bog.kind === 'mouth') && bog.outDirection) {
        if (bog.kind !== 'mouth')
            return { outDirection: bog.outDirection, inDirections: bog.inDirections };
        const creekEdge = [bog.inDirections[0], bog.outDirection].find((d) => d !== undefined && !bog.waterEdges.includes(d));
        return { outDirection: bog.outDirection, inDirections: bog.inDirections, fadeDirection: creekEdge };
    }
    return null;
}
let masksPromise = null;
/** Decodes the build-time river mask atlas to its mask plane, once and lazily. */
function loadMasks() {
    masksPromise ??= (async () => {
        const { default: data } = await import('virtual:river-water-masks');
        const blob = await (await fetch(data.url)).blob();
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('river masks: no 2d context to decode the atlas');
        ctx.drawImage(bitmap, 0, 0);
        const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const alpha = new Uint8Array(bitmap.width * bitmap.height);
        for (let i = 0; i < alpha.length; i++)
            alpha[i] = rgba[i * 4 + 3];
        return { data, alpha };
    })();
    masksPromise.catch(() => {
        masksPromise = null;
    });
    return masksPromise;
}
/** Copies one frame's mask cell out of the decoded atlas plane. */
export function cropAtlasCell(alpha, atlasWidth, frame) {
    const cw = frame.sw >> 1;
    const ch = frame.sh >> 1;
    const mask = new Uint8Array(cw * ch);
    for (let row = 0; row < ch; row++) {
        const from = (frame.y + row) * atlasWidth + frame.x;
        mask.set(alpha.subarray(from, from + cw), row * cw);
    }
    return { mask, cw, ch };
}
/** Splits a cell's RGBA data into its top face and its rim past the face (`inside` = 1 on the face): each keeps only its own texels. */
export function splitFaceAndRim(data, inside) {
    const face = new Uint8Array(data.length);
    const rim = new Uint8Array(data.length);
    for (let p = 0; p < inside.length; p++) {
        const target = inside[p] ? face : rim;
        target.set(data.subarray(p * 4, p * 4 + 4), p * 4);
    }
    return { face, rim };
}
/** The longest side, in pixels, of the flow render textures. */
export const RIVER_RT_MAX_SIDE = 4096;
/** The bounding box of world rects; a unit box at the origin for none. */
export function boundsOf(rects) {
    if (rects.length === 0)
        return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
        minX: Math.min(...rects.map((r) => r.x)),
        minY: Math.min(...rects.map((r) => r.y)),
        maxX: Math.max(...rects.map((r) => r.x + r.w)),
        maxY: Math.max(...rects.map((r) => r.y + r.h)),
    };
}
/**
 * Owns the river flow render texture, the flow cells computed for it and the sprites drawn into it.
 *
 * `draw` runs when the water mask is applied or the terrain base entries change, never per frame.
 */
export class RiverFlowLayer {
    // Larger than the dry mask's 2048 px: the river cells' box spans a whole region of the map, and a flow texel is 1.7 world units, so at
    // 2048 px over several thousand units the fine marks (streak lines, stream function lanes) were sampled coarser than the data.
    target = new MaskRenderTarget(RIVER_RT_MAX_SIDE);
    /** The same cells' stream function (`computeRiverRipple`'s `psi`, in the blue channel), over the same rect, so it is read with the same UVs. */
    psiTarget = new MaskRenderTarget(RIVER_RT_MAX_SIDE);
    masks = null;
    cells = new Map();
    /** The cell size of every request still out, which the texture build needs once its result lands. */
    requested = new Map();
    /** Solves the cells off the main thread; a cell that is still out is drawn without flow. */
    solver = new RiverRippleSolver((key, result) => this.install(key, result), () => {
        this.requested.clear();
        this.onCellsReady?.();
    });
    onCellsReady;
    /** `onCellsReady` runs once the last outstanding cell has landed, so the owner can `draw` again with them all. */
    constructor(options = {}) {
        this.onCellsReady = options.onCellsReady ?? null;
    }
    /** Whether cells are still being solved, i.e. some river hex is drawn without its flow yet. */
    get pending() {
        return this.solver.busy;
    }
    drawnRect = null;
    /** The masks are lazily decoded; resolves when `draw` can use them. */
    async load() {
        this.masks = await loadMasks();
    }
    get ready() {
        return this.masks !== null;
    }
    /** The render texture the water shader samples, or null before the first `draw`. */
    get texture() {
        return this.target.texture;
    }
    /** The stream function's render texture (same rect and UVs as `texture`), or null before the first `draw`. */
    get psiTexture() {
        return this.psiTarget.texture;
    }
    /**
     * The cell of one frame / edge combination as two textures: its own top face, and the rim past its in and out edges. The
     * layer draws every rim first and every face over them, so a rim only fills the strip where the neighbouring hex's own
     * art has no water (its water stops short of the edge) and never overwrites the neighbour's face with this cell's
     * version of it. Drawn in one pass, whichever hex came later overwrote up to `FACE_PAD_TEXELS` of the other's face: a
     * second, shifted seam inside the neighbour.
     */
    cellTextures(masks, name, frame, entry, tileWidth, psiRange) {
        const outEdge = topFaceEdgeIndex(entry.outDirection);
        const inEdges = entry.inDirections.map(topFaceEdgeIndex).sort((a, b) => a - b);
        const fadeEdge = entry.fadeDirection ? topFaceEdgeIndex(entry.fadeDirection) : undefined;
        // The neighbours behind the edges (frame names; where they lie is fixed by the edge) are part of the key: the distance to
        // the bank is measured on the water of both hexes of a seam.
        const neighbours = (entry.neighbours ?? [])
            .map((n) => ({ edge: topFaceEdgeIndex(n.direction), n }))
            .filter(({ n }) => masks.data.frames[n.name])
            .sort((a, b) => a.edge - b.edge);
        const key = `${name}|${outEdge}|${inEdges.join(',')}|${fadeEdge ?? ''}|${neighbours.map(({ edge, n }) => `${edge}:${n.name}`).join(',')}|${psiRange[0]},${psiRange[1]}`;
        const pair = this.cells.get(key);
        if (!pair) {
            const { mask, cw, ch } = cropAtlasCell(masks.alpha, masks.data.width, frame);
            const polygon = topFacePolygonTexels(frame.sx, frame.sy);
            const k = tileWidth / SOURCE_W;
            const placed = (f, o, m) => ({ ...m, x: o.x + f.sx * k, y: o.y + f.sy * k });
            const context = buildBankContext(placed(frame, entry, { mask, cw, ch }), polygon, neighbours.map(({ edge, n }) => {
                const nf = masks.data.frames[n.name];
                return { edge, cell: placed(nf, n, cropAtlasCell(masks.alpha, masks.data.width, nf)) };
            }), 2 * k);
            this.requested.set(key, { cw, ch });
            const flow = this.solver.solve(key, { mask, cw, ch, polygon, inEdges, outEdge, fadeEdge, context, psiRange });
            return flow ? this.install(key, flow, false) : null;
        }
        return pair;
    }
    /** Turns a solved cell into its textures and caches it; tells the owner when that was the last cell out. */
    install(key, flow, notify = true) {
        const size = this.requested.get(key);
        this.requested.delete(key);
        if (!size)
            return null;
        const { cw, ch } = size;
        const { face, rim } = splitFaceAndRim(flow.data, flow.inside);
        const psiParts = splitFaceAndRim(flow.psi, flow.inside);
        const texture = (data) => new Texture({ source: new BufferImageSource({ resource: data, width: cw, height: ch, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
        const cell = { face: texture(face), rim: texture(rim), psiFace: texture(psiParts.face), psiRim: texture(psiParts.rim) };
        this.cells.set(key, cell);
        // One redraw for the whole batch rather than one per cell: each draw re-renders every river cell.
        if (notify && !this.solver.busy)
            this.onCellsReady?.();
        return cell;
    }
    /** The world rect the texture covers (the river hexes' cells), for the shader's own UVs; null before the first `draw`. */
    get rect() {
        return this.drawnRect;
    }
    /**
     * Rebuilds the render texture from `entries`, the base art of every river and bog-creek hex. Entries whose frame has no
     * river mask are skipped. The texture covers only the river cells' own bounding box, not the water mask's whole region:
     * at the region's size it ran at a third of a texel per world unit, so the flow field went blocky and the seams ragged.
     * Returns the (possibly new) texture to bind.
     */
    draw(renderer, entries, tileWidth) {
        const masks = this.masks;
        if (!masks)
            return this.target.texture;
        // Each cell's psi range in the stream function of the whole river: a cell feeding an arm of a confluence takes that arm's share of
        // the confluence's own range, composed up the chain of drawn cells (a cell with no confluence downstream keeps [0, 1]).
        const byPosition = new Map(entries.map((e) => [`${e.x},${e.y}`, e]));
        const ranges = new Map();
        const polygon = topFacePolygonTexels(0, 0);
        const rangeOf = (entry, depth = 0) => {
            const known = ranges.get(entry);
            if (known)
                return known;
            let range = [0, 1];
            const outNeighbour = entry.neighbours?.find((n) => n.direction === entry.outDirection);
            const down = outNeighbour ? byPosition.get(`${outNeighbour.x},${outNeighbour.y}`) : undefined;
            if (down && depth < 32) {
                const arm = confluenceArmRanges(polygon, topFaceEdgeIndex(down.outDirection), down.inDirections.map(topFaceEdgeIndex)).get((topFaceEdgeIndex(entry.outDirection) + 3) % 6);
                const [lo, hi] = rangeOf(down, depth + 1);
                if (arm)
                    range = [lo + (hi - lo) * arm[0], lo + (hi - lo) * arm[1]];
                else
                    range = [lo, hi];
            }
            ranges.set(entry, range);
            return range;
        };
        const rims = [];
        const faces = [];
        const psiRims = [];
        const psiFaces = [];
        for (const entry of entries) {
            const name = entry.texture.label ?? '';
            const frame = masks.data.frames[name];
            if (!frame)
                continue;
            // Not solved yet: this hex is drawn without flow until its cell lands and `onCellsReady` asks for another draw.
            const cell = this.cellTextures(masks, name, frame, entry, tileWidth, rangeOf(entry));
            if (!cell)
                continue;
            const { face, rim, psiFace, psiRim } = cell;
            const rect = dryCellWorldRect(entry, frame, tileWidth);
            rims.push({ texture: rim, rect, tint: 0xffffff });
            faces.push({ texture: face, rect, tint: 0xffffff });
            psiRims.push({ texture: psiRim, rect, tint: 0xffffff });
            psiFaces.push({ texture: psiFace, rect, tint: 0xffffff });
        }
        this.drawnRect = boundsOf(faces.map((p) => p.rect));
        this.psiTarget.render(renderer, this.drawnRect, [...psiRims, ...psiFaces]);
        return this.target.render(renderer, this.drawnRect, [...rims, ...faces]);
    }
    destroy() {
        this.onCellsReady = null;
        this.solver.destroy();
        this.requested.clear();
        this.target.destroy();
        this.psiTarget.destroy();
        for (const { face, rim, psiFace, psiRim } of this.cells.values()) {
            face.destroy(true);
            rim.destroy(true);
            psiFace.destroy(true);
            psiRim.destroy(true);
        }
        this.cells.clear();
    }
}
