import { describe, expect, it } from 'vitest';
import {
  GROUND_COSTS,
  RIVER_CROSSING_COST,
  STREAM_COST,
  WALL_END_COST,
  formatMinutes,
  minutesPerHex,
  strongCampGuardRange,
} from './landMovementDocs';
import { pathCost, type PathContext } from '../map/hexPath';
import type { Terrain } from '../map/types';

// A one-step path priced by the real pathfinder, to hold the mirrored table against hexPath.ts.
function stepCostOf(terrain: Terrain, river = false, wide = false): number {
  const ctx: PathContext = {
    terrainAt: (c) => (c.q === 1 ? terrain : 'grass'),
    isRiver: (c) => river && c.q === 1,
    isWideRiver: (c) => wide && c.q === 1,
    rules: {
      land: Object.fromEntries(GROUND_COSTS.map((g) => [g.terrain, g.cost])),
      riverCrossingCost: RIVER_CROSSING_COST,
    },
    hexesPerHour: 1,
  };
  return pathCost([{ q: 0, r: 0 }, { q: 1, r: 0 }], ctx);
}

describe('landMovementDocs', () => {
  it('prices each ground the way the pathfinder does', () => {
    for (const g of GROUND_COSTS) expect(stepCostOf(g.terrain), g.terrain).toBe(g.cost);
  });

  it('charges a stream a flat 9 whatever it runs over, and refuses a wide river and a mountain', () => {
    expect(STREAM_COST).toBe(9);
    expect(stepCostOf('grass', true)).toBe(STREAM_COST);
    expect(stepCostOf('bog', true)).toBe(STREAM_COST);
    expect(stepCostOf('mountain')).toBe(Infinity);
    expect(stepCostOf('grass', true, true)).toBe(Infinity);
  });

  it('prices the open end of a wall at 3', () => {
    expect(WALL_END_COST).toBe(3);
  });

  it('works out minutes per hex from cost and speed', () => {
    expect(minutesPerHex(1, 4)).toBe(15);
    expect(minutesPerHex(2, 5)).toBe(24);
    expect(minutesPerHex(1, 1.5)).toBe(40);
  });

  it('writes minutes below an hour as minutes and above as hours and minutes', () => {
    expect(formatMinutes(15)).toBe('15 min');
    expect(formatMinutes(16.5)).toBe('16.5 min');
    expect(formatMinutes(135)).toBe('2 h 15 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(16.5, 'de')).toBe('16,5 min');
  });

  it('makes a strong camp guard 2 plus its level hexes', () => {
    expect([1, 5].map(strongCampGuardRange)).toEqual([3, 7]);
  });
});
