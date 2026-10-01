import { describe, expect, it } from 'vitest';
import { coordKey, type AxialCoord } from '../hex/coords';
import { findPath, HALF_OPEN_END_COST, hoursFrom, MAX_TINT_HEXES, pathCost, reachableFrom, reachableRange, type MovementRules, type PathContext } from './hexPath';
import type { Terrain } from './types';

// Mirrors HexPathfinder's own cost tables (issue #159 part A/B) — kept as a
// literal here rather than imported, since the whole point of the golden
// fixture (hexPath.golden.test.ts) is to catch the two sides drifting apart;
// a plain unit test is free to use its own small numbers.
const RULES: MovementRules = {
  land: { grass: 1, sand: 1.1, forest: 1.3, mountain: 2 },
  riverCrossingCost: 8,
};

function contextFor(terrain: Map<string, Terrain>, rivers: Set<string> = new Set()): PathContext {
  return {
    terrainAt: (c) => terrain.get(coordKey(c)) ?? 'sea',
    isRiver: (c) => rivers.has(coordKey(c)),
    rules: RULES,
    hexesPerHour: 1,
  };
}

function grid(coords: AxialCoord[], terrain: Terrain): Map<string, Terrain> {
  return new Map(coords.map((c) => [coordKey(c), terrain]));
}

describe('hoursFrom', () => {
  it('prefers cheap terrain over shorter raw distance', () => {
    // Everything not listed defaults to sea (impassable), so Dijkstra has
    // exactly two candidate routes from (0,0) to (3,0): a 3-hop direct one
    // over mountain (2.0/hex, 6.0h total) and a 4-hop detour around it over
    // grass (1.0/hex, 4.0h total) — fewer hexes is not what wins here.
    const direct = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    const destination = { q: 3, r: 0 };
    const detour = [
      { q: 1, r: -1 },
      { q: 2, r: -1 },
      { q: 3, r: -1 },
    ];
    const terrain = new Map([
      ...grid(direct, 'mountain'),
      ...grid(detour, 'grass'),
      [coordKey(destination), 'grass' as Terrain],
    ]);

    const ctx = contextFor(terrain);
    const hours = hoursFrom({ q: 0, r: 0 }, ctx, 20);

    // Direct: 2 mountain hexes (2.0 each) + destination (1.0) = 5.0h.
    // Detour: 3 grass hexes (1.0 each) + destination (1.0) = 4.0h. Detour wins.
    expect(hours.get(coordKey(destination))).toBeCloseTo(4.0, 10);
  });

  it('treats sea as impassable to land units', () => {
    const terrain = grid([{ q: 0, r: 0 }], 'grass');
    // Every neighbour of the origin defaults to 'sea' (absent from the map).
    const ctx = contextFor(terrain);
    const hours = hoursFrom({ q: 0, r: 0 }, ctx, 100);

    expect([...hours.keys()]).toEqual([coordKey({ q: 0, r: 0 })]);
  });

  it('charges the river-crossing penalty on entry, same as HexPathfinder', () => {
    const terrain = grid(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ],
      'grass',
    );
    const ctx = contextFor(terrain, new Set([coordKey({ q: 1, r: 0 })]));
    const hours = hoursFrom({ q: 0, r: 0 }, ctx, 20);

    // Enter the river tile (1 + 8) then the far bank (1) = 10h.
    expect(hours.get(coordKey({ q: 2, r: 0 }))).toBeCloseTo(10, 10);
  });

  it('routes around a river when the detour is cheaper than the crossing penalty', () => {
    // hexDistance(a, b) is 2, and (1,0) is the *only* hex adjacent to both —
    // so any detour around it needs an extra hop (3 instead of 2), same
    // shape as the real generator: going around a river tile always costs
    // at least one extra hop.
    const a = { q: 0, r: 0 };
    const b = { q: 2, r: 0 };
    const riverTile = { q: 1, r: 0 };
    const detour = [
      { q: 1, r: -1 },
      { q: 2, r: -1 },
    ];
    const terrain = grid([b, riverTile, ...detour], 'grass');
    const ctx = contextFor(terrain, new Set([coordKey(riverTile)]));
    const hours = hoursFrom(a, ctx, 20);

    // Direct: enter river (1 + 8 = 9) then b (1) = 10h.
    // Detour: two grass hexes (1 each) then b (1) = 3h. Detour wins.
    expect(hours.get(coordKey(b))).toBeCloseTo(3, 10);
  });

  it('never reports an hour figure past maxHours', () => {
    const coords: AxialCoord[] = [];
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) coords.push({ q, r });
    }
    const ctx = contextFor(grid(coords, 'grass'));
    const hours = hoursFrom({ q: 0, r: 0 }, ctx, 3);

    for (const value of hours.values()) {
      expect(value).toBeLessThanOrEqual(3);
    }
    // Sanity: the bound actually excluded something (else the test proves nothing).
    expect(hours.size).toBeLessThan(coords.length);
  });

  it('never visits more than MAX_TINT_HEXES hexes even with an unbounded maxHours', () => {
    const coords: AxialCoord[] = [];
    for (let q = -80; q <= 80; q++) {
      for (let r = -80; r <= 80; r++) coords.push({ q, r });
    }
    const ctx = contextFor(grid(coords, 'grass'));
    const hours = hoursFrom({ q: 0, r: 0 }, ctx, 10_000);

    expect(hours.size).toBeLessThanOrEqual(MAX_TINT_HEXES);
  });
});

describe('reachableRange', () => {
  it('for an ordinary dispatch (origin === home), collapses to 2 x one-way hours', () => {
    const coords: AxialCoord[] = [];
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) coords.push({ q, r });
    }
    const ctx = contextFor(grid(coords, 'grass'));
    const origin = { q: 0, r: 0 };
    const oneWay = hoursFrom(origin, ctx, 10);
    const range = reachableRange(origin, origin, 10, ctx);

    for (const [key, total] of range) {
      expect(total).toBeCloseTo(2 * oneWay.get(key)!, 10);
    }
  });

  it('excludes hexes whose round trip exceeds hoursOfFood', () => {
    const coords: AxialCoord[] = [];
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) coords.push({ q, r });
    }
    const ctx = contextFor(grid(coords, 'grass'));
    const origin = { q: 0, r: 0 };
    const range = reachableRange(origin, origin, 4, ctx);

    // 4h of food, round trip: reachable one-way hours must be <= 2.0.
    for (const [, total] of range) {
      expect(total).toBeLessThanOrEqual(4);
    }
    expect(range.get(coordKey({ q: 2, r: 0 }))).toBeCloseTo(4, 10);
    expect(range.has(coordKey({ q: 3, r: 0 }))).toBe(false);
  });

  it('sums two independent one-way fills for a field order (origin !== home)', () => {
    const coords: AxialCoord[] = [];
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) coords.push({ q, r });
    }
    const ctx = contextFor(grid(coords, 'grass'));
    const origin = { q: -2, r: 0 };
    const home = { q: 2, r: 0 };
    const range = reachableRange(origin, home, 20, ctx);

    const fromOrigin = hoursFrom(origin, ctx, 20);
    const fromHome = hoursFrom(home, ctx, 20);
    const midpoint = coordKey({ q: 0, r: 0 });
    expect(range.get(midpoint)).toBeCloseTo(fromOrigin.get(midpoint)! + fromHome.get(midpoint)!, 10);
  });

  it('is empty when there is no food to spend', () => {
    const ctx = contextFor(grid([{ q: 0, r: 0 }], 'grass'));
    expect(reachableRange({ q: 0, r: 0 }, { q: 0, r: 0 }, 0, ctx).size).toBe(0);
  });
});

describe('findPath', () => {
  // A 5x3 meadow: q 0..4, r -1..1 (fits a parallelogram, everything else is sea).
  const meadow = (): Map<string, Terrain> => {
    const t = new Map<string, Terrain>();
    for (let q = 0; q <= 4; q++) for (let r = -1; r <= 1; r++) t.set(coordKey({ q, r }), 'grass');
    return t;
  };
  const from = { q: 0, r: 0 };
  const to = { q: 4, r: 0 };

  it('walks a straight line over open grass, endpoints included', () => {
    const path = findPath(from, to, contextFor(meadow()))!;
    expect(path.map(coordKey)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    expect(pathCost(path, contextFor(meadow()))).toBe(4);
  });

  it('returns null when an endpoint is sea or the sea cuts the two apart', () => {
    expect(findPath(from, { q: 9, r: 9 }, contextFor(meadow()))).toBeNull();
    const split = meadow();
    for (let r = -1; r <= 1; r++) split.set(coordKey({ q: 2, r }), 'sea');
    expect(findPath(from, to, contextFor(split))).toBeNull();
  });

  it('is the identity for from === to', () => {
    expect(findPath(from, from, contextFor(meadow()))).toEqual([from]);
  });

  it('crosses a river at the crossing cost (never blocks) when nothing else is switched on', () => {
    const rivers = new Set(['2,0']);
    const ctx = contextFor(meadow(), rivers);
    // Cheaper to go round than to pay +8 for (2,0).
    const path = findPath(from, to, ctx)!;
    expect(path.map(coordKey)).not.toContain('2,0');
    // With no room to go round, it crosses.
    const corridor = grid([from, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, to], 'grass');
    const crossed = findPath(from, to, contextFor(corridor, rivers))!;
    expect(crossed.map(coordKey)).toContain('2,0');
    expect(pathCost(crossed, contextFor(corridor, rivers))).toBe(4 + 8);
  });
});

describe('PathContext.restrictions (default off)', () => {
  const corridor = (terrain: Terrain = 'grass'): Map<string, Terrain> => {
    const t = new Map<string, Terrain>();
    for (let q = 0; q <= 4; q++) t.set(coordKey({ q, r: 0 }), q === 2 ? terrain : 'grass');
    return t;
  };
  const from = { q: 0, r: 0 };
  const to = { q: 4, r: 0 };
  const withRestrictions = (ctx: PathContext, restrictions: PathContext['restrictions']): PathContext => ({ ...ctx, restrictions });

  it('changes nothing when absent, empty or all-false', () => {
    const base = contextFor(corridor('mountain'), new Set(['2,0']));
    const expected = findPath(from, to, base)!;
    for (const restrictions of [undefined, {}, { wideRiversImpassable: false, mountainsImpassable: false }]) {
      expect(findPath(from, to, withRestrictions(base, restrictions))).toEqual(expected);
    }
    expect(pathCost(expected, base)).toBe(1 + (2 + 8) + 1 + 1);
  });

  it('mountainsImpassable stops a corridor, and only when switched on', () => {
    const base = contextFor(corridor('mountain'));
    expect(findPath(from, to, base)).not.toBeNull();
    expect(findPath(from, to, withRestrictions(base, { mountainsImpassable: true }))).toBeNull();
  });

  it('wideRiversImpassable blocks wide rivers but not streams, via isWideRiver', () => {
    const rivers = new Set(['2,0']);
    const base = contextFor(corridor(), rivers);
    const stream = withRestrictions({ ...base, isWideRiver: () => false }, { wideRiversImpassable: true });
    expect(findPath(from, to, stream)).not.toBeNull();
    const wide = withRestrictions({ ...base, isWideRiver: (c) => coordKey(c) === '2,0' }, { wideRiversImpassable: true });
    expect(findPath(from, to, wide)).toBeNull();
    // Without isWideRiver every river hex counts as wide.
    expect(findPath(from, to, withRestrictions(base, { wideRiversImpassable: true }))).toBeNull();
    // A wide river on a hex that is not a river at all is ignored.
    const notRiver = withRestrictions({ ...contextFor(corridor()), isWideRiver: () => true }, { wideRiversImpassable: true });
    expect(findPath(from, to, notRiver)).not.toBeNull();
  });

  it('blocked hexes stop everyone, a friendlyGate lets a friendly army through that hex only', () => {
    const base = contextFor(corridor());
    const wall = withRestrictions(base, { blocked: (c) => c.q === 2 });
    expect(findPath(from, to, wall)).toBeNull();
    const friendly = withRestrictions(base, { blocked: (c) => c.q === 2, friendlyGate: (c) => c.q === 2 });
    expect(findPath(from, to, friendly)!.map(coordKey)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    // A gate somewhere else does not open the wall.
    const wrongGate = withRestrictions(base, { blocked: (c) => c.q === 2, friendlyGate: (c) => c.q === 3 });
    expect(findPath(from, to, wrongGate)).toBeNull();
  });

  it('refuses a blocked destination and feeds reachableFrom and hoursFrom too', () => {
    const base = contextFor(corridor());
    const wall = withRestrictions(base, { blocked: (c) => c.q === 2 });
    expect(findPath(from, { q: 2, r: 0 }, wall)).toBeNull();
    expect([...reachableFrom(from, wall)].sort()).toEqual(['0,0', '1,0']);
    expect([...hoursFrom(from, wall, 100).keys()].sort()).toEqual(['0,0', '1,0']);
  });
});

describe('PathRestrictions.halfOpen (a palisade land end)', () => {
  const corridor = new Map<string, Terrain>();
  for (let q = 0; q <= 4; q++) corridor.set(coordKey({ q, r: 0 }), 'grass');
  const from = { q: 0, r: 0 };
  const to = { q: 4, r: 0 };
  const make = (restrictions: PathContext['restrictions']): PathContext => ({ ...contextFor(corridor), restrictions });
  const wall = (c: AxialCoord) => c.q === 2;

  it('crosses a half-open end at the penalty instead of the terrain cost, for any army', () => {
    const ctx = make({ blocked: wall, halfOpen: wall });
    const path = findPath(from, to, ctx)!;
    expect(path.map(coordKey)).toContain('2,0');
    expect(pathCost(path, ctx)).toBe(1 + HALF_OPEN_END_COST + 1 + 1);
    expect(pathCost(path, make({ blocked: wall, halfOpen: wall, halfOpenCost: 5 }))).toBe(1 + 5 + 1 + 1);
    // A friendly gate on the same hex changes nothing: it is already passable.
    expect(findPath(from, to, make({ blocked: wall, halfOpen: wall, friendlyGate: wall }))).not.toBeNull();
  });

  it('a sealed end (blocked, not half open) blocks; default off blocks too', () => {
    expect(findPath(from, to, make({ blocked: wall, halfOpen: () => false }))).toBeNull();
    expect(findPath(from, to, make({ blocked: wall }))).toBeNull();
  });

  it('prefers going round when that is cheaper than the penalty', () => {
    const land = new Map(corridor);
    for (const q of [1, 2, 3]) land.set(coordKey({ q, r: 1 }), 'grass');
    const ctx = { ...contextFor(land), restrictions: { blocked: (c: AxialCoord) => c.q === 2 && c.r === 0, halfOpen: (c: AxialCoord) => c.q === 2 && c.r === 0 } };
    const path = findPath(from, to, ctx)!;
    expect(path.map(coordKey)).not.toContain('2,0');
  });
});
