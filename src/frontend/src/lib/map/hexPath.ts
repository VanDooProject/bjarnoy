// Issue #159 part B: the client-side range tint. Pure, dependency-free (same
// spirit as lib/units/armyDispatch.ts) so it can run every provisions-slider
// tick with no round trip — but it mirrors HexPathfinder.cs's own cost model
// hex for hex: the movement rules (wide rivers and mountains impassable, a
// stream a flat 1.0 + riverCrossingCost whatever it runs over), sea impassable
// to land units, no distance-circle shortcut. A step is billed half and half:
// (leave price of the hex left + enter price of the hex entered) / 2. `rules` always comes from the backend
// (`WorldResponse.movement`), never a hardcoded literal here, so this and the
// server can't quietly drift apart — see hexPath.golden.test.ts.
import { coordKey, hexDistance, hexLine, neighbors, type AxialCoord } from '../hex/coords';
import type { Terrain } from './types';

export interface MovementRules {
  /** Per-terrain step cost for land units, keyed by wire terrain name. `sea` is absent — impassable. */
  land: Record<string, number>;
  /** Flat penalty, on top of terrain cost, for entering a river hex — HexPathfinder.RiverCrossingCost. */
  riverCrossingCost: number;
}

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

export interface PathRestrictions {
  /** Default `true`. A river hex for which `isWideRiver` holds is impassable (streams stay crossable at the river cost). */
  wideRiversImpassable?: boolean;
  /** Default `true`. Mountain hexes are impassable instead of costing `rules.land.mountain`. */
  mountainsImpassable?: boolean;
  /**
   * Default `true`. A crossable river tile (one `isWideRiver` does not hold for) costs a flat
   * `1.0 + riverCrossingCost` whatever terrain it runs over: mountain impassability and the terrain's own
   * cost do not apply to it. A wide river stays impassable when `wideRiversImpassable` is on. Off, a river
   * tile costs its terrain plus `riverCrossingCost` (the pre-rules model).
   */
  streamsIgnoreTerrain?: boolean;
  /** Extra impassable hexes (every palisade hex; see `palisadeRestrictions`, palisadeMovement.ts). */
  blocked?(c: AxialCoord): boolean;
  /** A blocked hex this army may pass anyway (a gate, for a friendly army only; leave unset for an enemy). */
  friendlyGate?(c: AxialCoord): boolean;
  /**
   * Hexes that are blocked (a palisade) but half open: any army may enter them, at the ground's cost
   * plus `halfOpenCost` (a palisade's land end that abuts no wide river or mountain). The
   * caller decides which hexes (see `classifyEnd` in palisadeTiles.ts); `blocked` is not consulted for them.
   */
  halfOpen?(c: AxialCoord): boolean;
  halfOpenCost?: number;
  /**
   * What this army pays to enter a wide-river hex over a bridge it may cross (see `bridgeRestrictions`, bridgeMovement.ts), or `null`
   * for a hex it may not (no bridge, or a guarded one of strangers). Only consulted for wide-river hexes, which stay impassable
   * without it; streams are unaffected.
   */
  bridgeCost?(c: AxialCoord): number | null;
}

export interface PathContext {
  terrainAt(c: AxialCoord): Terrain;
  isRiver(c: AxialCoord): boolean;
  /** Which river hexes are wide (`isWideRiverTile`, riverGenerator.ts): impassable to a land army; every other river hex is a crossable stream. */
  isWideRiver(c: AxialCoord): boolean;
  rules: MovementRules;
  /** Army speed (hexes/hour) already scaled by the world's speedFactor. */
  hexesPerHour: number;
  restrictions?: PathRestrictions;
}

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
function hexCost(c: AxialCoord, ctx: PathContext, leaving: boolean): number | null {
  const terrain = ctx.terrainAt(c);
  const base = ctx.rules.land[terrain];
  if (base === undefined) return null;
  const r = ctx.restrictions;
  const river = ctx.isRiver(c);
  const wide = river && ctx.isWideRiver(c);
  if ((r?.wideRiversImpassable ?? true) && wide) {
    const bridge = r?.bridgeCost?.(c) ?? null;
    return leaving ? (bridge ?? 1.0 + BURNT_BRIDGE_LEAVE_COST) : bridge;
  }
  const endCost = r?.halfOpen?.(c) ? (r.halfOpenCost ?? HALF_OPEN_END_COST) : 0;
  if ((r?.streamsIgnoreTerrain ?? true) && river && !wide) return 1.0 + ctx.rules.riverCrossingCost + endCost;
  if ((r?.mountainsImpassable ?? true) && terrain === 'mountain') return null;
  if (r?.halfOpen?.(c)) return base + endCost;
  if (!leaving && r?.blocked?.(c) && !r.friendlyGate?.(c)) return null;
  return river ? base + ctx.rules.riverCrossingCost : base;
}

/** Step cost for a land unit entering `c`, or `null` if impassable; see `hexCost`. */
function stepCost(c: AxialCoord, ctx: PathContext): number | null {
  return hexCost(c, ctx, false);
}

/** Price of leaving `c` (the hex the army stands on), or `null` if it could never stand there (sea, lake, plain mountain); see `hexCost`. */
export function leaveCost(c: AxialCoord, ctx: PathContext): number | null {
  return hexCost(c, ctx, true);
}

/** Price of the step from `from` to its neighbour `to`: half the leave price of `from`, half the enter price of `to`; `null` if either is impassable. */
function halfAndHalf(from: AxialCoord, to: AxialCoord, ctx: PathContext): number | null {
  const leave = leaveCost(from, ctx);
  if (leave === null) return null;
  const enter = stepCost(to, ctx);
  return enter === null ? null : (leave + enter) / 2;
}

/**
 * Price of the time spent ON hex `path[i]` (grass = 1), in hex-cost units: every step is paid half at the hex left and half at the hex
 * entered, so the first hex of a path counts half its leave price, the last half its enter price and a hex in between half of each (its
 * price); `Infinity` for an impassable hex. These prices add up to `pathCost(path)`.
 */
export function timeOnHex(path: readonly AxialCoord[], i: number, ctx: PathContext): number {
  const hex = path[i]!;
  const leave = i < path.length - 1 ? leaveCost(hex, ctx) : 0;
  const enter = i > 0 ? stepCost(hex, ctx) : 0;
  return leave === null || enter === null ? Number.POSITIVE_INFINITY : (leave + enter) / 2;
}

/**
 * Binary min-heap keyed by priority — Dijkstra's usual decrease-key stand-in (push a new entry, ignore stale pops).
 * Priorities compare numerically unless a `less` comparator is passed (findPath's tuple key).
 */
class MinHeap<T, P = number> {
  private items: { priority: P; value: T }[] = [];

  private readonly less: (a: P, b: P) => boolean;

  constructor(less: (a: P, b: P) => boolean = (a, b) => (a as number) < (b as number)) {
    this.less = less;
  }

  get size(): number {
    return this.items.length;
  }

  push(value: T, priority: P): void {
    this.items.push({ value, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.items[i].priority, this.items[parent].priority)) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    if (!top) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < this.items.length && this.less(this.items[l].priority, this.items[smallest].priority)) smallest = l;
        if (r < this.items.length && this.less(this.items[r].priority, this.items[smallest].priority)) smallest = r;
        if (smallest === i) break;
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
export function hoursFrom(origin: AxialCoord, ctx: PathContext, maxHours: number): Map<string, number> {
  const best = new Map<string, number>([[coordKey(origin), 0]]);
  const settled = new Set<string>();
  const open = new MinHeap<AxialCoord>();
  open.push(origin, 0);

  while (open.size > 0 && settled.size < MAX_TINT_HEXES) {
    const current = open.pop()!;
    const currentKey = coordKey(current);
    if (settled.has(currentKey)) continue;
    settled.add(currentKey);
    const currentHours = best.get(currentKey)!;

    for (const neighbour of neighbors(current)) {
      const neighbourKey = coordKey(neighbour);
      if (settled.has(neighbourKey)) continue;

      const cost = halfAndHalf(current, neighbour, ctx);
      if (cost === null) continue;

      const hours = currentHours + cost / ctx.hexesPerHour;
      if (hours > maxHours) continue;

      const existing = best.get(neighbourKey);
      if (existing !== undefined && existing <= hours) continue;

      // Bound the result set itself, not just how many nodes get settled —
      // otherwise a wide-open frontier can still enqueue (and report) more
      // than MAX_TINT_HEXES hexes before the settled-count check above ever
      // trips.
      if (existing === undefined && best.size >= MAX_TINT_HEXES) continue;

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
export function reachableRange(
  origin: AxialCoord,
  home: AxialCoord,
  hoursOfFood: number,
  ctx: PathContext,
): Map<string, number> {
  const result = new Map<string, number>();
  if (hoursOfFood <= 0) return result;

  const sameOrigin = origin.q === home.q && origin.r === home.r;
  const fromOrigin = hoursFrom(origin, ctx, hoursOfFood);
  const fromHome = sameOrigin ? fromOrigin : hoursFrom(home, ctx, hoursOfFood);

  for (const [key, outHours] of fromOrigin) {
    const backHours = sameOrigin ? outHours : fromHome.get(key);
    if (backHours === undefined) continue;

    const total = outHours + backHours;
    if (total <= hoursOfFood) result.set(key, total);
  }

  return result;
}

/** Hard cap on hexes `findPath` expands, the twin of `HexPathfinder.MaxExpandedNodes`. */
export const MAX_EXPANDED_NODES = 250_000;

/**
 * Open-set order of `findPath`, ascending (the C# twin is `HexPathfinder.OpenKey`): f = g + h, then h (of two equal-f
 * hexes the one further along goes first), then the hex's distance from the straight start-to-goal line (axial cross
 * product), then q, then r so the order never depends on heap internals.
 */
type OpenKey = readonly [f: number, h: number, lineDeviation: number, q: number, r: number];

function openKey(n: AxialCoord, g: number, from: AxialCoord, to: AxialCoord): OpenKey {
  const h = hexDistance(n, to);
  const deviation = Math.abs((n.q - from.q) * (to.r - from.r) - (n.r - from.r) * (to.q - from.q));
  return [g + h, h, deviation, n.q, n.r];
}

function openKeyLess(a: OpenKey, b: OpenKey): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

/**
 * Cheapest land route from `from` to `to` (both included), or `null` if there is none: the TS
 * twin of `HexPathfinder.FindPath` for land armies. Same A* (plain hex distance as the
 * heuristic), same endpoint check (both must be land terrain),
 * same open-set order (f, then h, then distance from the start-to-goal line, then q and r), same bounding box (the endpoints padded by their distance, at least 10) and expansion cap.
 * The route is smoothed afterwards (see `aStar`). Prices exactly what the backend does; `ctx.restrictions` can add a palisade or (preview tool only) switch a rule off.
 */
export function findPath(from: AxialCoord, to: AxialCoord, ctx: PathContext): AxialCoord[] | null {
  return drain(findPathSteps(from, to, ctx));
}

/** `findPath` as a generator: yields every `SLICE_EXPANSIONS` expansions so a caller can spread the search over time; returns the route. */
export function findPathSteps(from: AxialCoord, to: AxialCoord, ctx: PathContext): PathSearch {
  if (ctx.rules.land[ctx.terrainAt(from)] === undefined || ctx.rules.land[ctx.terrainAt(to)] === undefined) return doneSearch(null);
  return aStar(from, to, (a, b) => halfAndHalf(a, b, ctx));
}

/** A route search that can be paused: yields now and then, returns the route (or `null`) when finished. */
export type PathSearch = Generator<void, AxialCoord[] | null, void>;

/** Expansions between two yields of a sliced search. */
export const SLICE_EXPANSIONS = 1024;

/** Hexes the reverse reachability probe visits at most before it gives up and lets the real search decide. */
export const REVERSE_PROBE_NODES = 4096;

function* doneSearch(path: AxialCoord[] | null): PathSearch {
  return path;
}

function drain(search: PathSearch): AxialCoord[] | null {
  for (let r = search.next(); ; r = search.next()) if (r.done) return r.value;
}

/**
 * The one A* loop behind `findPath` and `findSeaPath` (the backend's `HexPathfinder.FindPath` is likewise one loop with two cost
 * tables): plain hex distance as the heuristic, the endpoints padded by their distance (at least 10) as the bounding box, and
 * `MAX_EXPANDED_NODES` as the expansion cap. `step` prices the move between two neighbours, `null` when it is impassable.
 * The route found is smoothed (`smooth`) before it is returned.
 */
function* aStar(
  from: AxialCoord,
  to: AxialCoord,
  step: (a: AxialCoord, b: AxialCoord) => number | null,
): PathSearch {
  if (from.q === to.q && from.r === to.r) return [from];

  const padding = Math.max(10, hexDistance(from, to));
  const qMin = Math.min(from.q, to.q) - padding;
  const qMax = Math.max(from.q, to.q) + padding;
  const rMin = Math.min(from.r, to.r) - padding;
  const rMax = Math.max(from.r, to.r) + padding;

  // Fail fast for an unreachable goal (an inland hex for a fleet, a walled-in camp): a small flood fill backwards from the goal over
  // the same box. The search below never leaves that box, so if the flood runs dry without meeting `from`, no route exists and the
  // 250,000-node search would only prove it slowly. A flood that hits its cap says nothing, and the real search decides.
  if (!reverseProbeMayReach(from, to, step, qMin, qMax, rMin, rMax)) return null;

  const open = new MinHeap<AxialCoord, OpenKey>(openKeyLess);
  const g = new Map<string, number>([[coordKey(from), 0]]);
  const cameFrom = new Map<string, AxialCoord>();
  const closed = new Set<string>();
  open.push(from, openKey(from, 0, from, to));
  let expanded = 0;

  for (let current = open.pop(); current; current = open.pop()) {
    const currentKey = coordKey(current);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.q === to.q && current.r === to.r) {
      const path = [current];
      for (let k = cameFrom.get(currentKey); k; k = cameFrom.get(coordKey(k))) path.push(k);
      return smooth(path.reverse(), step);
    }
    if (++expanded > MAX_EXPANDED_NODES) return null;
    if (expanded % SLICE_EXPANSIONS === 0) yield;

    for (const n of neighbors(current)) {
      if (n.q < qMin || n.q > qMax || n.r < rMin || n.r > rMax) continue;
      const nKey = coordKey(n);
      if (closed.has(nKey)) continue;
      const cost = step(current, n);
      if (cost === null) continue;
      const tentative = g.get(currentKey)! + cost;
      const existing = g.get(nKey);
      if (existing !== undefined && tentative >= existing) continue;
      g.set(nKey, tentative);
      cameFrom.set(nKey, current);
      open.push(n, openKey(n, tentative, from, to));
    }
  }
  return null;
}

/**
 * Straightens an A* route (the twin of `HexPathfinder.Smooth`): from each hex it takes the furthest later hex whose straight hex line
 * is fully passable and costs no more (by `step`, 1e-9 slack) than the stretch of the route it replaces, and walks that line instead.
 * The result is still hex by hex, never dearer than `path`, and on open sea one straight line instead of two legs with a corner.
 * Stops at the first later hex that fails, so it stays O(n * stretch).
 */
function smooth(
  path: AxialCoord[],
  step: (a: AxialCoord, b: AxialCoord) => number | null,
): AxialCoord[] {
  const n = path.length;
  if (n < 3) return path;
  const prefix: number[] = [0];
  for (let k = 1; k < n; k++) prefix.push(prefix[k - 1]! + (step(path[k - 1]!, path[k]!) ?? 0));
  const out: AxialCoord[] = [path[0]!];
  let i = 0;
  while (i < n - 1) {
    let best = i + 1;
    let bestLine: AxialCoord[] | null = null;
    for (let j = i + 2; j < n; j++) {
      const line = hexLine(path[i]!, path[j]!);
      let c = 0;
      let ok = true;
      for (let k = 1; k < line.length; k++) {
        const s = step(line[k - 1]!, line[k]!);
        if (s === null) {
          ok = false;
          break;
        }
        c += s;
      }
      if (ok && c <= prefix[j]! - prefix[i]! + 1e-9) {
        best = j;
        bestLine = line;
      } else break;
    }
    if (bestLine === null) out.push(path[i + 1]!);
    else for (let k = 1; k < bestLine.length; k++) out.push(bestLine[k]!);
    i = best;
  }
  return out;
}

/** False only when a flood backwards from `to` (edge n to cur priced by `step(n, cur)`) runs dry inside the box without reaching `from`. */
function reverseProbeMayReach(
  from: AxialCoord,
  to: AxialCoord,
  step: (a: AxialCoord, b: AxialCoord) => number | null,
  qMin: number,
  qMax: number,
  rMin: number,
  rMax: number,
): boolean {
  const seen = new Set<string>([coordKey(to)]);
  const queue: AxialCoord[] = [to];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of neighbors(cur)) {
      if (n.q < qMin || n.q > qMax || n.r < rMin || n.r > rMax) continue;
      const k = coordKey(n);
      if (seen.has(k) || step(n, cur) === null) continue;
      if (n.q === from.q && n.r === from.r) return true;
      seen.add(k);
      if (seen.size >= REVERSE_PROBE_NODES) return true;
      queue.push(n);
    }
  }
  return false;
}

/** Terrain-and-river cost of walking `path`, in hex-cost units: every step is half the leave price of the hex left plus half the enter price of the hex entered; `Infinity` through an impassable hex. */
export function pathCost(path: readonly AxialCoord[], ctx: PathContext): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += halfAndHalf(path[i - 1]!, path[i]!, ctx) ?? Number.POSITIVE_INFINITY;
  return total;
}

/** Every hex reachable from `origin` (origin included) under `ctx`'s rules, as `coordKey`s, capped at `limit` hexes. */
export function reachableFrom(origin: AxialCoord, ctx: PathContext, limit = 200_000): Set<string> {
  const seen = new Set<string>([coordKey(origin)]);
  const queue: AxialCoord[] = [origin];
  for (let i = 0; i < queue.length && seen.size < limit; i++) {
    // An origin that cannot be left (a plain mountain) reaches nothing but itself.
    if (leaveCost(queue[i]!, ctx) === null) continue;
    for (const n of neighbors(queue[i]!)) {
      const k = coordKey(n);
      if (seen.has(k) || stepCost(n, ctx) === null) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

/**
 * What a fleet pays for a sand hex at either end of its route (a beach to land on or push off from): twice a sea hex
 * (`HexPathfinder.FleetSandCost`).
 */
export const FLEET_SAND_COST = 2.0;

/** The price of a fleet's land endpoint (a harbour or beaching hex): 1.0, except sand (`HexPathfinder.FleetLandEndpointCost`). */
function fleetEndpointCost(terrain: Terrain): number {
  return terrain === 'sand' ? FLEET_SAND_COST : 1.0;
}

/**
 * Price of the step from `a` to its neighbour `b` for a fleet, the TS twin of the backend's search: half the leave price of `a` (sea 1,
 * or the land-endpoint price for the harbour it starts from) plus half the enter price of `b` (sea 1; the goal, whatever it is, at the land-endpoint
 * price); `null` when `b` is neither sea nor the goal.
 */
function fleetStepCost(
  a: AxialCoord,
  b: AxialCoord,
  from: AxialCoord,
  to: AxialCoord,
  terrainAt: (c: AxialCoord) => Terrain,
): number | null {
  const isGoal = b.q === to.q && b.r === to.r;
  const enterTerrain = terrainAt(b);
  if (!isGoal && enterTerrain !== 'sea') return null;
  const enter = enterTerrain === 'sea' ? 1 : fleetEndpointCost(enterTerrain);
  // Only the start can be land: every other hex a route leaves is sea.
  const leave = a.q === from.q && a.r === from.r ? fleetEndpointCost(terrainAt(a)) : 1;
  return (leave + enter) / 2;
}

/**
 * Shortest route for a fleet from `from` to `to` (both included), or `null` if there is none: the TS twin of `HexPathfinder.FindPath`
 * for ships. Open sea costs a flat 1.0 per hex (`SeaTerrainCost`), a sand endpoint `FLEET_SAND_COST`, and the two endpoints are exempt
 * from the sea-only rule (a harbour or beaching hex, the shore a fleet is sent at), so every hex in between has to be sea. Same
 * bounding box and expansion cap as `findPath`, and the route is smoothed the same way (one straight line across open sea).
 */
export function findSeaPath(
  from: AxialCoord,
  to: AxialCoord,
  terrainAt: (c: AxialCoord) => Terrain,
): AxialCoord[] | null {
  return drain(findSeaPathSteps(from, to, terrainAt));
}

/** `findSeaPath` as a generator, see `findPathSteps`. */
export function findSeaPathSteps(from: AxialCoord, to: AxialCoord, terrainAt: (c: AxialCoord) => Terrain): PathSearch {
  return aStar(from, to, (a, b) => fleetStepCost(a, b, from, to, terrainAt));
}

/** Cost of sailing `path` (from `findSeaPath`), in hex-cost units (sea hex = 1): the sum of its steps' `fleetStepCost`. */
export function seaPathCost(path: readonly AxialCoord[], terrainAt: (c: AxialCoord) => Terrain): number {
  const from = path[0];
  const to = path[path.length - 1];
  if (!from || !to) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) total += fleetStepCost(path[i - 1]!, path[i]!, from, to, terrainAt) ?? Number.POSITIVE_INFINITY;
  return total;
}
