// Deterministic, dependency-free procedural terrain: a scattered archipelago
// of distinct islands (matching the docs/design/zip-brainstorms.md world-map
// mockup) rather than one continuous landmass. Tiles are generated on demand
// from (q, r) and a seed, so nothing needs to be precomputed or stored for
// the whole map — memory is bounded by hexes actually visited.
import { axialToOddQ, hexDistance, hexRing, oddQToAxial, neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS } from './types';
/**
 * Deterministic 2D hash in `[0, 1)` — the ECMAScript-integer-coercion-exact
 * function `Bjarnoy.Domain.World.ValueNoise.Hash2` (backend) is a bit-exact
 * port of. Exported so `giantPlacement.ts` can roll the same
 * shrine-chance/tie-break hashes the backend's `GiantGenerator` does,
 * without duplicating the arithmetic.
 */
export function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 100000) / 100000;
}
function smooth(t) {
    return t * t * (3 - 2 * t);
}
/** Bilinear value noise sampled on a lattice of the given cell size. */
export function valueNoise(x, y, seed, cell) {
    const x0 = Math.floor(x / cell);
    const y0 = Math.floor(y / cell);
    const tx = smooth(x / cell - x0);
    const ty = smooth(y / cell - y0);
    const v00 = hash2(x0, y0, seed);
    const v10 = hash2(x0 + 1, y0, seed);
    const v01 = hash2(x0, y0 + 1, seed);
    const v11 = hash2(x0 + 1, y0 + 1, seed);
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
}
/** `WorldGenerationOptions`'s own C# defaults — demo mode's world (no backend to ask). */
export const DEFAULT_GENERATION = {
    worldRadius: 4000,
    islandCellSize: 150,
    islandChance: 0.8,
    islandMaxReach: 305,
    islandMinGap: 24,
    islandMinWidth: 21,
    islandMaxWidth: 40,
    islandMinSegments: 5,
    islandMaxSegments: 9,
    islandMinElongation: 5,
    islandMaxElongation: 8,
    islandMinBend: 0.12,
    islandMaxBend: 0.35,
    islandCoastWarp: 9.5,
    islandCoastWarpScale: 42,
    islandCoastNoise: 1.0,
    islandCoastNoiseScale: 49,
    islandSmallShare: 0.3,
    islandLargeShare: 0.07,
    beachThreshold: 0.9,
    mountainThreshold: 0.4,
    mountainRockiness: 0.72,
    forestRockiness: 0.52,
};
/**
 * A scaled-down archipelago — the backend's `WorldGenerationOptions.Compact(seed, 300)`:
 * the same shape at test/dev scale (islands 5-40 hexes across on a 66-hex cell grid). Used
 * by the island lab's preset and by tests that need coast, sea and inland terrain inside a
 * window of a few dozen hexes (a production-size island is ~150 hexes across).
 */
export const COMPACT_GENERATION = {
    ...DEFAULT_GENERATION,
    worldRadius: 300,
    islandCellSize: 66,
    islandMaxReach: 103,
    islandMinGap: 8,
    islandMinWidth: 8,
    islandMaxWidth: 14,
    islandMinSegments: 3,
    islandMaxSegments: 5,
    islandMinElongation: 2,
    islandMaxElongation: 4,
    islandCoastWarp: 3,
    islandCoastWarpScale: 14,
    islandCoastNoise: 0.6,
    islandCoastNoiseScale: 16,
};
/**
 * The island-shape constants that are not admin knobs — mirrors the backend's
 * `IslandShapeConstants` exactly.
 */
export const ISLAND_SHAPE = {
    jitter: 0.55,
    taper: 0.5,
    widthMinScale: 0.6,
    widthMaxScale: 1.0,
    warp2: 3.8,
    warpScale2: 11.4,
    octave2: 0.7,
    octave3: 0.45,
    isletMax: 5,
    isletRadiusMin: 0.3,
    isletRadiusMax: 0.7,
    isletDistanceMin: 1.6,
    isletDistanceMax: 3.2,
    smallScale: 0.55,
    largeScale: 1.6,
};
/** How far, in half-widths, land can be from a spine point: 1 plus the largest noise contribution. */
function noiseReachFactor(noise) {
    return 1 + noise * 0.5 * (1 + ISLAND_SHAPE.octave2 + ISLAND_SHAPE.octave3);
}
/**
 * The farthest an island's land may be from its centre (warps not counted) before it is
 * shrunk to fit — mirrors the backend's `IslandShapeConstants.ReachBudget`.
 * `islandMaxReach` when set, else the legacy budget of one ring of cells.
 */
export function islandReachBudget(gen) {
    if (gen.islandMaxReach > 0)
        return gen.islandMaxReach;
    return (1.5 - ISLAND_SHAPE.jitter / 2) * gen.islandCellSize - (gen.islandCoastWarp + ISLAND_SHAPE.warp2);
}
/**
 * How many rings of cells around its own a hex scans for islands: the fewest that hold
 * every island whose land (reach plus both warps) can get to the hex — mirrors the
 * backend's `IslandShapeConstants.ScanSpan`. 1 (a 3x3 block) for legacy worlds.
 */
export function islandScanSpan(gen) {
    if (gen.islandMaxReach <= 0)
        return 1;
    const need = gen.islandMaxReach + (gen.islandCoastWarp + ISLAND_SHAPE.warp2);
    let span = 1;
    while ((span + 0.5 - ISLAND_SHAPE.jitter / 2) * gen.islandCellSize < need)
        span++;
    return span;
}
/**
 * How many rings of cells around its own an island checks for an outranking neighbour
 * closer than `islandMinGap`: the fewest beyond which no two islands can come that close
 * — mirrors the backend's `IslandShapeConstants.GapSpan`.
 */
export function islandGapSpan(gen) {
    const reach = 2 * islandReachBudget(gen) + gen.islandMinGap;
    let span = 1;
    while ((span + 1 - ISLAND_SHAPE.jitter) * gen.islandCellSize <= reach)
        span++;
    return span;
}
const NO_CANDIDATE = { shape: null, insideWorld: false };
const shapeCaches = new WeakMap();
function shapeParams(gen) {
    return [
        gen.worldRadius,
        gen.islandCellSize,
        gen.islandChance,
        gen.islandMaxReach,
        gen.islandMinGap,
        gen.islandMinWidth,
        gen.islandMaxWidth,
        gen.islandMinSegments,
        gen.islandMaxSegments,
        gen.islandMinElongation,
        gen.islandMaxElongation,
        gen.islandMinBend,
        gen.islandMaxBend,
        gen.islandCoastWarp,
        gen.islandCoastNoise,
        gen.islandSmallShare,
        gen.islandLargeShare,
    ];
}
function shapeCacheFor(gen) {
    const params = shapeParams(gen);
    let cache = shapeCaches.get(gen);
    if (cache) {
        let same = true;
        for (let i = 0; i < params.length; i++) {
            if (cache.params[i] !== params[i]) {
                same = false;
                break;
            }
        }
        if (same)
            return cache;
    }
    cache = { params, green: new Map(), wasted: new Map(), greenCandidates: new Map(), wastedCandidates: new Map(), greenNear: new Map(), wastedNear: new Map() };
    shapeCaches.set(gen, cache);
    return cache;
}
function cellKey(cellCol, cellRow) {
    return (cellCol + 1048576) * 2097152 + (cellRow + 1048576);
}
// Whether the cell rolls an island at all. The wasted grid additionally skips every
// cell that is a green island cell (world seed, full chance), so a wasted island's own
// cell grid never overlaps a green island's.
function cellPresent(cellCol, cellRow, worldSeed, wasted, gen) {
    const seed = wasted ? worldSeed + WASTED_SEED_OFFSET : worldSeed;
    const factor = gen.islandMaxReach > 0 ? WASTED_ISLAND_CHANCE_FACTOR : LEGACY_WASTED_ISLAND_CHANCE_FACTOR;
    const chance = wasted ? gen.islandChance * factor : gen.islandChance;
    if (hash2(cellCol, cellRow, seed) > chance)
        return false;
    return !wasted || hash2(cellCol, cellRow, worldSeed) > gen.islandChance;
}
function cellClass(cellCol, cellRow, seed, gen) {
    const h = hash2(cellCol, cellRow, seed + 301);
    return h < gen.islandSmallShare ? 'small' : h > 1 - gen.islandLargeShare ? 'large' : 'medium';
}
function cellsFor(bySeed, worldSeed) {
    let cells = bySeed.get(worldSeed);
    if (!cells) {
        cells = new Map();
        bySeed.set(worldSeed, cells);
    }
    return cells;
}
/**
 * The island (if any) seeded in grid cell `(cellCol, cellRow)` — mirrors the backend's
 * `TerrainSampler.IslandShapeAt`: `null` when the cell rolls no island, when a large
 * neighbour suppresses it, when it would come closer than `islandMinGap` to an
 * outranking neighbour, or when the island could cross the world radius.
 */
export function islandShapeAt(cellCol, cellRow, world, wasted = false) {
    const gen = world.generation;
    const cache = shapeCacheFor(gen);
    const cells = cellsFor(wasted ? cache.wasted : cache.green, world.seed);
    const key = cellKey(cellCol, cellRow);
    const hit = cells.get(key);
    if (hit !== undefined)
        return hit;
    const candidate = candidateAt(cellCol, cellRow, world, wasted, cache);
    let shape = candidate.insideWorld ? candidate.shape : null;
    if (shape && gen.islandMinGap > 0) {
        // Min-gap rule: dropped when an outranking neighbour's candidate comes too close. Compared
        // against candidates (not final shapes), so the rule needs no recursion and no order.
        const seed = wasted ? world.seed + WASTED_SEED_OFFSET : world.seed;
        const span = islandGapSpan(gen);
        for (let dc = -span; dc <= span && shape; dc++) {
            for (let dr = -span; dr <= span; dr++) {
                if (dc === 0 && dr === 0)
                    continue;
                const other = candidateAt(cellCol + dc, cellRow + dr, world, wasted, cache).shape;
                if (other && outranks(other, shape, seed) && islandsTooClose(shape, other, gen.islandMinGap)) {
                    shape = null;
                    break;
                }
            }
        }
        // A wasted island also keeps the min gap from every kept green island: green land always
        // outranks wasted land, so the wasted one is dropped. (Kept green shapes, not candidates: a
        // green island that is not generated leaves its sea free.)
        for (let dc = -span; wasted && dc <= span && shape; dc++) {
            for (let dr = -span; dr <= span; dr++) {
                const green = islandShapeAt(cellCol + dc, cellRow + dr, world, false);
                if (green && islandsTooClose(shape, green, gen.islandMinGap)) {
                    shape = null;
                    break;
                }
            }
        }
    }
    cells.set(key, shape);
    return shape;
}
function candidateAt(cellCol, cellRow, world, wasted, cache) {
    const cells = cellsFor(wasted ? cache.wastedCandidates : cache.greenCandidates, world.seed);
    const key = cellKey(cellCol, cellRow);
    const hit = cells.get(key);
    if (hit !== undefined)
        return hit;
    const seed = wasted ? world.seed + WASTED_SEED_OFFSET : world.seed;
    const candidate = buildCell(cellCol, cellRow, world.seed, seed, wasted, world.generation);
    cells.set(key, candidate);
    return candidate;
}
function classRank(c) {
    return c === 'large' ? 2 : c === 'medium' ? 1 : 0;
}
/** Whether `a` keeps its place over `b` under the min-gap rule: the larger class, then the higher roll. */
function outranks(a, b, seed) {
    const ra = classRank(a.sizeClass);
    const rb = classRank(b.sizeClass);
    if (ra !== rb)
        return ra > rb;
    return hash2(a.cellCol, a.cellRow, seed + 307) > hash2(b.cellCol, b.cellRow, seed + 307);
}
function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
}
function segmentDistance(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y) {
    const o1 = (a1x - a0x) * (b0y - a0y) - (a1y - a0y) * (b0x - a0x);
    const o2 = (a1x - a0x) * (b1y - a0y) - (a1y - a0y) * (b1x - a0x);
    const o3 = (b1x - b0x) * (a0y - b0y) - (b1y - b0y) * (a0x - b0x);
    const o4 = (b1x - b0x) * (a1y - b0y) - (b1y - b0y) * (a1x - b0x);
    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0)))
        return 0;
    return Math.min(Math.min(pointSegmentDistance(b0x, b0y, a0x, a0y, a1x, a1y), pointSegmentDistance(b1x, b1y, a0x, a0y, a1x, a1y)), Math.min(pointSegmentDistance(a0x, a0y, b0x, b0y, b1x, b1y), pointSegmentDistance(a1x, a1y, b0x, b0y, b1x, b1y)));
}
/**
 * An island's parts as capsules in absolute offset space, `[x0, y0, x1, y1, halfWidth]` five
 * numbers each: every spine segment (at the wider of its two vertex widths), then every islet.
 */
function islandParts(s) {
    const out = [];
    const n = s.sx.length;
    if (n === 1)
        out.push(s.cx + s.sx[0], s.cy + s.sy[0], s.cx + s.sx[0], s.cy + s.sy[0], s.w[0]);
    for (let k = 0; k < n - 1; k++) {
        out.push(s.cx + s.sx[k], s.cy + s.sy[k], s.cx + s.sx[k + 1], s.cy + s.sy[k + 1], Math.max(s.w[k], s.w[k + 1]));
    }
    for (let i = 0; i < s.ix.length; i++)
        out.push(s.cx + s.ix[i], s.cy + s.iy[i], s.cx + s.ix[i], s.cy + s.iy[i], s.ir[i]);
    return out;
}
/**
 * Whether two islands' nominal coasts (spine capsules at their half-widths, islets at their
 * radii; before the shoreline noise) come closer than `gap` hexes — mirrors the backend's
 * `TerrainSampler.IslandsTooClose`.
 */
export function islandsTooClose(a, b, gap) {
    const cx = a.cx - b.cx;
    const cy = a.cy - b.cy;
    const far = a.reach + b.reach + gap;
    if (cx * cx + cy * cy > far * far)
        return false;
    const pa = islandParts(a);
    const pb = islandParts(b);
    for (let i = 0; i < pa.length; i += 5) {
        for (let j = 0; j < pb.length; j += 5) {
            const d = segmentDistance(pa[i], pa[i + 1], pa[i + 2], pa[i + 3], pb[j], pb[j + 1], pb[j + 2], pb[j + 3]);
            if (d < pa[i + 4] + pb[j + 4] + gap)
                return true;
        }
    }
    return false;
}
function buildCell(cellCol, cellRow, worldSeed, seed, wasted, gen) {
    if (!cellPresent(cellCol, cellRow, worldSeed, wasted, gen))
        return NO_CANDIDATE;
    let cls = cellClass(cellCol, cellRow, seed, gen);
    // A large island clears its neighbours; of two neighbouring large ones the higher roll
    // wins. (`cls` is read as it stands after earlier neighbours may already have demoted it.)
    let suppressed = false;
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0)
                continue;
            const nc = cellCol + dc;
            const nr = cellRow + dr;
            if (!cellPresent(nc, nr, worldSeed, wasted, gen) || cellClass(nc, nr, seed, gen) !== 'large')
                continue;
            if (cls !== 'large')
                suppressed = true;
            else if (hash2(nc, nr, seed + 307) > hash2(cellCol, cellRow, seed + 307))
                cls = 'medium';
        }
    }
    return suppressed ? NO_CANDIDATE : buildShape(cellCol, cellRow, seed, gen, cls);
}
function buildShape(cc, cr, seed, gen, cls) {
    const K = ISLAND_SHAPE;
    const cs = gen.islandCellSize;
    const jit = cs * K.jitter;
    const cx = cc * cs + cs / 2 + (hash2(cc, cr, seed + 11) - 0.5) * jit;
    const cy = cr * cs + cs / 2 + (hash2(cc, cr, seed + 13) - 0.5) * jit;
    const scale = cls === 'small' ? K.smallScale : cls === 'large' ? K.largeScale : 1;
    const radius = scale * (gen.islandMinWidth + hash2(cc, cr, seed + 17) * (gen.islandMaxWidth - gen.islandMinWidth));
    const n = gen.islandMinSegments + Math.floor(hash2(cc, cr, seed + 19) * (gen.islandMaxSegments - gen.islandMinSegments + 1));
    const ax = hash2(cc, cr, seed + 23) - 0.5;
    const ay = hash2(cc, cr, seed + 47) - 0.5;
    const len = Math.sqrt(ax * ax + ay * ay);
    let ux = len < 1e-9 ? 1 : ax / len;
    let uy = len < 1e-9 ? 0 : ay / len;
    const hb = hash2(cc, cr, seed + 59);
    const t0 = (hb < 0.5 ? -1 : 1) * (gen.islandMinBend + (gen.islandMaxBend - gen.islandMinBend) * ((hb < 0.5 ? hb : hb - 0.5) * 2));
    const elong = gen.islandMinElongation + (gen.islandMaxElongation - gen.islandMinElongation) * hash2(cc, cr, seed + 61);
    const step = (radius * elong) / Math.max(1, n - 1);
    const px = new Array(n).fill(0);
    const py = new Array(n).fill(0);
    let lx = 0;
    let ly = 0;
    for (let k = 1; k < n; k++) {
        const t = t0 * (0.5 + hash2(cc, cr, seed + 400 + k));
        const c = (1 - t * t) / (1 + t * t);
        const s = (2 * t) / (1 + t * t);
        const nx = ux * c - uy * s;
        const ny = uy * c + ux * s;
        ux = nx;
        uy = ny;
        lx += ux * step;
        ly += uy * step;
        px[k] = lx;
        py[k] = ly;
    }
    let mx = 0;
    let my = 0;
    for (let k = 0; k < n; k++) {
        mx += px[k];
        my += py[k];
    }
    mx /= n;
    my /= n;
    for (let k = 0; k < n; k++) {
        px[k] -= mx;
        py[k] -= my;
    }
    const w = [];
    for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0 : Math.abs((2 * k) / (n - 1) - 1);
        w.push(radius * (1 - K.taper * f * f) * (K.widthMinScale + hash2(cc, cr, seed + 200 + k) * (K.widthMaxScale - K.widthMinScale)));
    }
    const ni = Math.floor(hash2(cc, cr, seed + 300) * (K.isletMax + 1));
    const ix = [];
    const iy = [];
    const ir = [];
    for (let i = 0; i < ni; i++) {
        const k = Math.floor(hash2(cc, cr, seed + 310 + i) * n);
        let ox = hash2(cc, cr, seed + 320 + i) - 0.5;
        let oy = hash2(cc, cr, seed + 330 + i) - 0.5;
        let ol = Math.sqrt(ox * ox + oy * oy);
        if (ol === 0 || Number.isNaN(ol))
            ol = 1;
        ox /= ol;
        oy /= ol;
        const dist = w[k] * (K.isletDistanceMin + (K.isletDistanceMax - K.isletDistanceMin) * hash2(cc, cr, seed + 340 + i));
        ix.push(px[k] + ox * dist);
        iy.push(py[k] + oy * dist);
        ir.push(w[k] * (K.isletRadiusMin + (K.isletRadiusMax - K.isletRadiusMin) * hash2(cc, cr, seed + 350 + i)));
    }
    // Reach clamp: the farthest land can get from the centre must fit the budget (and so the cell scan).
    const nm = noiseReachFactor(gen.islandCoastNoise);
    let reach = 0;
    for (let k = 0; k < n; k++)
        reach = Math.max(reach, Math.sqrt(px[k] * px[k] + py[k] * py[k]) + w[k] * nm);
    for (let i = 0; i < ni; i++)
        reach = Math.max(reach, Math.sqrt(ix[i] * ix[i] + iy[i] * iy[i]) + ir[i] * nm);
    const budget = islandReachBudget(gen);
    let factor = 1;
    if (reach > budget) {
        factor = budget / reach;
        for (let k = 0; k < n; k++) {
            px[k] *= factor;
            py[k] *= factor;
            w[k] *= factor;
        }
        for (let i = 0; i < ni; i++) {
            ix[i] *= factor;
            iy[i] *= factor;
            ir[i] *= factor;
        }
        reach = budget;
    }
    // World edge: the island is dropped if any of it could cross the world radius (it stays a
    // candidate, so it still keeps its neighbours at the min gap).
    const warpSum = gen.islandCoastWarp + K.warp2;
    const col = Math.floor(cx + 0.5);
    const row = Math.floor(cy + 0.5);
    const q = col;
    const r = row - (col - (col & 1)) / 2;
    const d = (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
    const insideWorld = d + 1.42 * (reach + warpSum) <= gen.worldRadius;
    // Tight box of every place land can be, for scanning (see the backend's IslandShape).
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = -Number.MAX_VALUE;
    let maxY = -Number.MAX_VALUE;
    for (let k = 0; k < n; k++) {
        const e = w[k] * nm;
        minX = Math.min(minX, cx + px[k] - e);
        maxX = Math.max(maxX, cx + px[k] + e);
        minY = Math.min(minY, cy + py[k] - e);
        maxY = Math.max(maxY, cy + py[k] + e);
    }
    for (let i = 0; i < ni; i++) {
        const e = ir[i] * nm;
        minX = Math.min(minX, cx + ix[i] - e);
        maxX = Math.max(maxX, cx + ix[i] + e);
        minY = Math.min(minY, cy + iy[i] - e);
        maxY = Math.max(maxY, cy + iy[i] + e);
    }
    const shape = {
        cellCol: cc,
        cellRow: cr,
        cx,
        cy,
        sx: px,
        sy: py,
        w,
        ix,
        iy,
        ir,
        reach: reach + warpSum,
        sizeClass: cls,
        clamp: factor,
        minCol: Math.floor(minX - warpSum),
        maxCol: Math.ceil(maxX + warpSum),
        minRow: Math.floor(minY - warpSum),
        maxRow: Math.ceil(maxY + warpSum),
    };
    return { shape, insideWorld };
}
/**
 * Every island of the world in cell order (column, then row): the cells that hold an
 * island whose whole footprint is inside the world radius — mirrors the backend's
 * `TerrainSampler.EnumerateIslandShapes`.
 */
export function enumerateIslandShapes(world, wasted = false) {
    const gen = world.generation;
    const span = Math.floor(gen.worldRadius / gen.islandCellSize) + 2;
    const shapes = [];
    for (let cellCol = -span; cellCol <= span; cellCol++) {
        for (let cellRow = -span; cellRow <= span; cellRow++) {
            const shape = islandShapeAt(cellCol, cellRow, world, wasted);
            if (shape)
                shapes.push(shape);
        }
    }
    return shapes;
}
function shapeDistance(is, qx, qy) {
    const { sx, sy, w } = is;
    let d = Infinity;
    if (sx.length === 1)
        d = Math.sqrt(qx * qx + qy * qy) / w[0];
    for (let k = 0; k < sx.length - 1; k++) {
        const x0 = sx[k];
        const y0 = sy[k];
        const dx = sx[k + 1] - x0;
        const dy = sy[k + 1] - y0;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((qx - x0) * dx + (qy - y0) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - (x0 + t * dx);
        const ey = qy - (y0 + t * dy);
        const v = Math.sqrt(ex * ex + ey * ey) / (w[k] + (w[k + 1] - w[k]) * t);
        if (v < d)
            d = v;
    }
    for (let i = 0; i < is.ix.length; i++) {
        const ex = qx - is.ix[i];
        const ey = qy - is.iy[i];
        const v = Math.sqrt(ex * ex + ey * ey) / is.ir[i];
        if (v < d)
            d = v;
    }
    return d;
}
/**
 * Depth of offset-space hex `(col, row)` into the nearest island of the green (or
 * wasted) grid, `null` at sea — mirrors the backend's `TerrainSampler.DepthAt`.
 * Distance to each island in reach is the minimum over its spine segments of
 * distance / interpolated half-width (islets: distance / radius), plus three
 * octaves of shoreline noise.
 */
/**
 * The islands a hex in cell `(baseCol, baseRow)` can be land of: those of the cell's scan block
 * (`islandScanSpan` rings) whose land box overlaps the cell, in scan order (column, then row).
 * An island whose box misses the hex cannot make it land, so measuring only these gives the
 * same answer as the full scan — mirrors the backend's `TerrainSampler.IslandsNear`.
 */
function islandsNear(baseCol, baseRow, world, wasted) {
    const gen = world.generation;
    const cache = shapeCacheFor(gen);
    const cells = cellsFor(wasted ? cache.wastedNear : cache.greenNear, world.seed);
    const key = cellKey(baseCol, baseRow);
    const hit = cells.get(key);
    if (hit !== undefined)
        return hit;
    const cs = gen.islandCellSize;
    const minCol = baseCol * cs;
    const maxCol = minCol + cs - 1;
    const minRow = baseRow * cs;
    const maxRow = minRow + cs - 1;
    const span = islandScanSpan(gen);
    const near = [];
    for (let dc = -span; dc <= span; dc++) {
        for (let dr = -span; dr <= span; dr++) {
            const is = islandShapeAt(baseCol + dc, baseRow + dr, world, wasted);
            if (is && is.maxCol >= minCol && is.minCol <= maxCol && is.maxRow >= minRow && is.minRow <= maxRow)
                near.push(is);
        }
    }
    cells.set(key, near);
    return near;
}
function closestIsland(col, row, world, wasted) {
    const gen = world.generation;
    const seed = wasted ? world.seed + WASTED_SEED_OFFSET : world.seed;
    const cs = gen.islandCellSize;
    const near = islandsNear(Math.floor(col / cs), Math.floor(row / cs), world, wasted);
    if (near.length === 0)
        return null;
    // Two-octave domain warp, applied once per hex before any distance is measured, so
    // coastlines wobble (fjords, bays) instead of tracing arcs.
    let px = col;
    let py = row;
    px +=
        (valueNoise(col, row, seed + 53, gen.islandCoastWarpScale) - 0.5) * 2 * gen.islandCoastWarp +
            (valueNoise(col, row, seed + 83, ISLAND_SHAPE.warpScale2) - 0.5) * 2 * ISLAND_SHAPE.warp2;
    py +=
        (valueNoise(col, row, seed + 71, gen.islandCoastWarpScale) - 0.5) * 2 * gen.islandCoastWarp +
            (valueNoise(col, row, seed + 89, ISLAND_SHAPE.warpScale2) - 0.5) * 2 * ISLAND_SHAPE.warp2;
    let best = null;
    for (const is of near) {
        const qx = px - is.cx;
        const qy = py - is.cy;
        if (qx * qx + qy * qy > is.reach * is.reach)
            continue;
        let d = shapeDistance(is, qx, qy);
        const n1 = valueNoise(col, row, seed + 97, gen.islandCoastNoiseScale) - 0.5;
        const n2 = valueNoise(col, row, seed + 101, gen.islandCoastNoiseScale / 2.5) - 0.5;
        const n3 = valueNoise(col, row, seed + 103, gen.islandCoastNoiseScale / 6.25) - 0.5;
        d += gen.islandCoastNoise * (n1 + ISLAND_SHAPE.octave2 * n2 + ISLAND_SHAPE.octave3 * n3);
        if (d <= 1 && (!best || d < best.t))
            best = { t: d, is, qx, qy };
    }
    return best;
}
/**
 * Extra seed offset added on top of the world seed for every wasted-island
 * hash — mirrors the backend's `TerrainSampler.WastedSeedOffset` exactly.
 */
export const WASTED_SEED_OFFSET = 1_000_003;
/**
 * Fraction of `islandChance` a wasted island cell rolls against in a world on
 * the density rules (`islandMaxReach` above 0) — mirrors the backend's
 * `TerrainSampler.WastedIslandChanceFactor` exactly. The min-gap rule drops every
 * wasted island within the gap of a green one, so the roll is higher than the
 * legacy factor to keep about as many wasted islands as before.
 */
export const WASTED_ISLAND_CHANCE_FACTOR = 0.5;
/**
 * The wasted-island factor of a legacy world (`islandMaxReach` 0, as the
 * migration gives every world created before the density rules), kept so its
 * wasted terrain stays byte-identical — mirrors `TerrainSampler.LegacyWastedIslandChanceFactor`.
 */
export const LEGACY_WASTED_ISLAND_CHANCE_FACTOR = 0.1;
/**
 * Wasted islands are extra islands generated from the same seed on a
 * separate, rarer cell grid, hidden as sea until the world's endboss is
 * triggered — mirrors the backend's `TerrainSampler.WastedTerrainAt`
 * exactly, including never touching (or growing onto) a green island's
 * footprint. Unlike `terrainAt`, this is not what any existing renderer
 * queries by default: a caller that knows the wasted reveal has fired
 * switches to this instead (see `WorldModel.setWastedRevealed`).
 */
export function wastedTerrainAt(q, r, world) {
    const { col, row } = axialToOddQ({ q, r });
    const gen = world.generation;
    // Never on a green island: this guarantees wasted land can never fuse
    // with (or hide inside) a green island's own footprint.
    if (closestIsland(col, row, world, false))
        return 'sea';
    const island = closestIsland(col, row, world, true);
    if (!island)
        return 'sea';
    // Nor may it touch green land through any of its six neighbours — this is
    // what stops a wasted island from growing a land bridge onto a green
    // island's coast.
    if (neighbors({ q, r }).some((n) => isLand(n.q, n.r, world)))
        return 'sea';
    if (island.t > gen.beachThreshold && seesSea(q, r, world, true))
        return 'sand';
    const rockiness = valueNoise(q, r, world.seed + 2, 2.5);
    if (island.t < gen.mountainThreshold && rockiness > gen.mountainRockiness)
        return 'mountain';
    return rockiness > gen.forestRockiness ? 'forest' : 'grass';
}
/**
 * How far into the nearest green island `(q, r)` sits, as a fraction of that
 * island's radius: 0 at the centre, 1 at the shoreline, `null` at sea —
 * mirrors the backend's `TerrainSampler.IslandDepthAt` exactly. Exported for
 * `riverGenerator.ts`, which needs this (not just `terrainAt`'s coarser
 * land/sea answer) to score a river step's uphill/downhill candidates the
 * same way the backend's `RiverGenerator.BuildCandidates` does.
 */
export function islandDepthAt(q, r, world) {
    const { col, row } = axialToOddQ({ q, r });
    const island = closestIsland(col, row, world, false);
    return island ? island.t : null;
}
/**
 * `islandDepthAt`'s wasted-island counterpart — mirrors
 * `TerrainSampler.WastedDepthAt` exactly (same seed offset, same
 * `excludeGreenCells` gate against a wasted island's own cell grid
 * overlapping a green island's own).
 */
export function wastedDepthAt(q, r, world) {
    const { col, row } = axialToOddQ({ q, r });
    const island = closestIsland(col, row, world, true);
    return island ? island.t : null;
}
// Deterministic Norse-flavoured island names, mirroring the backend's
// `Bjarnoy.Domain.World.IslandNames` (the stem/ending lists are copy-kept in
// sync by eye, not shared code — demo mode has no access to backend code and
// only ever needs *a* name, not the exact same one a live world would pick).
const NAME_STEMS = [
    'Bjorn', 'Fjord', 'Grim', 'Hav', 'Isa', 'Jarl', 'Kettil', 'Lyng',
    'Mork', 'Nord', 'Orm', 'Rav', 'Sig', 'Thor', 'Ulf', 'Vald',
    'Ymir', 'Aske', 'Brand', 'Dyr', 'Eik', 'Frost', 'Gard', 'Hjalm',
];
const NAME_ENDINGS = [
    'ey', 'holm', 'vik', 'nes', 'fjell', 'sund', 'strand', 'berg',
    'havn', 'skar', 'oy', 'dal',
];
function islandNameFor(cellCol, cellRow, seed) {
    const stem = NAME_STEMS[Math.floor(hash2(cellCol, cellRow, seed + 101) * NAME_STEMS.length) % NAME_STEMS.length];
    const ending = NAME_ENDINGS[Math.floor(hash2(cellCol, cellRow, seed + 103) * NAME_ENDINGS.length) % NAME_ENDINGS.length];
    return stem + ending;
}
/**
 * Enumerates the islands the demo generator places within `radius` hexes of
 * the origin, with a dummy Norse-flavoured name for each — demo mode has no
 * backend `GET /worlds/{id}/islands` to ask (unlike a live world's own init
 * in `stores/world.ts`, which calls that and feeds the response straight
 * into `WorldModel.setIslands`), so without this the world map's island-name
 * labels (`HexMapRenderer`'s `worldModel.listIslands()` loop) simply have
 * nothing to draw in demo mode. Uses the island cells' own jittered centres
 * (`enumerateIslandShapes`) rather than inventing a second scheme, so a demo
 * island's label always sits over the same island `terrainAt`/`isLand`
 * actually generate there.
 */
export function enumerateIslands(world, radius) {
    const islands = [];
    for (const shape of enumerateIslandShapes(world)) {
        let center = oddQToAxial({ col: Math.floor(shape.cx + 0.5), row: Math.floor(shape.cy + 0.5) });
        if (hexDistance({ q: 0, r: 0 }, center) > radius)
            continue;
        // The middle of a crescent or a C is open water: like the backend's `CentreOf`, put the
        // label on the land hex nearest to it (an island cell whose land eroded away entirely,
        // or was only a speck, gets no label).
        if (terrainAt(center.q, center.r, world) === 'sea') {
            const land = nearestLandWithin(center, Math.ceil(shape.reach), world);
            if (!land)
                continue;
            center = land;
        }
        islands.push({
            id: `demo-${shape.cellCol}-${shape.cellRow}`,
            name: islandNameFor(shape.cellCol, shape.cellRow, world.seed),
            q: center.q,
            r: center.r,
        });
    }
    return islands;
}
function nearestLandWithin(from, maxRadius, world) {
    for (let ring = 1; ring <= maxRadius; ring++) {
        for (const c of hexRing(from, ring))
            if (terrainAt(c.q, c.r, world) !== 'sea')
                return c;
    }
    return null;
}
/**
 * How close (in hex steps) open sea must be for a hex past `beachThreshold` to be sand —
 * mirrors the backend's `TerrainSampler.BeachSeaRadius`. The depth alone is not enough: the
 * domain warp and the shoreline noise make interior "saddles" where the depth climbs close to 1
 * without the coast opening there, which put beach bands deep inland. 2 keeps the usual 1-2 hex
 * wide beach of a real coast whole (1 halves it).
 */
export const BEACH_SEA_RADIUS = 2;
// Axial offsets of the hexes within BEACH_SEA_RADIUS (the centre left out), nearest ring first
// so a real beach finds its sea after a step or two.
const BEACH_SEA_OFFSETS = [];
for (let k = 1; k <= BEACH_SEA_RADIUS; k++)
    BEACH_SEA_OFFSETS.push(...hexRing({ q: 0, r: 0 }, k));
/**
 * Whether the island shape leaves sea within `BEACH_SEA_RADIUS` of `(q, r)` — mirrors
 * `TerrainSampler.SeesSea`. Only the shape's own land test (`closestIsland`) is asked, never
 * `terrainAt`, so this cannot recurse into the sand rule. A wasted hex asks the wasted shape.
 */
function seesSea(q, r, world, wasted) {
    for (const o of BEACH_SEA_OFFSETS) {
        const { col, row } = axialToOddQ({ q: q + o.q, r: r + o.r });
        if (!closestIsland(col, row, world, wasted))
            return true;
    }
    return false;
}
export function terrainAt(q, r, world) {
    const { col, row } = axialToOddQ({ q, r });
    const island = closestIsland(col, row, world, false);
    if (!island)
        return 'sea';
    if (island.t > world.generation.beachThreshold && seesSea(q, r, world, false))
        return 'sand';
    const sp = island.t > MOUNTAIN_MAX_DEPTH ? null : spineAt(island.is, island.qx, island.qy, world.seed);
    if (chainMountainAt(q, r, island.t, world.seed, sp))
        return 'mountain';
    return groveForestAt(q, r, world.seed) ? 'forest' : 'grass';
}
// ---- Green-island mountains and forests -------------------------------------------------
// Mountains are chains along an island's spine and forests are round groves; wasted islands keep
// the plain noise rule (`wastedTerrainAt`). Mirrors `TerrainSampler` (C#) bit for bit: no
// trigonometry anywhere (JS and .NET trig are not guaranteed identical), only + - * / sqrt.
//
// Seed salts of this block: the odd numbers 601, 603, ... (a range no other noise field uses).
// A consumer that needs several salts of its own reserves the numbers above its own: the groves'
// jittered grid uses GROVE_SALT, +1 and +2; the forest noise uses FOREST_NOISE_SALT and +1..+4.
/** Roll of an island's spine id: `hash2(cellCol, cellRow, seed + SPINE_ID_SALT)`. */
export const SPINE_ID_SALT = 601;
/** Sideways drift of a crest along the spine. */
export const CREST_OFFSET_SALT = 603;
/** Coarse width profile of a crest (passes and massifs). */
export const CREST_PROFILE_SALT = 605;
/** Fine width profile of a crest. */
export const CREST_PROFILE_FINE_SALT = 607;
/** Coarse rim roughness of the mountains. */
export const RIM_NOISE_SALT = 609;
/** Fine rim roughness of the mountains. */
export const RIM_NOISE_FINE_SALT = 611;
/** Whether a spur arm is rooted in a slot (also mixed with the island id). */
export const ARM_ROOT_SALT = 613;
/** Where along the crest an arm is rooted. */
export const ARM_POSITION_SALT = 615;
/** Which side of the crest an arm leaves on. */
export const ARM_SIDE_SALT = 617;
/** The angle of an arm against the crest normal. */
export const ARM_TILT_SALT = 619;
/** The length of an arm. */
export const ARM_LENGTH_SALT = 621;
/** Rim roughness of the groves. */
export const GROVE_RIM_SALT = 623;
/** Jittered grid of the groves (uses this salt, +1 and +2). */
export const GROVE_SALT = 625;
/** Value noise that clusters the groves (uses this salt and +1..+4 inside `warpedNoise`). */
export const FOREST_NOISE_SALT = 629;
/** Mountains exist only up to this depth into the island (1 is the shoreline). */
export const MOUNTAIN_MAX_DEPTH = 0.8;
/** An island whose half-width is above this gets a second, parallel crest. */
export const SECOND_CREST_MIN_WIDTH = 26;
/** Crest width stops growing with the island's half-width at this value. */
export const CREST_FULL_WIDTH = 22;
/** Spacing (hexes) of the slots where a spur arm can be rooted along a crest. */
export const ARM_SPACING = 9;
/** Share of arm slots that stay empty. */
export const ARM_SLOT_EMPTY_BELOW = 0.25;
/** Cell size (hexes) of the jittered grid the groves sit on. */
export const GROVE_CELL = 9.5;
/** Groves exist only for grid cells whose roll is at least this. */
export const GROVE_MIN_ROLL = 0.32;
/** Forest where `GROVE_WEIGHT * grove + FOREST_NOISE_WEIGHT * noise + GROVE_RIM_WEIGHT * rim` beats this. */
export const FOREST_THRESHOLD = 0.43;
export const GROVE_WEIGHT = 0.65;
export const FOREST_NOISE_WEIGHT = 0.35;
export const GROVE_RIM_WEIGHT = 0.12;
/** Wavelength (hexes) and domain warp of the noise that clusters the groves. */
export const FOREST_NOISE_CELL = 9;
export const FOREST_NOISE_WARP = 2.5;
// cos(0.6) and sin(0.6), written out so no platform has to compute them.
const COS_06 = 0.8253356149096783;
const SIN_06 = 0.5646424733950354;
const SQRT3 = Math.sqrt(3);
/**
 * The spine coordinates of the point `(qx, qy)` (relative to the island's centre, coast-warped) on
 * `is`: the nearest spine segment by distance / half-width. `null` for an island with fewer than
 * two spine points. Islets are not part of the spine. Mirrors `TerrainSampler.SpineAt`.
 */
export function spineAt(is, qx, qy, seed) {
    const n = is.sx.length;
    if (n < 2)
        return null;
    let len = 0;
    for (let k = 0; k < n - 1; k++) {
        const ex = is.sx[k + 1] - is.sx[k];
        const ey = is.sy[k + 1] - is.sy[k];
        len += Math.sqrt(ex * ex + ey * ey);
    }
    let acc = 0;
    let bestV = Infinity;
    let bs = 0;
    let bd = 0;
    let bw = 0;
    for (let k = 0; k < n - 1; k++) {
        const x0 = is.sx[k];
        const y0 = is.sy[k];
        const dx = is.sx[k + 1] - x0;
        const dy = is.sy[k + 1] - y0;
        const l2 = dx * dx + dy * dy;
        const l = Math.sqrt(l2);
        let t = l2 > 0 ? ((qx - x0) * dx + (qy - y0) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - (x0 + t * dx);
        const ey = qy - (y0 + t * dy);
        const w = is.w[k] + (is.w[k + 1] - is.w[k]) * t;
        const dist = Math.sqrt(ex * ex + ey * ey);
        const v = dist / w;
        if (v < bestV) {
            bestV = v;
            bs = acc + t * l;
            bd = (dx * ey - dy * ex >= 0 ? 1 : -1) * dist;
            bw = w;
        }
        acc += l;
    }
    return { s: bs, d: bd, w: bw, len, id: hash2(is.cellCol, is.cellRow, seed + SPINE_ID_SALT) };
}
function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
/**
 * Value noise sampled in cartesian space (hex centres, no axial shear) with a two-axis domain warp
 * and two lattices rotated against each other, so the blobs are round and the square lattice hides.
 * Uses `seed + 1 .. seed + 4`.
 */
function warpedNoise(q, r, seed, cell, warp) {
    const x = 1.5 * q;
    const y = SQRT3 * (r + q / 2);
    const wx = x + (valueNoise(x, y, seed + 1, cell * 1.7) - 0.5) * 2 * warp;
    const wy = y + (valueNoise(x, y, seed + 2, cell * 1.7) - 0.5) * 2 * warp;
    const a = valueNoise(wx, wy, seed + 3, cell);
    const b = valueNoise(wx * COS_06 - wy * SIN_06, wx * SIN_06 + wy * COS_06, seed + 4, cell);
    return (a + b) / 2;
}
/** One crest of a chain at arc length `sAt`: sideways offset from the spine and half-width (0 at a pass). */
function crestAt(sp, seed, crest, offFrac, passBelow, maxHalf, sAt) {
    const y = sp.id * 1000 + crest;
    const off = (offFrac + (valueNoise(sAt, y, seed + CREST_OFFSET_SALT, 45) - 0.5) * 0.7) * sp.w;
    const prof = 0.7 * valueNoise(sAt, y, seed + CREST_PROFILE_SALT, 13) + 0.3 * valueNoise(sAt, y, seed + CREST_PROFILE_FINE_SALT, 5);
    const k = (prof - passBelow) / (1 - passBelow);
    const half = k <= 0 ? 0 : 1.3 + maxHalf * Math.sqrt(k);
    const endFade = smoothstep(0, 0.1, Math.min(sAt, sp.len - sAt) / Math.max(1, sp.len));
    const scale = Math.min(1, sp.w / CREST_FULL_WIDTH);
    return { off, half: half * endFade * scale };
}
/**
 * Whether green-island hex `(q, r)` at depth `t` is mountain: chains along the island's spine
 * (a second parallel chain on wide islands) with passes, a rough rim, and tapered spur arms off the
 * massifs. Mirrors `TerrainSampler.ChainMountainAt`.
 */
export function chainMountainAt(q, r, t, seed, sp) {
    if (!sp || t > MOUNTAIN_MAX_DEPTH)
        return false;
    const x = 1.5 * q;
    const y = SQRT3 * (r + q / 2);
    const fine = 0.8 * (valueNoise(x, y, seed + RIM_NOISE_SALT, 3.5) - 0.5) + 0.2 * (valueNoise(x, y, seed + RIM_NOISE_FINE_SALT, 2.2) - 0.5);
    const crests = [[0, 0, 0.36, 6.5]];
    if (sp.w > SECOND_CREST_MIN_WIDTH)
        crests.push([1, sp.id < 0.5 ? 0.55 : -0.55, 0.5, 4.5]);
    // every arm roll is keyed on the island too, so islands don't share their arm layout
    const idRoll = Math.floor(sp.id * 1e5);
    for (const [crest, offFrac, pass, maxHalf] of crests) {
        const c = crestAt(sp, seed, crest, offFrac, pass, maxHalf, sp.s);
        if (Math.abs(sp.d - c.off) < c.half * (1 + 0.8 * fine))
            return true;
        // spur arms: rooted every ~ARM_SPACING hexes along the crest at a massif, tapering away from it at an angle
        const armRow = crest + 2 * idRoll;
        const k0 = Math.floor(sp.s / ARM_SPACING);
        for (let kk = k0 - 2; kk <= k0 + 2; kk++) {
            if (hash2(kk, armRow, seed + ARM_ROOT_SALT) < ARM_SLOT_EMPTY_BELOW)
                continue;
            const s0 = (kk + 0.2 + 0.6 * hash2(kk, armRow, seed + ARM_POSITION_SALT)) * ARM_SPACING;
            const root = crestAt(sp, seed, crest, offFrac, pass, maxHalf, s0);
            if (root.half < 2.5)
                continue; // arms only off a massif, never off a pass
            const side = hash2(kk, armRow, seed + ARM_SIDE_SALT) < 0.5 ? -1 : 1;
            // angle from the crest normal (up to about 0.8 rad) as a rational rotation: sin/cos of 2*atan(u)
            const u = (hash2(kk, armRow, seed + ARM_TILT_SALT) - 0.5) * 0.85;
            const sinT = (2 * u) / (1 + u * u);
            const cosT = (1 - u * u) / (1 + u * u);
            const armLen = 4 + 8 * hash2(kk, armRow, seed + ARM_LENGTH_SALT);
            const ax = s0;
            const ay = root.off + side * root.half * 0.6;
            const bx = ax + sinT * (armLen + root.half * 0.4);
            const by = ay + side * cosT * (armLen + root.half * 0.4);
            const dx = bx - ax;
            const dy = by - ay;
            const l2 = dx * dx + dy * dy;
            let v = ((sp.s - ax) * dx + (sp.d - ay) * dy) / l2;
            v = v < 0 ? 0 : v > 1 ? 1 : v;
            const ex = sp.s - (ax + v * dx);
            const ey = sp.d - (ay + v * dy);
            const dist = Math.sqrt(ex * ex + ey * ey);
            const w = 0.55 * root.half * (1 - v) + 0.7 * v;
            if (dist < w * (1 + 0.8 * fine))
                return true;
        }
    }
    return false;
}
/**
 * Whether a green-island hex that is not mountain is forest: round groves on a jittered grid,
 * blended with a warped noise so woods cluster, with a rough rim. Mirrors `TerrainSampler.GroveForestAt`.
 */
export function groveForestAt(q, r, seed) {
    const x = 1.5 * q;
    const y = SQRT3 * (r + q / 2);
    const fine = valueNoise(x, y, seed + GROVE_RIM_SALT, 3) - 0.5;
    const cx = Math.floor(x / GROVE_CELL);
    const cy = Math.floor(y / GROVE_CELL);
    let g = 0;
    for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) {
            const gx = cx + i;
            const gy = cy + j;
            const h = hash2(gx, gy, seed + GROVE_SALT + 2);
            if (h < GROVE_MIN_ROLL)
                continue;
            const fx = (gx + 0.1 + 0.8 * hash2(gx, gy, seed + GROVE_SALT)) * GROVE_CELL;
            const fy = (gy + 0.1 + 0.8 * hash2(gx, gy, seed + GROVE_SALT + 1)) * GROVE_CELL;
            const ex = x - fx;
            const ey = y - fy;
            const rad = 1.8 + 5.2 * h * h;
            g = Math.max(g, 1 - Math.sqrt(ex * ex + ey * ey) / (rad * 1.6));
        }
    const n = warpedNoise(q, r, seed + FOREST_NOISE_SALT, FOREST_NOISE_CELL, FOREST_NOISE_WARP);
    return GROVE_WEIGHT * g + FOREST_NOISE_WEIGHT * n + GROVE_RIM_WEIGHT * fine > FOREST_THRESHOLD;
}
function isLand(q, r, world) {
    return terrainAt(q, r, world) !== 'sea';
}
/** Sea that borders land — the ring a coastal-water sprite belongs on. */
export function isCoastalWater(q, r, world) {
    if (terrainAt(q, r, world) !== 'sea')
        return false;
    return neighbors({ q, r }).some((n) => isLand(n.q, n.r, world));
}
/**
 * The direction a coastal-water hex's land neighbours sit in: each land
 * neighbour contributes a unit vector at its direction's angle (60° apart,
 * matching `neighbors()`'s direction order), and the summed vector is
 * snapped to the nearest of the six `TileOrientation`s.
 */
function coastalOrientation(q, r, world) {
    const ns = neighbors({ q, r });
    let sumX = 0;
    let sumY = 0;
    let firstLandIndex = -1;
    ns.forEach((n, i) => {
        if (!isLand(n.q, n.r, world))
            return;
        if (firstLandIndex < 0)
            firstLandIndex = i;
        const angle = i * (Math.PI / 3);
        sumX += Math.cos(angle);
        sumY += Math.sin(angle);
    });
    // Opposite land neighbours (e.g. a one-hex-wide strait) can cancel the
    // vector to (near) zero — a small epsilon rather than an exact `=== 0`
    // check, because two land neighbours 180 degrees apart don't reliably sum
    // their sin/cos terms to bit-exact zero (this is where the .NET and JS
    // Math libraries' cos/sin/atan2 diverge at the ULP level, and atan2 near
    // the origin is extremely sensitive to that — the backend mirror uses the
    // same epsilon so both land on the same orientation for these hexes).
    // Falling back to the first land direction found keeps the pick
    // deterministic instead of an arbitrary default.
    const ZERO_EPSILON = 1e-9;
    if (Math.abs(sumX) < ZERO_EPSILON && Math.abs(sumY) < ZERO_EPSILON)
        return TILE_ORIENTATIONS[firstLandIndex];
    let angle = Math.atan2(sumY, sumX);
    if (angle < 0)
        angle += 2 * Math.PI;
    const index = Math.round(angle / (Math.PI / 3)) % 6;
    return TILE_ORIENTATIONS[index];
}
// `neighbors()`'s own direction list, used directly rather than through it so
// the per-tile neighbour walk allocates neither the array nor the six coords.
const NEIGHBOR_DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];
// The unit vector at each neighbour direction's angle (60 degrees apart, in
// NEIGHBOR_DIRS order), hoisted out of `coastalOrientationFrom`'s inner loop.
// Exactly the expressions `coastalOrientation` evaluates inline, so the sums
// they feed are bit-identical.
const NEIGHBOR_COS = [0, 1, 2, 3, 4, 5].map((i) => Math.cos(i * (Math.PI / 3)));
const NEIGHBOR_SIN = [0, 1, 2, 3, 4, 5].map((i) => Math.sin(i * (Math.PI / 3)));
/** Seed-stable cosmetic rotation for tiles that don't face anything in particular. */
export function defaultOrientation(q, r, world) {
    const h = hash2(q, r, world.seed + 29);
    const index = Math.min(5, Math.floor(h * 6));
    return TILE_ORIENTATIONS[index];
}
/**
 * Which of the six art-pack rotations a hex renders with. Coastal water
 * faces the land it borders; everything else gets a cosmetic, seed-stable
 * rotation so the map doesn't read as one repeated tile stamped everywhere.
 */
export function orientationAt(q, r, world) {
    return isCoastalWater(q, r, world) ? coastalOrientation(q, r, world) : defaultOrientation(q, r, world);
}
/**
 * Per-terrain variant count the tile art pack actually has, everything else
 * falling back to 1. Grass has a plain top image plus `variant000`-
 * `variant002` (4); forest has a plain image plus `variant000`-`variant001`
 * (3); mountain has four distinct shapes — cone, table, saddleback, corrie
 * (mirrors the backend's `MountainShape`) — each its own composited (not
 * base/top split) render, so this index doubles as that shape's own numeric
 * value.
 */
const VARIANT_COUNTS = {
    grass: 4,
    forest: 4,
    mountain: 4,
    // Bog: the plain moss plus variant001-008; lake: the plain water plus variant001-003 (islet, moss mat, reed
    // island — the fish weir and the two boats are placed by the buildings that use them, never rolled). Mirrors
    // `TerrainSampler.VariantCounts`.
    bog: 9,
    lake: 4,
};
/**
 * Coastal water (`coastalwatertile_*`) has its own plain image plus
 * `variant000`-`variant001` (3) — a different art family from open
 * `watertile_*` sea, which has no variants at all, so this can't live in
 * `VARIANT_COUNTS` (keyed by `Terrain`, not by coastal-ness). Unlike the
 * other variant families, its picks aren't uniform: the plain (no-suffix)
 * image should dominate the coastline, with the two numbered variants only
 * an occasional accent, so each entry here is a weight rather than an
 * equal-odds slot — see `weightedIndex`.
 */
const COASTAL_WATER_VARIANT_WEIGHTS = [0.8, 0.1, 0.1];
/**
 * Weights of the living mountain's four shapes, by `MountainShape` index: cone, table, saddleback, corrie. The flat-topped table is
 * a rare accent (owner decision); the other three share the rest. Mirrors `TerrainSampler.MountainShapeWeights`.
 */
export const MOUNTAIN_SHAPE_WEIGHTS = [0.37, 0.03, 0.3, 0.3];
/**
 * Top-variant weights for a wasted island's land, per green terrain it stands
 * in for — its own art set, so it can't borrow `VARIANT_COUNTS` (grass's 4
 * would never reach wasteland's two lava variants). Wasteland is plain,
 * rocks, spikes, rune crack, lava cracks, lava pool: the rune crack is the
 * rare accent and lava shows up regularly. Dead forest and black sand have
 * a plain frame and one variant each.
 */
const WASTED_VARIANT_WEIGHTS = {
    grass: [0.3, 0.2, 0.2, 0.06, 0.14, 0.1],
    forest: [0.5, 0.5],
    sand: [0.6, 0.4],
};
/**
 * Top-variant weights for a living forest: plain (an open clearing), variant000 (the full forest),
 * variant001 (fairy-ring glade) and variant002 (forest tarn). The full forest dominates; the other three
 * are rare accents. Mirrors `TerrainSampler.ForestVariantWeights`.
 */
export const FOREST_VARIANT_WEIGHTS = [0.04, 0.84, 0.06, 0.06];
/**
 * Top-variant weights for a living sand tile: index 0 is the plain sand, index N is `variant(N-1)` — 1 dunes, 2 driftwood,
 * 3 boulders, 4 wreck, 5 whale bones, 6 upturned boat and cairn, 7 sand castle, 8 driftwood pile. The plain look is the
 * common one, the wreck, whale bones and sand castle are rare accents. A variant whose art is not packed yet falls back
 * to the plain frame (textures.ts `pickIndexedEntry`). Mirrors `TerrainSampler.SandVariantWeights`.
 */
export const SAND_VARIANT_WEIGHTS = [0.62, 0.12, 0.08, 0.08, 0.01, 0.01, 0.02, 0.01, 0.05];
/** Wavelength (hexes) of the taiga/birch biome noise — mirrors `TerrainSampler.ForestBiomeScale`. */
export const FOREST_BIOME_SCALE = 14;
/** Seed offset of the biome noise (`kind = n >= 0.5 ? taiga : birch`). */
export const FOREST_BIOME_SALT = 137;
/** Seed offset of the per-hex roll that turns a forest hex into mixed wood. */
export const FOREST_MIXED_SALT = 139;
/** Chance of mixed wood away from a biome boundary. */
export const FOREST_MIXED_BASE_CHANCE = 0.2;
/** Extra mixed-wood chance exactly on the boundary (`n = 0.5`), fading linearly to 0 at `FOREST_MIXED_BAND`. */
export const FOREST_MIXED_BOUNDARY_BONUS = 0.4;
/** Half-width of the noise band around 0.5 in which the mixed-wood chance is raised. */
export const FOREST_MIXED_BAND = 0.06;
/**
 * Which wood a living forest hex at `(q, r)` is: large regions of taiga or birch (a coarse value
 * noise thresholded at 0.5), with mixed wood sprinkled into both, more densely on the boundary.
 * Only meaningful for a `forest` hex; mirrors `TerrainSampler.ForestKindAt`.
 */
export function forestKindAt(q, r, seed) {
    const n = valueNoise(q, r, seed + FOREST_BIOME_SALT, FOREST_BIOME_SCALE);
    const p = FOREST_MIXED_BASE_CHANCE + FOREST_MIXED_BOUNDARY_BONUS * Math.max(0, 1 - Math.abs(n - 0.5) / FOREST_MIXED_BAND);
    if (hash2(q, r, seed + FOREST_MIXED_SALT) < p)
        return 'mixed';
    return n >= 0.5 ? 'taiga' : 'birch';
}
/** The variant index of a living forest hex for the uniform roll `h`. */
function forestVariantIndex(h) {
    return weightedIndex(h, FOREST_VARIANT_WEIGHTS);
}
const WASTED_VARIANT_SALT = 1_000_003;
/** The top-variant index a revealed wasted-island tile of `terrain` shows at `(q, r)` — see `WASTED_VARIANT_WEIGHTS`. */
export function wastedVariantAt(q, r, world, terrain) {
    const weights = WASTED_VARIANT_WEIGHTS[terrain];
    if (!weights)
        return 0;
    // A salt far from orientation's `seed + 29`: hash2 barely mixes its seed
    // term, so a nearby salt (the green variant's `+ 31`) lands every hex in
    // the same bucket as its orientation and pins each variant to one
    // rotation.
    return weightedIndex(hash2(q, r, world.seed + WASTED_VARIANT_SALT), weights);
}
/** Picks an index from `weights` (assumed to sum to ~1) using a `[0, 1)` roll `h`. */
function weightedIndex(h, weights) {
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (h < acc)
            return i;
    }
    return weights.length - 1;
}
/**
 * The variant a non-coastal hex of `terrain` rolls from its `[0, 1)` hash: weighted for forest, sand and mountain (the shape),
 * uniform over `VARIANT_COUNTS` for everything else. The one place this is decided, so `variantAt`, `variantForTerrain` and
 * `generateTile` cannot drift apart. Mirrors `TerrainSampler.VariantAt`.
 */
function landVariantIndex(terrain, h) {
    if (terrain === 'forest')
        return forestVariantIndex(h);
    if (terrain === 'sand')
        return weightedIndex(h, SAND_VARIANT_WEIGHTS);
    if (terrain === 'mountain')
        return weightedIndex(h, MOUNTAIN_SHAPE_WEIGHTS);
    const count = VARIANT_COUNTS[terrain] ?? 1;
    if (count <= 1)
        return 0;
    return Math.min(count - 1, Math.floor(h * count));
}
/**
 * Seed-stable variant index for a hex, in `[0, N)` where `N` is however many
 * variants the art pack has for that terrain (1 — i.e. always variant 0 —
 * for anything not listed). Capping the range this way *is* the fallback: a
 * terrain with fewer variants than the pack's richest one never gets asked
 * for a variant it doesn't have.
 */
export function variantAt(q, r, world) {
    const h = hash2(q, r, world.seed + 31);
    if (isCoastalWater(q, r, world))
        return weightedIndex(h, COASTAL_WATER_VARIANT_WEIGHTS);
    return landVariantIndex(terrainAt(q, r, world), h);
}
/**
 * The variant index a hex of `terrain` shows — `variantAt`'s roll (same salt and formula) for a terrain the seed alone
 * does not give: bog and lake come from an island's bogland overlay, so `variantAt` (which asks the seed's own terrain)
 * cannot answer for them.
 */
export function variantForTerrain(q, r, world, terrain) {
    return landVariantIndex(terrain, hash2(q, r, world.seed + 31));
}
/**
 * Which spring-capable mountain shape (saddleback=2 or corrie=3, see
 * `VARIANT_COUNTS`'s doc comment) a hex should render as once it's known to
 * carry a river's `spring` tile — mirrors the backend's
 * `TerrainSampler.SpringMountainShapeAt` exactly (same seed offset, same
 * threshold), since only those two mountain shapes shipped a `_spring` art
 * cut. Pure and independent of whether the hex actually ends up being a
 * spring; the caller (river rendering) is what knows that.
 */
export function springMountainShapeAt(q, r, world) {
    const h = hash2(q, r, world.seed + 37);
    return h < 0.5 ? 2 : 3;
}
/**
 * Which crop the island whose centre is (q, r) grows — `'wheat'` or
 * `'pumpkin'` — mirrors the backend's `TerrainSampler.SoilAt` exactly (same
 * seed offset, same threshold). Every Grass hex on that island shares this
 * one answer, so the caller hashes by the island's centre once rather than
 * per hex (see `WorldModel.soilAtIslandCentre`).
 */
export function soilAt(q, r, world) {
    const h = hash2(q, r, world.seed + 41);
    return h < 0.5 ? 'wheat' : 'pumpkin';
}
/**
 * Salt for `riverVariantAt` — the next unused prime continuing the per-hex-
 * property sequence this module already uses (`defaultOrientation` +29,
 * `variantAt` +31, `springMountainShapeAt` +37, `soilAt` +41): far enough
 * past that cluster, and past every noise-field salt this file also uses
 * (11, 13, 17, 19, 23, 47, 53, 59, 61, 71, 101, 103, 200+lobe, and the odd
 * 601..633 of the green-island mountain/forest block — `SPINE_ID_SALT` up to
 * `FOREST_NOISE_SALT`+4), that hash2's
 * weak seed-mixing (see `WASTED_VARIANT_SALT`'s own doc comment) can't
 * correlate this pick with a neighbouring one.
 */
const RIVER_VARIANT_SALT = 67;
const RIVER_180_WEIGHTS = [0.4, 0.4, 0.2]; // plain, meander, island
const RIVER_120_WEIGHTS = [0.4, 0.4, 0.2]; // plain, meander, island
const RIVER_60_WEIGHTS = [0.85, 0.15]; // plain, loop
/**
 * Which river-art variant a `straight`/`bend`/`bend60` hex renders with —
 * `'plain'` for every other shape (spring/confluence/mouth have no variant
 * art). Mirrors the backend's `TerrainSampler.RiverVariantAt` exactly (same
 * salt, same weights): straight and bend each roll plain/meander/island at
 * 40/40/20, bend60 rolls plain/loop at 85/15. Pure and independent of
 * whether `(q, r)` actually carries a river of this shape — the caller
 * (river rendering, `riverBuildingAllowedHere`) already knows that from its
 * own `RiverTile` lookup, the same shape every other `*At` helper in this
 * file takes as a given.
 */
export function riverVariantAt(q, r, world, shape) {
    if (shape !== 'straight' && shape !== 'bend' && shape !== 'bend60')
        return 'plain';
    const h = hash2(q, r, world.seed + RIVER_VARIANT_SALT);
    if (shape === 'bend60') {
        return weightedIndex(h, RIVER_60_WEIGHTS) === 0 ? 'plain' : 'loop';
    }
    const weights = shape === 'straight' ? RIVER_180_WEIGHTS : RIVER_120_WEIGHTS;
    const index = weightedIndex(h, weights);
    return index === 0 ? 'plain' : index === 1 ? 'meander' : 'island';
}
/**
 * The six neighbours' land/sea as a bitmask, bit `i` set when
 * `NEIGHBOR_DIRS[i]` is land.
 *
 * A bitmask rather than an array because this runs once per generated tile and
 * a zoomed-out world map generates tens of thousands of them in one rebuild —
 * a six-element array each would be pure garbage. Bit order *is*
 * `NEIGHBOR_DIRS` order, and `coastalOrientation` turns index into angle, so
 * the two must not drift apart.
 */
function landNeighbourMask(q, r, sample) {
    let mask = 0;
    for (let i = 0; i < NEIGHBOR_DIRS.length; i++) {
        if (sample(q + NEIGHBOR_DIRS[i].q, r + NEIGHBOR_DIRS[i].r) !== 'sea')
            mask |= 1 << i;
    }
    return mask;
}
/**
 * `coastalOrientation` over an already-sampled neighbour mask. Same summed
 * unit vectors in the same index order — and therefore the same floating-point
 * accumulation, which matters because the zero-vector epsilon below exists
 * precisely for the cases where that sum lands near zero.
 */
function coastalOrientationFrom(landMask) {
    let sumX = 0;
    let sumY = 0;
    let firstLandIndex = -1;
    for (let i = 0; i < 6; i++) {
        if (!(landMask & (1 << i)))
            continue;
        if (firstLandIndex < 0)
            firstLandIndex = i;
        sumX += NEIGHBOR_COS[i];
        sumY += NEIGHBOR_SIN[i];
    }
    // Opposite land neighbours (e.g. a one-hex-wide strait) can cancel the
    // vector to (near) zero — see `coastalOrientation` for why this is an
    // epsilon rather than an exact `=== 0` check, and why the fallback is the
    // first land direction found.
    const ZERO_EPSILON = 1e-9;
    if (Math.abs(sumX) < ZERO_EPSILON && Math.abs(sumY) < ZERO_EPSILON)
        return TILE_ORIENTATIONS[firstLandIndex];
    let angle = Math.atan2(sumY, sumX);
    if (angle < 0)
        angle += 2 * Math.PI;
    const index = Math.round(angle / (Math.PI / 3)) % 6;
    return TILE_ORIENTATIONS[index];
}
/**
 * Builds one hex's `Tile`.
 *
 * The shape of this — sample the seven terrains once, then answer every
 * question from them — is the whole point, and it is worth stating why the
 * obvious version was not kept. Written as four independent calls
 * (`terrainAt`, `isCoastalWater`, `orientationAt`, `variantAt`) it looked
 * cheap, but three of the four re-derive coastal-ness, and each of those is
 * seven `terrainAt` calls: measured at 19us a tile against `terrainAt`'s own
 * 1.2us, i.e. sixteen times the necessary work. That is what made zooming the
 * world map out into unvisited water stall for over a second — 58,000 hexes
 * come into view at once and every one of them was paying it.
 *
 * `sample` is what makes the seven collapse to roughly one: `WorldModel`
 * passes a cached lookup, so a neighbour's terrain is computed by whichever
 * of the seven tiles that share it asks first.
 */
export function generateTile(q, r, world, sample) {
    const terrainOf = sample ?? ((sq, sr) => terrainAt(sq, sr, world));
    const terrain = terrainOf(q, r);
    // Only sea can be coastal, so land hexes never pay for the neighbour walk.
    const landMask = terrain === 'sea' ? landNeighbourMask(q, r, terrainOf) : 0;
    const coastal = landMask !== 0;
    const h = hash2(q, r, world.seed + 31);
    let variant;
    if (coastal) {
        variant = weightedIndex(h, COASTAL_WATER_VARIANT_WEIGHTS);
    }
    else {
        variant = landVariantIndex(terrain, h);
    }
    const tile = {
        q,
        r,
        terrain,
        isCoastalWater: coastal,
        orientation: coastal ? coastalOrientationFrom(landMask) : defaultOrientation(q, r, world),
        variant,
    };
    // Living forest only: WorldModel drops it again if the hex turns out to be wasted land.
    if (terrain === 'forest')
        tile.forestKind = forestKindAt(q, r, world.seed);
    return tile;
}
