// Issue #159 part B: the client-side range tint. Pure, dependency-free (same
// spirit as lib/units/armyDispatch.ts) so it can run every provisions-slider
// tick with no round trip — but it mirrors HexPathfinder.cs's own cost model
// hex for hex: additive-on-entry terrain + river cost, sea impassable to land
// units, no distance-circle shortcut. `rules` always comes from the backend
// (`WorldResponse.movement`), never a hardcoded literal here, so this and the
// server can't quietly drift apart — see hexPath.golden.test.ts.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import type { Terrain } from './types';

export interface MovementRules {
  /** Per-terrain step cost for land units, keyed by wire terrain name. `sea` is absent — impassable. */
  land: Record<string, number>;
  /** Flat penalty, on top of terrain cost, for entering a river hex — HexPathfinder.RiverCrossingCost. */
  riverCrossingCost: number;
}

export interface PathContext {
  terrainAt(c: AxialCoord): Terrain;
  isRiver(c: AxialCoord): boolean;
  rules: MovementRules;
  /** Army speed (hexes/hour) already scaled by the world's speedFactor. */
  hexesPerHour: number;
}

/**
 * Hard cap on hexes a single flood-fill may visit — mirrors
 * `HexPathfinder.MaxExpandedNodes`'s role server-side: a belt-and-braces
 * bound against a pathological search, not the primary limiter (that's
 * `maxHours`/`hoursOfFood`, which terminates the fill naturally for any
 * realistic army).
 */
export const MAX_TINT_HEXES = 4000;

/** Step cost for a land unit entering `c`, or `null` if impassable (sea). */
function stepCost(c: AxialCoord, ctx: PathContext): number | null {
  const terrain = ctx.terrainAt(c);
  const base = ctx.rules.land[terrain];
  if (base === undefined) return null;
  return ctx.isRiver(c) ? base + ctx.rules.riverCrossingCost : base;
}

/** Binary min-heap keyed by priority — Dijkstra's usual decrease-key stand-in (push a new entry, ignore stale pops). */
class MinHeap<T> {
  private items: { priority: number; value: T }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: T, priority: number): void {
    this.items.push({ value, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
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
        if (l < this.items.length && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < this.items.length && this.items[r].priority < this.items[smallest].priority) smallest = r;
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

      const cost = stepCost(neighbour, ctx);
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
 * `hoursFrom(origin, X) + hoursFrom(home, X)`, not the cost of an actual
 * round-trip path (which would double-count or skip the origin/destination
 * hex's own terrain cost depending on direction, since cost is charged on
 * entry — see `HexPathfinder`'s remarks on why); two independent one-way
 * fills summed is the model the issue specifies, and it collapses to the
 * useful special case on its own: for an ordinary dispatch `origin === home`,
 * so both fills are literally the same computation and the sum is just
 * `2 × hoursFrom(origin, X)`.
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
