import { TILE_ORIENTATIONS } from './types';
/** The bog art's moss and the brown of its pool rims, sampled off the rendered tiles. */
export const BOG_MOSS = 0x799244;
export const BOG_PEAT = 0x5e4a34;
/**
 * The forest art's ground between the trees (its baked shadow catcher), sampled off the rendered tiles: darker and
 * more saturated than the moss, which is why moss pushed out over it reads as the wrong colour.
 */
export const FOREST_GROUND = 0x52822a;
/**
 * The peat rim around moss pushed onto grass: half of the stroke shows outside the moss, so 1.5 world units of a
 * half-transparent brown — about as strong as the plain colour step of the forest side.
 */
const RIM_WIDTH = 3;
const RIM_ALPHA = 0.55;
/** Bog ground: the plain moss and every bog shore/creek hex (their outer edges are moss too). Not the open lake. */
export function isBogGround(tile) {
    if (tile.terrain === 'lake')
        return false;
    return tile.terrain === 'bog' || !!tile.bog;
}
/** What a bog edge facing `tile` is drawn against, or `null` for no border. A giant's art covers its hexes' ground. */
export function bogEdgeNeighbour(tile) {
    if (tile.bog || tile.giant)
        return null;
    if (tile.terrain === 'grass')
        return 'grass';
    if (tile.terrain === 'forest')
        return 'forest';
    return null;
}
/** The axial direction offsets in `neighbors()` order, and each one's top-face polygon edge (see `types.ts`). */
const DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];
const EDGE_FOR_DIR = [3, 2, 1, 0, 5, 4];
/**
 * The stretch (as `t` along the edge, 0..1) a river or stream tile's water and banks take up on an edge it flows
 * through, pixel-measured on every `rivertile*_base` frame: the river 0.23-0.77 (the bend180 meander reaches 0.84
 * on one end), the stream 0.36-0.64. Widened a little each way; the moss tapers to nothing at the water.
 */
export const RIVER_EDGE_GAP = [0.17, 0.83];
export const STREAM_EDGE_GAP = [0.32, 0.68];
/**
 * The water gap on the edge of `river` that faces direction `towards`, or `null` when no water crosses that edge
 * (the rest of a river hex is plain grass). See `RiverTile.width` for which edges of a mixed tile are stream.
 */
export function riverGapOn(river, towards) {
    const isIn = river.inDirections.includes(towards);
    if (!isIn && river.outDirection !== towards)
        return null;
    const width = river.width ?? 'river';
    const stream = width === 'stream' || (width === 'widen' && isIn) || (width === 'riverstream' && river.inDirections[0] === towards);
    return stream ? STREAM_EDGE_GAP : RIVER_EDGE_GAP;
}
/** The edges of bog hex `c` that get a border. */
export function bogEdgesOf(getTile, getRiver, c) {
    if (!isBogGround(getTile(c.q, c.r)))
        return [];
    const across = DIRS.map((d) => getTile(c.q + d.q, c.r + d.r));
    const rivers = DIRS.map((d) => getRiver(c.q + d.q, c.r + d.r));
    // A river hex draws the river art, whose banks are grass whatever terrain (grass or forest) it stands on.
    const neighbourAt = (i) => {
        const neighbour = bogEdgeNeighbour(across[i]);
        return neighbour && rivers[i] ? 'grass' : neighbour;
    };
    // What the border continues as past a corner of polygon edge `edge` (facing `neighbour`), going round through the
    // polygon edge `next`: along this hex's own edge `next` when that faces non-bog ground, otherwise along the edge
    // between the bog hex there and the same `neighbour`, which is the same kind.
    const continuesAs = (next, neighbour) => {
        const i = EDGE_FOR_DIR[next];
        return isBogGround(across[i]) ? neighbour : neighbourAt(i);
    };
    const edges = [];
    DIRS.forEach((_, i) => {
        const neighbour = neighbourAt(i);
        if (!neighbour)
            return;
        const edge = EDGE_FOR_DIR[i];
        const found = { edge, neighbour };
        // A river hex has its water in the art: border its banks, not the water.
        const river = rivers[i];
        const gap = river ? riverGapOn(river, TILE_ORIENTATIONS[(i + 3) % 6]) : null;
        if (gap)
            found.gap = gap;
        const other = neighbour === 'grass' ? 'forest' : 'grass';
        if (continuesAs((edge + 5) % 6, neighbour) === other)
            found.flushStart = true;
        if (continuesAs((edge + 1) % 6, neighbour) === other)
            found.flushEnd = true;
        edges.push(found);
    });
    return edges;
}
const SAMPLES = 18;
/** The share of the full reach left at a corner. */
const CORNER_REACH = 0.35;
/** A small deterministic hash in [0, 1) — the same edge always gets the same wobble, rebuild after rebuild. */
function hash01(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** The three sine phases a seed keys, hashed once per edge range instead of at every sample point. */
function wobblePhases(seed) {
    return [
        hash01(...seed) * Math.PI * 2,
        hash01(seed[0] + 7, seed[1], seed[2]) * Math.PI * 2,
        hash01(seed[0], seed[1] + 13, seed[2]) * Math.PI * 2,
    ];
}
/**
 * How far (0..1 of the amplitude) the moss reaches past the edge at `t` along it: a few summed sines with seeded
 * phases, eased to `start` / `end` at the two ends — `CORNER_REACH` at a corner, where a round cap (see
 * `bogEdgeShapes`) joins it to the next edge, 0 where it meets a river's water.
 */
function wobble(t, phases, start = CORNER_REACH, end = CORNER_REACH) {
    const [p1, p2, p3] = phases;
    const n = 0.5 * Math.sin(t * Math.PI * 3 + p1) + 0.3 * Math.sin(t * Math.PI * 7 + p2) + 0.2 * Math.sin(t * Math.PI * 13 + p3);
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.7);
    return start + (end - start) * t + (1 - CORNER_REACH) * envelope * (0.55 + 0.45 * n);
}
/**
 * The shapes for one bog edge from `a` to `b` (world units), facing `neighbour`. `outward` is the unit normal pointing
 * out of the bog, `seed` keys the wobble, `gap` is the stretch of the edge a river's water takes up, left bare.
 * `flushStart` / `flushEnd` mark a corner where the border switches between grass (reaching out) and forest (reaching
 * in): both sides taper to the hex corner itself there, without a cap, so the two outlines meet in one point. Pure, so
 * the shapes are testable without Pixi.
 */
export function bogEdgeShapes(neighbour, a, b, outward, seed, gap, flushStart = false, flushEnd = false) {
    const shapes = (from, to, rangeSeed, startCorner, endCorner) => neighbour === 'grass'
        ? lobeShapes(from, to, outward, rangeSeed, startCorner, endCorner, BOG_MOSS, true)
        : lobeShapes(from, to, { x: -outward.x, y: -outward.y }, rangeSeed, startCorner, endCorner, FOREST_GROUND, false);
    if (!gap)
        return shapes(a, b, seed, !flushStart, !flushEnd);
    const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // Two banks, each running from its corner to the water.
    return [
        ...shapes(a, lerp(gap[0]), seed, !flushStart, false),
        ...shapes(lerp(gap[1]), b, [seed[0], seed[1], seed[2] + 6], false, !flushEnd),
    ];
}
/**
 * Organic tongues of `fill` pushed out along `normal` from one unbroken stretch of edge, so the edge stops being a
 * ruler line. An end at a corner gets a round cap, an end at a river's water tapers to nothing. With `rim`, a peat
 * outline goes with them.
 */
function lobeShapes(a, b, normal, seed, startCorner, endCorner, fill, rim) {
    const at = (t, off) => ({
        x: a.x + (b.x - a.x) * t + normal.x * off,
        y: a.y + (b.y - a.y) * t + normal.y * off,
    });
    const phases = wobblePhases(seed);
    const reach = 14;
    const outer = [];
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        outer.push(at(t, reach * wobble(t, phases, startCorner ? CORNER_REACH : 0, endCorner ? CORNER_REACH : 0)));
    }
    const lobe = { points: [...outer, at(1, -2), at(0, -2)], fill: { color: fill, alpha: 1 } };
    // Round caps on the corners: two edges meeting at a corner point their reach in different directions, the cap
    // fills the wedge between them. Only the side the lobes reach into, so nothing of a cap shows on the other.
    const capR = reach * CORNER_REACH;
    const corners = [startCorner ? a : null, endCorner ? b : null].filter((p) => p !== null);
    const caps = corners.map((p) => ({ points: fan(p, capR, normal), fill: { color: fill, alpha: 1 } }));
    if (!rim)
        return [...caps, lobe];
    // The rim is drawn *under* the moss of every edge (`under`): a wide stroke along the outline and a slightly larger
    // cap at each corner, with all the moss on top, so only the outer half shows and it follows the outline of the
    // whole bog instead of each edge's own shape.
    return [
        { under: true, points: outer, stroke: { color: 0x000000, alpha: 0.06, width: 6 } },
        { under: true, points: outer, stroke: { color: BOG_PEAT, alpha: RIM_ALPHA, width: RIM_WIDTH } },
        ...corners.map((p) => ({
            under: true,
            points: fan(p, capR + RIM_WIDTH / 2, normal),
            fill: { color: BOG_PEAT, alpha: RIM_ALPHA },
        })),
        ...caps,
        lobe,
    ];
}
/**
 * A fan around `c` on the `outward` side, ±70° about the normal: wide enough to close the wedge between two edges that
 * meet at a convex corner (their normals are about 60° apart), narrow enough not to reach along the edge line into the
 * next hex.
 */
function fan(c, r, outward, steps = 10) {
    const mid = Math.atan2(outward.y, outward.x);
    const half = (70 * Math.PI) / 180;
    const pts = [c];
    for (let i = 0; i <= steps; i++) {
        const t = mid - half + (i / steps) * 2 * half;
        pts.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r });
    }
    return pts;
}
