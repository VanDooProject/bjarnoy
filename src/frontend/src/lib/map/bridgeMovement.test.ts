import { describe, expect, it } from 'vitest';
import { coordKey } from '../hex/coords';
import { findPath, hoursFrom, pathCost, type PathContext } from './hexPath';
import { bridgeCrossingCost, bridgeRestrictions, type StandingBridges } from './bridgeMovement';
import { gamePathContext, type MovementWorldView } from './movementContext';
import type { RiverTile, Terrain } from './types';

// Mirrors the backend's BridgeMovementTests: a grass strip (q 0..6, r -3..3) cut in two by a wide river down the column q = 3
// whose ends are closed by mountains.
const OWNER = 'owner';
const FRIEND = 'friend';
const STRANGER = 'stranger';
const RULES = { land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0 }, riverCrossingCost: 8.0 };
const WEST = { q: 1, r: 0 };
const EAST = { q: 5, r: 0 };
const SPAN = { q: 3, r: 0 };

function strip(): Map<string, Terrain> {
  const terrain = new Map<string, Terrain>();
  for (let q = 0; q <= 6; q++) for (let r = -3; r <= 3; r++) terrain.set(`${q},${r}`, 'grass');
  terrain.set('3,-4', 'mountain');
  terrain.set('3,4', 'mountain');
  return terrain;
}

const isRiverHex = (c: { q: number; r: number }) => c.q === 3 && c.r >= -3 && c.r <= 3;

function bridges(level: number | null, owner = OWNER): StandingBridges {
  return level === null ? new Map() : new Map([[coordKey(SPAN), { level, owner }]]);
}

function ctxFor(terrain: Map<string, Terrain>, standing: StandingBridges, walker: string, wide = isRiverHex): PathContext {
  const terrainAt = (c: { q: number; r: number }): Terrain => terrain.get(coordKey(c)) ?? 'sea';
  return {
    terrainAt,
    isRiver: isRiverHex,
    isWideRiver: wide,
    rules: RULES,
    hexesPerHour: 1,
    restrictions: bridgeRestrictions(standing, terrainAt, RULES, walker, new Set([FRIEND].filter(() => walker === OWNER))),
  };
}

const cost = (terrain: Map<string, Terrain>, standing: StandingBridges, walker: string) => {
  const ctx = ctxFor(terrain, standing, walker);
  const path = findPath(WEST, EAST, ctx);
  return path === null ? null : { path, hours: pathCost(path, ctx) };
};

describe('bridge movement (mirror of BridgeMovementTests.cs)', () => {
  it('shuts a wide river to everyone without a bridge', () => {
    const terrain = strip();
    expect(cost(terrain, bridges(null), OWNER)).toBeNull();
    expect(cost(terrain, bridges(null), STRANGER)).toBeNull();
  });

  it('does not open the river for a foundation (level 0)', () => {
    expect(cost(strip(), bridges(0), OWNER)).toBeNull();
  });

  it.each([
    [1, 3 + 6.0],
    [2, 3 + 4.0],
    [3, 3 + 1.0],
    [4, 3 + 1.0],
  ])('level %i prices the crossing at %f for the owner (and a stranger up to level 3)', (level, expected) => {
    const terrain = strip();
    const owner = cost(terrain, bridges(level), OWNER);
    expect(owner).not.toBeNull();
    expect(owner!.path.map(coordKey)).toContain(coordKey(SPAN));
    expect(owner!.hours).toBeCloseTo(expected, 9);
    if (level <= 3) expect(cost(terrain, bridges(level), STRANGER)!.hours).toBeCloseTo(expected, 9);
  });

  it('prices a king\'s bridge at the terrain under it', () => {
    const terrain = strip();
    terrain.set(coordKey(SPAN), 'forest');
    expect(bridgeCrossingCost({ level: 3, owner: OWNER }, 'forest', RULES, STRANGER)).toBe(1.3);
    expect(bridgeCrossingCost({ level: 3, owner: OWNER }, 'sand', RULES, STRANGER)).toBe(1.1);
  });

  it('opens a guarded bridge for its owner and friends and not for strangers', () => {
    const guarded = { level: 4, owner: OWNER };
    expect(bridgeCrossingCost(guarded, 'grass', RULES, OWNER)).toBe(1.0);
    expect(bridgeCrossingCost(guarded, 'grass', RULES, FRIEND, new Set([OWNER]))).toBe(1.0);
    expect(bridgeCrossingCost(guarded, 'grass', RULES, STRANGER)).toBeNull();
    expect(cost(strip(), bridges(4), STRANGER)).toBeNull();
    expect(cost(strip(), bridges(3), STRANGER)).not.toBeNull();
  });

  it('never changes the price of a stream', () => {
    const terrain = strip();
    const ctx = ctxFor(terrain, bridges(1), OWNER, () => false);
    const path = findPath(WEST, EAST, ctx)!;
    expect(pathCost(path, ctx)).toBeCloseTo(3 + 1.0 + RULES.riverCrossingCost, 9);
  });

  it('returns no restrictions when no bridge stands', () => {
    expect(bridgeRestrictions(new Map(), () => 'grass', RULES, OWNER)).toBeUndefined();
  });

  it('shows up in the range tint through gamePathContext', () => {
    const terrain = strip();
    const river: RiverTile[] = [];
    for (let r = -3; r <= 3; r++) river.push({ q: 3, r, shape: 'straight', width: 'river', inDirections: ['NW'], outDirection: 'SE' } as RiverTile);
    const world: MovementWorldView = {
      getTile: (q, r) => ({ terrain: terrain.get(`${q},${r}`) ?? 'sea' }),
      getRiverTile: (q, r) => river.find((t) => t.q === q && t.r === r),
      standingBridges: () => bridges(2),
    };
    const range = hoursFrom(WEST, gamePathContext(world, RULES, 1, OWNER), 100);
    expect(range.get(coordKey(EAST))).toBeCloseTo(3 + 4.0, 9);
    const shut = hoursFrom(WEST, gamePathContext({ ...world, standingBridges: undefined }, RULES, 1, OWNER), 100);
    expect(shut.has(coordKey(EAST))).toBe(false);
  });
});
