// Issue #159 part B: the client-side range tint. Pure, dependency-free (same
// spirit as lib/units/armyDispatch.ts) so it can run every provisions-slider
// tick with no round trip — but it mirrors HexPathfinder.cs's own cost model
// hex for hex: the movement rules (wide rivers and mountains impassable, a
// stream a flat 1.0 + riverCrossingCost whatever it runs over), sea impassable
// to land units, no distance-circle shortcut. A step is billed half and half:
// (leave price of the hex left + enter price of the hex entered) / 2. `rules` always comes from the backend
// (`WorldResponse.movement`), never a hardcoded literal here, so this and the
// server can't quietly drift apart — see hexPath.golden.test.ts.
import { coordKey, hexDistance, neighbors } from '../hex/coords';
/**
 * The movement rules every land army follows (HexPathfinder.cs), applied by default: a context
 * without `restrictions` prices exactly what the backend does. Each rule has an opt-out for the
 * pathing preview tool, which compares them against the old numbers; the game never sets them.
 */
/** What entering a half-open palisade end costs on top of the ground's own cost (`HexPathfinder.HalfOpenEndCost`). */
export const HALF_OPEN_END_COST = 3.0;
/**
 * What leaving a wide-river hex costs on top of the base 1.0 when no bridge this army may cross stands on it any more (it burnt
 * under the army): 1.0 + this = 12 (`HexPathfinder.BurntBridgeLeaveCost`).
 */
export const BURNT_BRIDGE_LEAVE_COST = 11.0;
/**
 * Hard cap on hexes a single flood-fill may visit — mirrors
 * `HexPathfinder.MaxExpandedNodes`'s role server-side: a belt-and-braces
 * bound against a pathological search, not the primary limiter (that's
 * `maxHours`/`hoursOfFood`, which terminates the fill naturally for any
 * realistic army).
 */
export const MAX_TINT_HEXES = 4000;
/**
 * Price of a land unit's hex `c`, or `null` if impassable (sea, a lake, a wide river, a mountain
 * that is not also a stream, a palisade). A stream costs a flat `1.0 + riverCrossingCost` whatever
 * terrain it runs over — the C# twin is `HexPathfinder.LandStepCost`, and the two apply the rules in
 * the same order: wide river (impassable unless a bridge this army may cross opens it, at the bridge's price) and mountain impassable -> stream flat 9 (+ 3 under a half-open end) -> half-open palisade end ground + 3 ->
 * blocked palisade hex (unless a friendly gate) -> terrain cost.
 *
 * `leaving` prices the hex the army stands on instead of the one it enters: a blocked palisade hex is not shut (a wall built under
 * the army is left at its ground or stream price) and a wide river with no crossable bridge costs `1.0 + BURNT_BRIDGE_LEAVE_COST`.
 * For every hex the enter price accepts, both prices are equal.
 */
function hexCost(c, ctx, leaving) {
    const terrain = ctx.terrainAt(c);
    const base = ctx.rules.land[terrain];
    if (base === undefined)
        return null;
    const r = ctx.restrictions;
    const river = ctx.isRiver(c);
    const wide = river && ctx.isWideRiver(c);
    if ((r?.wideRiversImpassable ?? true) && wide) {
        const bridge = r?.bridgeCost?.(c) ?? null;
        return leaving ? (bridge ?? 1.0 + BURNT_BRIDGE_LEAVE_COST) : bridge;
    }
    const endCost = r?.halfOpen?.(c) ? (r.halfOpenCost ?? HALF_OPEN_END_COST) : 0;
    if ((r?.streamsIgnoreTerrain ?? true) && river && !wide)
        return 1.0 + ctx.rules.riverCrossingCost + endCost;
    if ((r?.mountainsImpassable ?? true) && terrain === 'mountain')
        return null;
    if (r?.halfOpen?.(c))
        return base + endCost;
    if (!leaving && r?.blocked?.(c) && !r.friendlyGate?.(c))
        return null;
    return river ? base + ctx.rules.riverCrossingCost : base;
}
/** Step cost for a land unit entering `c`, or `null` if impassable; see `hexCost`. */
function stepCost(c, ctx) {
    return hexCost(c, ctx, false);
}
/** Price of leaving `c` (the hex the army stands on), or `null` if it could never stand there (sea, lake, plain mountain); see `hexCost`. */
export function leaveCost(c, ctx) {
    return hexCost(c, ctx, true);
}
/** Price of the step from `from` to its neighbour `to`: half the leave price of `from`, half the enter price of `to`; `null` if either is impassable. */
function halfAndHalf(from, to, ctx) {
    const leave = leaveCost(from, ctx);
    if (leave === null)
        return null;
    const enter = stepCost(to, ctx);
    return enter === null ? null : (leave + enter) / 2;
}
/**
 * Price of the time spent ON hex `path[i]` (grass = 1), in hex-cost units: every step is paid half at the hex left and half at the hex
 * entered, so the first hex of a path counts half its leave price, the last half its enter price and a hex in between half of each (its
 * price); `Infinity` for an impassable hex. These prices add up to `pathCost(path)`.
 */
export function timeOnHex(path, i, ctx) {
    const hex = path[i];
    const leave = i < path.length - 1 ? leaveCost(hex, ctx) : 0;
    const enter = i > 0 ? stepCost(hex, ctx) : 0;
    return leave === null || enter === null ? Number.POSITIVE_INFINITY : (leave + enter) / 2;
}
/**
 * Binary min-heap keyed by priority — Dijkstra's usual decrease-key stand-in (push a new entry, ignore stale pops).
 * Priorities compare numerically unless a `less` comparator is passed (findPath's tuple key).
 */
class MinHeap {
    items = [];
    less;
    constructor(less = (a, b) => a < b) {
        this.less = less;
    }
    get size() {
        return this.items.length;
    }
    push(value, priority) {
        this.items.push({ value, priority });
        let i = this.items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (!this.less(this.items[i].priority, this.items[parent].priority))
                break;
            [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
            i = parent;
        }
    }
    pop() {
        const top = this.items[0];
        if (!top)
            return undefined;
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = i * 2 + 2;
                let smallest = i;
                if (l < this.items.length && this.less(this.items[l].priority, this.items[smallest].priority))
                    smallest = l;
                if (r < this.items.length && this.less(this.items[r].priority, this.items[smallest].priority))
                    smallest = r;
                if (smallest === i)
                    break;
                [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
                i = smallest;
            }
        }
        return top.value;
    }
}
/**
 * Cheapest hours to every hex reachable from `origin` within `maxHours`,
 * keyed by `coordKey`. `origin` itself is always included at 0 hours.
 * Dijkstra rather than A* — there is no single destination to bias the
 * search toward, the whole point is the reachable set.
 */
export function hoursFrom(origin, ctx, maxHours) {
    const best = new Map([[coordKey(origin), 0]]);
    const settled = new Set();
    const open = new MinHeap();
    open.push(origin, 0);
    while (open.size > 0 && settled.size < MAX_TINT_HEXES) {
        const current = open.pop();
        const currentKey = coordKey(current);
        if (settled.has(currentKey))
            continue;
        settled.add(currentKey);
        const currentHours = best.get(currentKey);
        for (const neighbour of neighbors(current)) {
            const neighbourKey = coordKey(neighbour);
            if (settled.has(neighbourKey))
                continue;
            const cost = halfAndHalf(current, neighbour, ctx);
            if (cost === null)
                continue;
            const hours = currentHours + cost / ctx.hexesPerHour;
            if (hours > maxHours)
                continue;
            const existing = best.get(neighbourKey);
            if (existing !== undefined && existing <= hours)
                continue;
            // Bound the result set itself, not just how many nodes get settled —
            // otherwise a wide-open frontier can still enqueue (and report) more
            // than MAX_TINT_HEXES hexes before the settled-count check above ever
            // trips.
            if (existing === undefined && best.size >= MAX_TINT_HEXES)
                continue;
            best.set(neighbourKey, hours);
            open.push(neighbour, hours);
        }
    }
    return best;
}
/**
 * Round-trip hours per hex, capped at `hoursOfFood` — the tint itself.
 * `hoursFrom(origin, X) + hoursFrom(home, X)`: two independent one-way fills
 * summed. A step is billed half at the hex left and half at the hex entered,
 * so a one-way cost is symmetric (A to B costs what B to A costs) and the
 * sum is the cost of the actual round trip; for an ordinary dispatch
 * `origin === home`, so both fills are literally the same computation and the
 * sum is just `2 × hoursFrom(origin, X)`.
 */
export function reachableRange(origin, home, hoursOfFood, ctx) {
    const result = new Map();
    if (hoursOfFood <= 0)
        return result;
    const sameOrigin = origin.q === home.q && origin.r === home.r;
    const fromOrigin = hoursFrom(origin, ctx, hoursOfFood);
    const fromHome = sameOrigin ? fromOrigin : hoursFrom(home, ctx, hoursOfFood);
    for (const [key, outHours] of fromOrigin) {
        const backHours = sameOrigin ? outHours : fromHome.get(key);
        if (backHours === undefined)
            continue;
        const total = outHours + backHours;
        if (total <= hoursOfFood)
            result.set(key, total);
    }
    return result;
}
/** Hard cap on hexes `findPath` expands, the twin of `HexPathfinder.MaxExpandedNodes`. */
export const MAX_EXPANDED_NODES = 20_000;
function openKey(n, g, from, to) {
    const h = hexDistance(n, to);
    const deviation = Math.abs((n.q - from.q) * (to.r - from.r) - (n.r - from.r) * (to.q - from.q));
    return [g + h, h, deviation, n.q, n.r];
}
function openKeyLess(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return a[i] < b[i];
    }
    return false;
}
/**
 * Cheapest land route from `from` to `to` (both included), or `null` if there is none: the TS
 * twin of `HexPathfinder.FindPath` for land armies. Same A* (plain hex distance as the
 * heuristic), same endpoint check (both must be land terrain),
 * same open-set order (f, then h, then distance from the start-to-goal line, then q and r), same bounding box (the endpoints padded by their distance, at least 10) and expansion cap.
 * Prices exactly what the backend does; `ctx.restrictions` can add a palisade or (preview tool only) switch a rule off.
 */
export function findPath(from, to, ctx) {
    if (ctx.rules.land[ctx.terrainAt(from)] === undefined || ctx.rules.land[ctx.terrainAt(to)] === undefined)
        return null;
    return aStar(from, to, (a, b) => halfAndHalf(a, b, ctx));
}
/**
 * The one A* loop behind `findPath` and `findSeaPath` (the backend's `HexPathfinder.FindPath` is likewise one loop with two cost
 * tables): plain hex distance as the heuristic, the endpoints padded by their distance (at least 10) as the bounding box, and
 * `MAX_EXPANDED_NODES` as the expansion cap. `step` prices the move between two neighbours, `null` when it is impassable.
 */
function aStar(from, to, step) {
    if (from.q === to.q && from.r === to.r)
        return [from];
    const padding = Math.max(10, hexDistance(from, to));
    const qMin = Math.min(from.q, to.q) - padding;
    const qMax = Math.max(from.q, to.q) + padding;
    const rMin = Math.min(from.r, to.r) - padding;
    const rMax = Math.max(from.r, to.r) + padding;
    const open = new MinHeap(openKeyLess);
    const g = new Map([[coordKey(from), 0]]);
    const cameFrom = new Map();
    const closed = new Set();
    open.push(from, openKey(from, 0, from, to));
    let expanded = 0;
    for (let current = open.pop(); current; current = open.pop()) {
        const currentKey = coordKey(current);
        if (closed.has(currentKey))
            continue;
        closed.add(currentKey);
        if (current.q === to.q && current.r === to.r) {
            const path = [current];
            for (let k = cameFrom.get(currentKey); k; k = cameFrom.get(coordKey(k)))
                path.push(k);
            return path.reverse();
        }
        if (++expanded > MAX_EXPANDED_NODES)
            return null;
        for (const n of neighbors(current)) {
            if (n.q < qMin || n.q > qMax || n.r < rMin || n.r > rMax)
                continue;
            const nKey = coordKey(n);
            if (closed.has(nKey))
                continue;
            const cost = step(current, n);
            if (cost === null)
                continue;
            const tentative = g.get(currentKey) + cost;
            const existing = g.get(nKey);
            if (existing !== undefined && tentative >= existing)
                continue;
            g.set(nKey, tentative);
            cameFrom.set(nKey, current);
            open.push(n, openKey(n, tentative, from, to));
        }
    }
    return null;
}
/** Terrain-and-river cost of walking `path`, in hex-cost units: every step is half the leave price of the hex left plus half the enter price of the hex entered; `Infinity` through an impassable hex. */
export function pathCost(path, ctx) {
    let total = 0;
    for (let i = 1; i < path.length; i++)
        total += halfAndHalf(path[i - 1], path[i], ctx) ?? Number.POSITIVE_INFINITY;
    return total;
}
/** Every hex reachable from `origin` (origin included) under `ctx`'s rules, as `coordKey`s, capped at `limit` hexes. */
export function reachableFrom(origin, ctx, limit = 200_000) {
    const seen = new Set([coordKey(origin)]);
    const queue = [origin];
    for (let i = 0; i < queue.length && seen.size < limit; i++) {
        // An origin that cannot be left (a plain mountain) reaches nothing but itself.
        if (leaveCost(queue[i], ctx) === null)
            continue;
        for (const n of neighbors(queue[i])) {
            const k = coordKey(n);
            if (seen.has(k) || stepCost(n, ctx) === null)
                continue;
            seen.add(k);
            queue.push(n);
        }
    }
    return seen;
}
/**
 * Shortest route for a fleet from `from` to `to` (both included), or `null` if there is none: the TS twin of `HexPathfinder.FindPath`
 * for ships. Open sea costs a flat 1.0 per hex (`SeaTerrainCost`) and the two endpoints are exempt from the sea-only rule (a harbour or
 * beaching hex, the shore a fleet is sent at), so every hex in between has to be sea. Same bounding box and expansion cap as `findPath`.
 */
export function findSeaPath(from, to, terrainAt) {
    return aStar(from, to, (_, b) => ((b.q === to.q && b.r === to.r) || terrainAt(b) === 'sea' ? 1 : null));
}
