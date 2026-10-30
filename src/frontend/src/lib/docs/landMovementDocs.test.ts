import { describe, expect, it } from 'vitest';
import {
  BRIDGE_GROUND_COST,
  BRIDGE_LEVELS,
  BRIDGE_UNLOCK,
  GROUND_COSTS,
  RIVER_CROSSING_COST,
  STREAM_COST,
  WALL_END_COST,
  formatMinutes,
  minutesPerHex,
  strongCampGuardRange,
} from './landMovementDocs';
import { pathCost, type PathContext } from '../map/hexPath';
import { bridgeRestrictions } from '../map/bridgeMovement';
import { maxLevelFor } from '../map/buildingEconomy';
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

  describe('bridges', () => {
    const rules = { land: Object.fromEntries(GROUND_COSTS.map((g) => [g.terrain, g.cost])), riverCrossingCost: RIVER_CROSSING_COST };

    // The cost of one step onto a wide-river hex that a bridge of `level` (owned by OWNER) spans, walked by `walker`.
    function bridgeStep(level: number, walker: string, ground: Terrain = 'grass'): number {
      const terrainAt = (c: { q: number; r: number }): Terrain => (c.q === 1 ? ground : 'grass');
      const bridges = new Map([['1,0', { level, owner: 'owner' }]]);
      const ctx: PathContext = {
        terrainAt,
        isRiver: (c) => c.q === 1,
        isWideRiver: (c) => c.q === 1,
        rules,
        hexesPerHour: 1,
        restrictions: bridgeRestrictions(bridges, terrainAt, rules, walker, new Set(['friend'])),
      };
      return pathCost([{ q: 0, r: 0 }, { q: 1, r: 0 }], ctx);
    }

    it('lists the four levels the pathfinder prices: 6 and 4 for causeway and footbridge, the ground for the rest', () => {
      expect(BRIDGE_LEVELS.map((b) => b.level)).toEqual([1, 2, 3, 4]);
      expect(BRIDGE_LEVELS.map((b) => b.cost)).toEqual([6, 4, null, null]);
      expect(maxLevelFor('bridge')).toBe(BRIDGE_LEVELS.length);
      for (const b of BRIDGE_LEVELS) {
        if (b.cost !== null) expect(bridgeStep(b.level, 'stranger'), `level ${b.level}`).toBe(b.cost);
      }
    });

    it('lets every army over levels 1 to 3 at the ground cost from level 3, and only friends over the guarded one', () => {
      for (const ground of ['grass', 'sand', 'forest'] as const) {
        const cost = GROUND_COSTS.find((g) => g.terrain === ground)!.cost;
        expect(bridgeStep(3, 'stranger', ground)).toBe(cost);
        expect(bridgeStep(4, 'owner', ground)).toBe(cost);
        expect(bridgeStep(4, 'stranger', ground)).toBe(Infinity);
      }
      expect(BRIDGE_LEVELS.filter((b) => !b.everyone).map((b) => b.level)).toEqual([4]);
      expect(bridgeStep(1, 'stranger')).toBe(6);
    });

    it('quotes the cheapest and dearest ground a bridge can stand on, bog left out', () => {
      expect(BRIDGE_GROUND_COST).toEqual({ min: 1, max: 1.3 });
    });

    it('unlocks at Longhouse 7 behind a level-1 Town Square', () => {
      expect(BRIDGE_UNLOCK).toEqual({ longhouse: 7, townSquare: 1 });
    });
  });
});
