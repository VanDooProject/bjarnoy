import { describe, expect, it } from 'vitest';
import { coordKey, type AxialCoord } from '../hex/coords';
import { findPath, hoursFrom, HALF_OPEN_END_COST, type PathContext } from './hexPath';
import { palisadeRestrictions, type PalisadeWalls } from './palisadeMovement';
import type { Terrain } from './types';

const OWNER = 'owner-a';

/** A grass strip (q 0..6, r -3..3) with a mountain closing the top of the column q = 3; everything else is sea. */
function strip(extra: Record<string, Terrain> = {}, remove: string[] = []): Map<string, Terrain> {
  const terrain = new Map<string, Terrain>();
  for (let q = 0; q <= 6; q++) for (let r = -3; r <= 3; r++) terrain.set(`${q},${r}`, 'grass');
  terrain.set('3,-4', 'mountain');
  for (const [k, t] of Object.entries(extra)) terrain.set(k, t);
  for (const k of remove) terrain.delete(k);
  return terrain;
}

function column(fromR: number, toR: number, gateAtR?: number): PalisadeWalls {
  const walls = new Map<string, { gate: boolean; owner: string }>();
  for (let r = fromR; r <= toR; r++) walls.set(`3,${r}`, { gate: r === gateAtR, owner: OWNER });
  return walls;
}

function ctx(terrain: Map<string, Terrain>, walls: PalisadeWalls, owner: string, isWideRiver: (c: AxialCoord) => boolean = () => false): PathContext {
  const terrainAt = (c: AxialCoord): Terrain => terrain.get(coordKey(c)) ?? 'sea';
  return {
    terrainAt,
    isRiver: () => false,
    isWideRiver,
    rules: { land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0, bog: 2.0 }, riverCrossingCost: 8 },
    hexesPerHour: 1,
    restrictions: palisadeRestrictions(walls, terrainAt, isWideRiver, owner),
  };
}

const west = { q: 1, r: 0 };
const east = { q: 5, r: 0 };

describe('palisadeRestrictions', () => {
  it('is undefined without a wall, so the context stays the wall-free one', () => {
    expect(palisadeRestrictions(new Map(), () => 'grass', () => false, OWNER)).toBeUndefined();
  });

  it('stops every army at a closed wall, the owner included, and lets only the owner through its gate at the terrain cost', () => {
    const terrain = strip({ '3,4': 'mountain' });
    const closed = column(-3, 3);
    expect(findPath(west, east, ctx(terrain, closed, 'enemy'))).toBeNull();
    expect(findPath(west, east, ctx(terrain, closed, OWNER))).toBeNull();

    const gated = column(-3, 3, 0);
    expect(findPath(west, east, ctx(terrain, gated, 'enemy'))).toBeNull();
    const path = findPath(west, east, ctx(terrain, gated, OWNER));
    expect(path?.map(coordKey)).toContain('3,0');
    expect(hoursFrom(west, ctx(terrain, gated, OWNER), Infinity).get(coordKey(east))).toBe(4);
  });

  it('crosses a half-open land end at a flat 3 for every army', () => {
    const terrain = strip({}, ['3,3']);
    const walls = column(-3, 2);
    for (const walker of [OWNER, 'enemy']) {
      const hours = hoursFrom(west, ctx(terrain, walls, walker), Infinity);
      // The tip (3,2) is 4 hexes from (1,0): three grass steps, then the tip at 3 instead of 1.
      expect(hours.get('3,2')).toBeCloseTo(3 + 3, 9);
      expect(HALF_OPEN_END_COST).toBe(3);
      expect(findPath(west, east, ctx(terrain, walls, walker))?.map(coordKey)).toContain('3,2');
    }
  });

  it('seals an end that touches a mountain or a wide river', () => {
    const mountain = strip({ '3,3': 'mountain' });
    expect(findPath(west, east, ctx(mountain, column(-3, 2), 'enemy'))).toBeNull();

    const sea = strip({}, ['3,3']);
    expect(findPath(west, east, ctx(sea, column(-3, 2), 'enemy', (c) => coordKey(c) === '2,3'))).toBeNull();
  });

  it('seals a wall that runs into the sea end, which is itself never walked', () => {
    const terrain = strip({}, ['3,3']);
    const walls = column(-3, 3); // (3,3) is the sea end on the water hex
    expect(findPath(west, east, ctx(terrain, walls, 'enemy'))).toBeNull();
    expect(findPath(west, east, ctx(terrain, walls, OWNER))).toBeNull();
  });

  it('treats another owner\'s gate as a wall', () => {
    const terrain = strip({ '3,4': 'mountain' });
    const walls = new Map(column(-3, 3));
    walls.set('3,0', { gate: true, owner: 'someone-else' });
    expect(findPath(west, east, ctx(terrain, walls, OWNER))).toBeNull();
    expect(findPath(west, east, ctx(terrain, walls, 'someone-else'))).not.toBeNull();
  });
});
