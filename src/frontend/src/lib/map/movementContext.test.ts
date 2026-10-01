import { describe, expect, it } from 'vitest';
import { coordKey } from '../hex/coords';
import { reachableRange } from './hexPath';
import { gamePathContext, type MovementWorldView } from './movementContext';
import type { PalisadeWalls } from './palisadeMovement';
import type { Terrain } from './types';

const RULES = { land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0 }, riverCrossingCost: 8 };

/** A grass strip (q 0..6, r -3..3), a mountain at either end of the column q = 3 and the sea around: a wall down that column seals it. */
function stripWorld(walls: PalisadeWalls): MovementWorldView {
  const terrain = new Map<string, Terrain>();
  for (let q = 0; q <= 6; q++) for (let r = -3; r <= 3; r++) terrain.set(`${q},${r}`, 'grass');
  terrain.set('3,-4', 'mountain');
  terrain.set('3,4', 'mountain');
  return {
    getTile: (q, r) => ({ terrain: terrain.get(`${q},${r}`) ?? 'sea' }),
    getRiverTile: () => undefined,
    standingPalisadeWalls: () => walls,
  };
}

function column(gateAtR?: number): Map<string, { gate: boolean; owner: string }> {
  const walls = new Map<string, { gate: boolean; owner: string }>();
  for (let r = -3; r <= 3; r++) walls.set(`3,${r}`, { gate: r === gateAtR, owner: 'ulf' });
  return walls;
}

const origin = { q: 1, r: 0 };
const behind = coordKey({ q: 5, r: 0 });

describe('gamePathContext range tint behind a wall', () => {
  it('tints the ground behind a closed wall for nobody, its owner included', () => {
    const world = stripWorld(column());

    for (const owner of ['ulf', 'egil', undefined]) {
      const range = reachableRange(origin, origin, 100, gamePathContext(world, RULES, 1, owner));
      expect(range.has(coordKey(origin))).toBe(true);
      expect(range.has(behind), `owner ${owner}`).toBe(false);
      expect(range.has(coordKey({ q: 2, r: 0 }))).toBe(true);
    }
  });

  it('lets the wall owner\'s army tint through its own gate and nobody else\'s', () => {
    const world = stripWorld(column(0));

    const owners = reachableRange(origin, origin, 100, gamePathContext(world, RULES, 1, 'ulf'));
    expect(owners.has(behind)).toBe(true);
    // 4 grass steps to (5,0) through the gate, out and back.
    expect(owners.get(behind)).toBe(8);

    for (const owner of ['egil', undefined]) {
      expect(reachableRange(origin, origin, 100, gamePathContext(world, RULES, 1, owner)).has(behind)).toBe(false);
    }
  });

  it('tints a half-open end for every army at the flat cost of 3', () => {
    const walls = column();
    walls.delete('3,3'); // the tip is now (3,2) with sea below it (not in the strip)
    const world: MovementWorldView = {
      ...stripWorld(walls),
      getTile: (q, r) => (q === 3 && r === 3 ? { terrain: 'sea' } : stripWorld(walls).getTile(q, r)),
    };

    for (const owner of ['ulf', 'egil']) {
      const range = reachableRange(origin, origin, 100, gamePathContext(world, RULES, 1, owner));
      expect(range.get(coordKey({ q: 3, r: 2 }))).toBe(2 * (3 + 3)); // 3 grass steps, then the tip at 3, out and back
      expect(range.has(behind)).toBe(true);
    }
  });

  it('is the wall-free context when no wall stands', () => {
    const world = stripWorld(new Map());
    const range = reachableRange(origin, origin, 100, gamePathContext(world, RULES, 1, 'ulf'));
    // A mountain closes the strip's ends but the middle column is open grass: the whole strip is reachable.
    expect(range.has(behind)).toBe(true);
    expect(range.has(coordKey({ q: 3, r: 0 }))).toBe(true);
  });
});
