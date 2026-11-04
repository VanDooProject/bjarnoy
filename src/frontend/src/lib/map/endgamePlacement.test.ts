import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import {
  GatesPerRing,
  MaxTowers,
  MinTowerSpacing,
  MinTowers,
  RingBands,
  naturalLoop,
  withoutChords,
  placeEndgame,
  ring,
  towerCountFor,
  insideLoop,
} from './endgamePlacement';
import { tileOfWallHex } from './palisadeTiles';
import type { Terrain } from './types';

// A flat wasteland disc around Utgard at the origin (radius `radius`), everything else sea.
function disc(radius: number, override: Record<string, Terrain> = {}) {
  const tiles: AxialCoord[] = [];
  const terrain = new Map<string, Terrain>();
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      tiles.push({ q, r });
      terrain.set(coordKey({ q, r }), 'grass');
    }
  }
  for (const [k, t] of Object.entries(override)) terrain.set(k, t);
  return { tiles, terrainOf: (c: AxialCoord): Terrain => terrain.get(coordKey(c)) ?? 'sea' };
}

const UTGARD = [{ anchor: { q: 0, r: 0 }, family: "giantutgard" }];
const none = () => false;

describe('towerCountFor', () => {
  it('rounds half up (never to even) and clamps to 3..6', () => {
    expect(towerCountFor(150)).toBe(MinTowers);
    expect(towerCountFor(419)).toBe(3);
    expect(towerCountFor(420)).toBe(4);
    expect(towerCountFor(540)).toBe(5);
    expect(towerCountFor(660)).toBe(MaxTowers);
    expect(towerCountFor(100000)).toBe(MaxTowers);
  });
});

const ORIGIN = { q: 0, r: 0 };
// A disc and seeds where the sampling happens to pick one tower inside the outer line (found by scanning; nothing forces it).
const BETWEEN = { radius: 12, seed: 32, islandIndex: 4 };
const footprintKeys: ReadonlySet<string> = new Set([ORIGIN, ...neighbors(ORIGIN)].map(coordKey));

/** True when the hexes form one simple cycle: each adjacent to the next (cyclically), no two others adjacent or equal. */
function isSimpleCycle(c: AxialCoord[]): boolean {
  const n = c.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const consecutive = j === i + 1 || (i === 0 && j === n - 1);
      const d = hexDistance(c[i]!, c[j]!);
      if (consecutive ? d !== 1 : d <= 1) return false;
    }
  }
  return true;
}

/** Both loops the way `placeWalls` computes them: the outer one keeps clear of the inner one. */
function loops(terrainOf: (c: AxialCoord) => Terrain, seed: number) {
  const inner = naturalLoop(ORIGIN, 'inner', terrainOf, none, footprintKeys, seed);
  const near = new Set(inner.flatMap((h) => [h, ...neighbors(h)]).map(coordKey));
  const outer = naturalLoop(ORIGIN, 'outer', terrainOf, none, footprintKeys, seed, near);
  return { inner, outer };
}

describe('ring', () => {
  it.each([3, 6])('radius %i is a closed cycle of 6r hexes, each adjacent to the next', (radius) => {
    const hexes = ring({ q: 2, r: -1 }, radius);
    expect(hexes).toHaveLength(6 * radius);
    expect(new Set(hexes.map(coordKey)).size).toBe(6 * radius);
    hexes.forEach((h, i) => {
      expect(hexDistance(h, { q: 2, r: -1 })).toBe(radius);
      expect(hexDistance(h, hexes[(i + 1) % hexes.length]!)).toBe(1);
    });
  });
});

describe('withoutChords', () => {
  it('leaves a simple cycle untouched', () => {
    const hexes = ring(ORIGIN, 3);
    expect(withoutChords(hexes)).toEqual(hexes);
  });

  it('cuts a bump whose extra hex touches the line again', () => {
    const hexes = ring(ORIGIN, 3);
    const bump = neighbors(hexes[4]!).find((h) => hexDistance(h, ORIGIN) === 4 && hexDistance(h, hexes[5]!) === 1)!;
    const bumped = [...hexes.slice(0, 5), bump, ...hexes.slice(5)];

    const result = withoutChords(bumped);

    expect(isSimpleCycle(result)).toBe(true);
    expect(result.length).toBeLessThan(bumped.length);
    for (const h of result) expect(bumped.map(coordKey)).toContain(coordKey(h));
  });

  it('removes a spur that walks out and back over the same hex', () => {
    const hexes = ring(ORIGIN, 3);
    const spur = neighbors(hexes[5]!).find((h) => hexDistance(h, ORIGIN) === 4)!;
    const result = withoutChords([...hexes.slice(0, 6), spur, hexes[5]!, ...hexes.slice(6)]);

    expect(isSimpleCycle(result)).toBe(true);
    expect(result.map(coordKey).sort()).toEqual(hexes.map(coordKey).sort());
  });
});

describe('naturalLoop', () => {
  it('is a simple cycle inside its band, and the outer one never comes within a hex of the inner one', () => {
    for (const seed of [1, 7, 23]) {
      const { terrainOf } = disc(16);
      const { inner, outer } = loops(terrainOf, seed);
      expect(inner.length).toBeGreaterThan(0);
      expect(outer.length).toBeGreaterThan(0);
      expect(isSimpleCycle(inner)).toBe(true);
      expect(isSimpleCycle(outer)).toBe(true);
      for (const h of inner) expect(hexDistance(h, ORIGIN)).toBeGreaterThanOrEqual(RingBands.inner[0]);
      for (const h of inner) expect(hexDistance(h, ORIGIN)).toBeLessThanOrEqual(RingBands.inner[1]);
      for (const h of outer) {
        expect(hexDistance(h, ORIGIN)).toBeGreaterThanOrEqual(RingBands.outer[0]);
        expect(hexDistance(h, ORIGIN)).toBeLessThanOrEqual(RingBands.outer[1]);
        for (const i of inner) expect(hexDistance(h, i)).toBeGreaterThan(1);
      }
    }
  });

  it('runs through a mountain cluster in the band instead of round it', () => {
    const flat = naturalLoop(ORIGIN, 'inner', disc(16).terrainOf, none, footprintKeys, 11);
    const centre = flat[Math.floor(flat.length / 3)]!;
    const cluster = [centre, ...neighbors(centre)];
    const { terrainOf } = disc(16, Object.fromEntries(cluster.map((h) => [coordKey(h), 'mountain' as Terrain])));

    const loop = naturalLoop(ORIGIN, 'inner', terrainOf, none, footprintKeys, 11);

    const keys = new Set(cluster.map(coordKey));
    expect(loop.filter((h) => keys.has(coordKey(h))).length).toBeGreaterThanOrEqual(3);
  });

  it('hugs the coast of an island that is mostly sea in its band', () => {
    const { terrainOf } = disc(5);
    const loop = naturalLoop(ORIGIN, 'inner', terrainOf, none, footprintKeys, 3);
    expect(loop.length).toBeGreaterThan(0);
    expect(loop.filter((h) => terrainOf(h) !== 'sea').length).toBeGreaterThanOrEqual(12);
  });

  it('is deterministic', () => {
    const { terrainOf } = disc(16);
    expect(loops(terrainOf, 5)).toEqual(loops(terrainOf, 5));
  });
});

describe('placeEndgame', () => {
  it('builds nothing for an island without Utgard', () => {
    const { tiles, terrainOf } = disc(12);
    const sites = placeEndgame(tiles, terrainOf, none, [{ anchor: ORIGIN, family: 'giantvolcano' }], new Set(), 1, 1);
    expect(sites).toEqual({ walls: [], towers: [] });
  });

  it('closes both rings all the way round on open ground: inner level 2, outer level 1, two gates each on straights', () => {
    for (const seed of [7, 11, 23]) {
      const { tiles, terrainOf } = disc(16);
      const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), seed, 3);
      const { inner, outer } = loops(terrainOf, seed + 3 * 400_009);

      const innerWalls = walls.filter((w) => w.ring === 'inner');
      const outerWalls = walls.filter((w) => w.ring === 'outer');
      expect(innerWalls.map((w) => coordKey(w.coord)).sort()).toEqual(inner.map(coordKey).sort());
      expect(outerWalls.map((w) => coordKey(w.coord)).sort()).toEqual(outer.map(coordKey).sort());
      expect(innerWalls.every((w) => w.level === 2)).toBe(true);
      expect(outerWalls.every((w) => w.level === 1)).toBe(true);
      for (const kind of ['inner', 'outer'] as const) {
        const gates = walls.filter((w) => w.ring === kind && w.isGate);
        expect(gates).toHaveLength(GatesPerRing);
        expect(gates.every((g) => g.piece === 'gate180')).toBe(true);
      }
      // A closed ring has no ends.
      expect(walls.some((w) => w.piece === 'end' || w.piece === 'end_coast')).toBe(false);
      // The two rings never touch.
      for (const o of outerWalls) for (const i of innerWalls) expect(hexDistance(o.coord, i.coord)).toBeGreaterThan(1);
    }
  });

  it('puts the two gates of a ring as far apart along the loop as its straights allow', () => {
    const { tiles, terrainOf } = disc(16);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 11, 5);
    const order = loops(terrainOf, 11 + 5 * 400_009);
    for (const kind of ['inner', 'outer'] as const) {
      const hexes = order[kind];
      const n = hexes.length;
      const at = (c: AxialCoord) => hexes.findIndex((h) => h.q === c.q && h.r === c.r);
      const cyclic = (a: number, b: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));
      const [a, b] = walls.filter((w) => w.ring === kind && w.isGate).map((g) => at(g.coord));
      const straights = walls.filter((w) => w.ring === kind && (w.isGate || w.piece === 'straight180')).map((w) => at(w.coord));
      let best = 0;
      for (const x of straights) for (const y of straights) best = Math.max(best, cyclic(x, y));
      expect(cyclic(a!, b!)).toBe(best);
    }
  });

  it('skips a ring that has less than 60% wall-capable hexes, and builds the other', () => {
    // Sea over the whole outer band: only the inner ring has land to stand on.
    const override: Record<string, Terrain> = {};
    for (let d = RingBands.outer[0]; d <= RingBands.outer[1]; d++) for (const h of ring(ORIGIN, d)) override[coordKey(h)] = 'sea';
    const { tiles, terrainOf } = disc(14, override);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 2, 2);

    expect(new Set(walls.map((w) => w.ring))).toEqual(new Set(['inner']));
  });

  it('still builds a ring along the coast of a small island whose band is mostly sea', () => {
    const { tiles, terrainOf } = disc(5);
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 4, 4);
    const inner = walls.filter((w) => w.ring === 'inner');

    expect(inner.length).toBeGreaterThan(0);
    expect(inner.filter((w) => terrainOf(w.coord) !== 'sea').length).toBeGreaterThanOrEqual(12);
    expect(walls.every((w) => w.ring === 'inner')).toBe(true);
  });

  it('uses a mountain cluster in the band as part of the line: no walls on it, the ring still stands', () => {
    const flat = naturalLoop(ORIGIN, 'inner', disc(16).terrainOf, none, footprintKeys, 11);
    const centre = flat[Math.floor(flat.length / 3)]!;
    const cluster = [centre, ...neighbors(centre)];
    const { tiles, terrainOf } = disc(16, Object.fromEntries(cluster.map((h) => [coordKey(h), 'mountain' as Terrain])));
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 11, 0);

    expect(walls.some((w) => w.ring === 'inner')).toBe(true);
    expect(walls.some((w) => terrainOf(w.coord) === 'mountain')).toBe(false);
  });

  it('keeps walls off rivers, camps and giant footprints', () => {
    const { tiles, terrainOf } = disc(16);
    const { inner } = loops(terrainOf, 4 + 4 * 400_009);
    const river = inner[3]!;
    const camp = inner[10]!;
    const sites = placeEndgame(tiles, terrainOf, (c) => c.q === river.q && c.r === river.r, UTGARD, new Set([coordKey(camp)]), 4, 4);
    const keys = new Set(sites.walls.map((w) => coordKey(w.coord)));
    expect(keys.has(coordKey(river))).toBe(false);
    expect(keys.has(coordKey(camp))).toBe(false);
    for (const k of footprintKeys) expect(keys.has(k)).toBe(false);
  });

  it('resolves every piece through the palisade rules on the final wall', () => {
    const { tiles, terrainOf } = disc(14, { '6,-3': 'mountain', '-3,0': 'mountain' });
    const { walls } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 9, 9);
    const set = { walls: new Set(walls.map((w) => coordKey(w.coord))), gates: new Set(walls.filter((w) => w.isGate).map((w) => coordKey(w.coord))) };

    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const tile = tileOfWallHex(w.coord, set, terrainOf);
      expect('piece' in tile && tile.piece === w.piece && tile.dir === w.dir).toBe(true);
    }
  });

  it('is deterministic', () => {
    const { tiles, terrainOf } = disc(16);
    const a = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 5, 8);
    expect(placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 5, 8)).toEqual(a);
  });

  it('spreads the towers over land outside the inner band, off walls and their neighbours, MinTowerSpacing apart, off camps, and deterministically', () => {
    const { tiles, terrainOf } = disc(24);
    const camp = coordKey({ q: 16, r: -4 });
    const a = placeEndgame(tiles, terrainOf, none, UTGARD, new Set([camp]), 5, 8);
    const b = placeEndgame(tiles, terrainOf, none, UTGARD, new Set([camp]), 5, 8);

    const wallKeys = new Set(a.walls.map((w) => coordKey(w.coord)));
    expect(a).toEqual(b);
    expect(a.towers).toHaveLength(towerCountFor(tiles.length));
    for (const t of a.towers) {
      expect(hexDistance(t, ORIGIN)).toBeGreaterThan(RingBands.inner[1] + 1);
      expect(coordKey(t)).not.toBe(camp);
      expect(wallKeys.has(coordKey(t))).toBe(false);
      for (const n of neighbors(t)) expect(wallKeys.has(coordKey(n))).toBe(false);
    }
    for (let i = 0; i < a.towers.length; i++) {
      for (let j = i + 1; j < a.towers.length; j++) expect(hexDistance(a.towers[i]!, a.towers[j]!)).toBeGreaterThanOrEqual(MinTowerSpacing);
    }
  });

  it('may put a tower between the two wall lines when a small island leaves room there', () => {
    const { tiles, terrainOf } = disc(BETWEEN.radius);
    const { walls, towers } = placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), BETWEEN.seed, BETWEEN.islandIndex);
    const nearestOuterWall = Math.min(...walls.filter((w) => w.ring === 'outer').map((w) => hexDistance(w.coord, ORIGIN)));

    expect(walls.some((w) => w.ring === 'outer')).toBe(true);
    expect(towers.some((t) => hexDistance(t, ORIGIN) < nearestOuterWall)).toBe(true);
  });

  it('puts the first tower between the two lines when there is room there, and keeps the old order when there is none', () => {
    const wide = disc(24);
    const withRoom = placeEndgame(wide.tiles, wide.terrainOf, none, UTGARD, new Set(), 5, 8);
    // On open ground the outer line is all wall, so its wall hexes alone fence in the ground between the lines.
    const outerWalls = withRoom.walls.filter((w) => w.ring === 'outer').map((w) => w.coord);
    expect(insideLoop(ORIGIN, outerWalls).has(coordKey(withRoom.towers[0]!))).toBe(true);

    // Sand carries no tower: with the band between the lines made of it, the first tower goes by the plain rule (highest hash).
    const sandBand = Object.fromEntries(wide.tiles.filter((t) => hexDistance(t, ORIGIN) <= RingBands.outer[1]).map((t) => [coordKey(t), 'sand' as Terrain]));
    const noRoom = disc(24, sandBand);
    const sites = placeEndgame(noRoom.tiles, noRoom.terrainOf, none, UTGARD, new Set(), 5, 8);
    expect(sites.towers.length).toBeGreaterThan(0);
    for (const t of sites.towers) expect(hexDistance(t, ORIGIN)).toBeGreaterThan(RingBands.outer[1]);
  });

  it('places no tower when the island ends inside the tower distance', () => {
    const { tiles, terrainOf } = disc(RingBands.inner[1] + 1);
    expect(placeEndgame(tiles, terrainOf, none, UTGARD, new Set(), 5, 8).towers).toEqual([]);
  });
});
