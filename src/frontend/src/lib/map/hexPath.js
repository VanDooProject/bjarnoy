// Issue #159 part B: the client-side range tint. Pure, dependency-free (same
// spirit as lib/units/armyDispatch.ts) so it can run every provisions-slider
// tick with no round trip — but it mirrors HexPathfinder.cs's own cost model
// hex for hex: the movement rules (wide rivers and mountains impassable, a
// stream a flat 1.0 + riverCrossingCost whatever it runs over), sea impassable
// to land units, no distance-circle shortcut. `rules` always comes from the backend
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
 * Hard cap on hexes a single flood-fill may visit — mirrors
 * `HexPathfinder.MaxExpandedNodes`'s role server-side: a belt-and-braces
 * bound against a pathological search, not the primary limiter (that's
 * `maxHours`/`hoursOfFood`, which terminates the fill naturally for any
 * realistic army).
 */
export const MAX_TINT_HEXES = 4000;
/**
 * Step cost for a land unit entering `c`, or `null` if impassable (sea, a lake, a wide river, a mountain
 * that is not also a stream, a palisade). A stream costs a flat `1.0 + riverCrossingCost` whatever
 * terrain it runs over — the C# twin is `HexPathfinder.LandStepCost`, and the two apply the rules in
 * the same order: wide river (impassable unless a bridge this army may cross opens it, at the bridge's price) and mountain impassable -> stream flat 9 (+ 3 under a half-open end) -> half-open palisade end ground + 3 ->
 * blocked palisade hex (unless a friendly gate) -> terrain cost.
 */
function stepCost(c, ctx) {
    const terrain = ctx.terrainAt(c);
    const base = ctx.rules.land[terrain];
    if (base === undefined)
        return null;
    const r = ctx.restrictions;
    const river = ctx.isRiver(c);
    const wide = river && ctx.isWideRiver(c);
    if ((r?.wideRiversImpassable ?? true) && wide)
        return r?.bridgeCost?.(c) ?? null;
    const endCost = r?.halfOpen?.(c) ? (r.halfOpenCost ?? HALF_OPEN_END_COST) : 0;
    if ((r?.streamsIgnoreTerrain ?? true) && river && !wide)
        return 1.0 + ctx.rules.riverCrossingCost + endCost;
    if ((r?.mountainsImpassable ?? true) && terrain === 'mountain')
        return null;
    if (r?.halfOpen?.(c))
        return base + endCost;
    if (r?.blocked?.(c) && !r.friendlyGate?.(c))
        return null;
    return river ? base + ctx.rules.riverCrossingCost : base;
}
/** Binary min-heap keyed by priority — Dijkstra's usual decrease-key stand-in (push a new entry, ignore stale pops). */
class MinHeap {
    items = [];
    get size() {
        return this.items.length;
    }
    push(value, priority) {
        this.items.push({ value, priority });
        let i = this.items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.items[parent].priority <= this.items[i].priority)
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
                if (l < this.items.length && this.items[l].priority < this.items[smallest].priority)
                    smallest = l;
                if (r < this.items.length && this.items[r].priority < this.items[smallest].priority)
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
            const cost = stepCost(neighbour, ctx);
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
 * `hoursFrom(origin, X) + hoursFrom(home, X)`, not the cost of an actual
 * round-trip path (which would double-count or skip the origin/destination
 * hex's own terrain cost depending on direction, since cost is charged on
 * entry — see `HexPathfinder`'s remarks on why); two independent one-way
 * fills summed is the model the issue specifies, and it collapses to the
 * useful special case on its own: for an ordinary dispatch `origin === home`,
 * so both fills are literally the same computation and the sum is just
 * `2 × hoursFrom(origin, X)`.
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
/**
 * Cheapest land route from `from` to `to` (both included), or `null` if there is none: the TS
 * twin of `HexPathfinder.FindPath` for land armies. Same A* (plain hex distance as the
 * heuristic), same endpoint check (both must be land terrain),
 * same bounding box (the endpoints padded by their distance, at least 10) and expansion cap.
 * Prices exactly what the backend does; `ctx.restrictions` can add a palisade or (preview tool only) switch a rule off.
 */
export function findPath(from, to, ctx) {
    if (ctx.rules.land[ctx.terrainAt(from)] === undefined || ctx.rules.land[ctx.terrainAt(to)] === undefined)
        return null;
    if (from.q === to.q && from.r === to.r)
        return [from];
    const padding = Math.max(10, hexDistance(from, to));
    const qMin = Math.min(from.q, to.q) - padding;
    const qMax = Math.max(from.q, to.q) + padding;
    const rMin = Math.min(from.r, to.r) - padding;
    const rMax = Math.max(from.r, to.r) + padding;
    const open = new MinHeap();
    const g = new Map([[coordKey(from), 0]]);
    const cameFrom = new Map();
    const closed = new Set();
    open.push(from, hexDistance(from, to));
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
            const step = stepCost(n, ctx);
            if (step === null)
                continue;
            const tentative = g.get(currentKey) + step;
            const existing = g.get(nKey);
            if (existing !== undefined && tentative >= existing)
                continue;
            g.set(nKey, tentative);
            cameFrom.set(nKey, current);
            open.push(n, tentative + hexDistance(n, to));
        }
    }
    return null;
}
/** Terrain-and-river cost of walking `path` (the origin is free, every later hex is charged on entry), in hex-cost units; `Infinity` through an impassable hex. */
export function pathCost(path, ctx) {
    let total = 0;
    for (let i = 1; i < path.length; i++)
        total += stepCost(path[i], ctx) ?? Number.POSITIVE_INFINITY;
    return total;
}
/** Every hex reachable from `origin` (origin included) under `ctx`'s rules, as `coordKey`s, capped at `limit` hexes. */
export function reachableFrom(origin, ctx, limit = 200_000) {
    const seen = new Set([coordKey(origin)]);
    const queue = [origin];
    for (let i = 0; i < queue.length && seen.size < limit; i++) {
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
