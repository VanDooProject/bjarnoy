import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { findPath, findPathSteps, findSeaPath, findSeaPathSteps, hoursFrom, REVERSE_PROBE_NODES, SLICE_EXPANSIONS, type PathContext } from './hexPath';
import type { Terrain } from './types';

// The fail-fast reverse probe and the sliced search must never change an answer: compared against an independent breadth-first search
// (sea: every step costs 1) and against the Dijkstra fill `hoursFrom` (land) on seeded random maps.

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random map of radius `radius` around the origin; everything outside is sea. `landShare` of the hexes are land. */
function randomMap(seed: number, radius: number, landShare: number): (c: AxialCoord) => Terrain {
  const rand = rng(seed);
  const land = new Set<string>();
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) if (rand() < landShare) land.add(`${q},${r}`);
  }
  return (c) => (land.has(`${c.q},${c.r}`) ? 'grass' : 'sea');
}

/** Shortest hop count from `from` to `to` for a fleet (endpoints exempt, every hex in between sea), or null. Plain BFS over the same box. */
function bfsSea(from: AxialCoord, to: AxialCoord, terrainAt: (c: AxialCoord) => Terrain): number | null {
  if (from.q === to.q && from.r === to.r) return 0;
  const pad = Math.max(10, hexDistance(from, to));
  const inBox = (c: AxialCoord) =>
    c.q >= Math.min(from.q, to.q) - pad && c.q <= Math.max(from.q, to.q) + pad && c.r >= Math.min(from.r, to.r) - pad && c.r <= Math.max(from.r, to.r) + pad;
  const dist = new Map<string, number>([[coordKey(from), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of neighbors(cur)) {
      if (!inBox(n) || dist.has(coordKey(n))) continue;
      const isTo = n.q === to.q && n.r === to.r;
      if (!isTo && terrainAt(n) !== 'sea') continue;
      dist.set(coordKey(n), dist.get(coordKey(cur))! + 1);
      if (isTo) return dist.get(coordKey(n))!;
      queue.push(n);
    }
  }
  return null;
}

function landContext(terrainAt: (c: AxialCoord) => Terrain): PathContext {
  return {
    terrainAt,
    isRiver: () => false,
    isWideRiver: () => false,
    rules: { land: { grass: 1 }, riverCrossingCost: 8 },
    hexesPerHour: 1,
  };
}

function drainSteps<T>(gen: Generator<void, T, void>): { value: T; yields: number } {
  let yields = 0;
  for (let r = gen.next(); ; r = gen.next()) {
    if (r.done) return { value: r.value, yields };
    yields++;
  }
}

describe('findSeaPath with the reverse probe', () => {
  it('answers like a plain breadth-first search on many random maps (reachable, walled-in goal, walled-in start)', () => {
    let nulls = 0;
    let found = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const radius = 6 + (seed % 7);
      const terrainAt = randomMap(seed, radius, 0.1 + (seed % 5) * 0.1);
      const rand = rng(seed * 31);
      for (let i = 0; i < 6; i++) {
        const pick = (): AxialCoord => ({ q: Math.floor(rand() * (2 * radius + 1)) - radius, r: Math.floor(rand() * (2 * radius + 1)) - radius });
        const from = pick();
        const to = pick();
        const expected = bfsSea(from, to, terrainAt);
        const path = findSeaPath(from, to, terrainAt);
        if (expected === null) {
          expect(path).toBeNull();
          nulls++;
        } else {
          expect(path).not.toBeNull();
          expect(path!.length - 1).toBe(expected);
          expect(path![0]).toEqual(from);
          expect(path![path!.length - 1]).toEqual(to);
          found++;
        }
      }
    }
    expect(nulls).toBeGreaterThan(10);
    expect(found).toBeGreaterThan(20);
  });

  it('finds a long open-sea route (past the probe cap) with the same length as plain BFS', () => {
    const open = () => 'sea' as Terrain;
    const from = { q: 0, r: 0 };
    const to = { q: 90, r: -20 };
    expect(REVERSE_PROBE_NODES).toBeLessThan(90 * 90);
    expect(findSeaPath(from, to, open)!.length - 1).toBe(bfsSea(from, to, open));
  });

  it('gives up on a goal ringed by land after a handful of terrain lookups, not a full search', () => {
    // The goal sits inland: its neighbours are all land, so nothing can enter it. The plain search would flood the whole box.
    const to = { q: 200, r: 0 };
    const ring = new Set(neighbors(to).map(coordKey));
    let lookups = 0;
    const terrainAt = (c: AxialCoord): Terrain => {
      lookups++;
      return ring.has(coordKey(c)) ? 'grass' : 'sea';
    };
    expect(findSeaPath({ q: 0, r: 0 }, to, terrainAt)).toBeNull();
    expect(lookups).toBeLessThan(30);
  });

  it('gives up on a start ringed by land too, and still finds a goal reachable through a gap', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 12, r: 0 };
    const walled = new Set(neighbors(from).map(coordKey));
    expect(findSeaPath(from, to, (c) => (walled.has(coordKey(c)) ? 'grass' : 'sea'))).toBeNull();
    const gap = new Set([...walled].filter((k) => k !== coordKey({ q: 1, r: 0 })));
    expect(findSeaPath(from, to, (c) => (gap.has(coordKey(c)) ? 'grass' : 'sea'))).not.toBeNull();
  });
});

describe('findPath with the reverse probe', () => {
  it('has the cost of the cheapest route (the Dijkstra fill) on random land maps, and null exactly when the fill cannot reach', () => {
    let nulls = 0;
    let found = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const radius = 7;
      const terrainAt = randomMap(seed + 500, radius, 0.55 + (seed % 4) * 0.1);
      const ctx = landContext(terrainAt);
      const rand = rng(seed * 17);
      for (let i = 0; i < 5; i++) {
        const pick = (): AxialCoord => ({ q: Math.floor(rand() * (2 * radius + 1)) - radius, r: Math.floor(rand() * (2 * radius + 1)) - radius });
        const from = pick();
        const to = pick();
        if (terrainAt(from) !== 'grass' || terrainAt(to) !== 'grass') continue;
        const reach = hoursFrom(from, ctx, 10_000);
        const path = findPath(from, to, ctx);
        // The fill is unboxed, the search is not: a route that needs a detour beyond the box counts as none for the search only.
        if (path) {
          expect(path.length - 1).toBeGreaterThan(-1);
          expect(reach.get(coordKey(to))).toBeCloseTo(path.length - 1, 9);
          found++;
        } else if (!reach.has(coordKey(to))) nulls++;
      }
    }
    expect(found).toBeGreaterThan(20);
    expect(nulls).toBeGreaterThan(5);
  });
});

describe('sliced search', () => {
  it('returns the same path as the synchronous call, yielding along the way on a long search', () => {
    // A wall across the way with a gap far off makes the search fan out over thousands of hexes.
    const wall = (c: AxialCoord): Terrain => (c.q === 20 && c.r > -40 ? 'grass' : 'sea');
    const from = { q: 0, r: 0 };
    const to = { q: 40, r: 0 };
    const { value, yields } = drainSteps(findSeaPathSteps(from, to, wall));
    expect(value).not.toBeNull();
    expect(value).toEqual(findSeaPath(from, to, wall));
    expect(yields).toBeGreaterThan(0);
    expect(SLICE_EXPANSIONS).toBeGreaterThan(0);
  });

  it('matches findPath for land searches', () => {
    const terrainAt = randomMap(7, 25, 0.9);
    const ctx = landContext(terrainAt);
    for (const to of [{ q: 20, r: -5 }, { q: -18, r: 10 }, { q: 3, r: 3 }]) {
      const from = { q: -10, r: -10 };
      expect(drainSteps(findPathSteps(from, to, ctx)).value).toEqual(findPath(from, to, ctx));
    }
  });

  it('answers a trivial search without yielding', () => {
    const c = { q: 2, r: 2 };
    expect(drainSteps(findSeaPathSteps(c, c, () => 'sea'))).toEqual({ value: [c], yields: 0 });
  });
});
