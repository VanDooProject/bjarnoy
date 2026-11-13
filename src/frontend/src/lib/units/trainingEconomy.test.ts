import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import {
  canAfford,
  distributedTrainingSeconds,
  formatCostLine,
  formatTrainingDuration,
  maxAffordableCount,
  trainingCancelRefund,
  unitRequirements,
  unlockLadder,
  type UnitRequirementContext,
  totalTrainingCost,
  trainingBonusPercent,
  trainingTimeFactor,
  unitTrainingSeconds,
} from './trainingEconomy';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry',
    attack: 0,
    defense: 0,
    speed: 1,
    visionRadius: 2,
    carryCapacity: 0,
    foodCarryCapacity: 0,
    cargoSlots: 0,
    shipSlots: 0,
    upkeepPerHour: 1,
    ranged: false,
    trainingCost: { wood: 10, stone: 5, food: 5, iron: 0 },
    trainingSeconds: 60,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
    requiredBuildingType: 'longhouse',
    requiredBuildingLevel: 1,
    siegeTargets: [],
    ...overrides,
  };
}

describe('totalTrainingCost', () => {
  it('scales every resource by the batch count', () => {
    const spearman = unit({ type: 'spearman', trainingCost: { wood: 80, stone: 40, food: 20, iron: 40 } });
    expect(totalTrainingCost(spearman, 3)).toEqual({ wood: 240, stone: 120, food: 60, iron: 120 });
  });

  it('returns all zeros for a batch of zero', () => {
    const spearman = unit({ type: 'spearman', trainingCost: { wood: 80, stone: 40, food: 20, iron: 40 } });
    expect(totalTrainingCost(spearman, 0)).toEqual({ wood: 0, stone: 0, food: 0, iron: 0 });
  });
});

describe('canAfford', () => {
  it('is true when stock covers every resource exactly', () => {
    expect(canAfford({ wood: 10, stone: 5, food: 0, iron: 0 }, { wood: 10, stone: 5, food: 0, iron: 0 })).toBe(true);
  });

  it('is false when any single resource falls short', () => {
    expect(canAfford({ wood: 10, stone: 5, food: 0, iron: 0 }, { wood: 10, stone: 4, food: 0, iron: 0 })).toBe(false);
  });
});

describe('unitRequirements', () => {
  const byType: Record<string, UnitDefinitionResponse> = {
    axeman: unit({ type: 'axeman', requiredLonghouseLevel: 6, requiredBuildingType: 'barracks', requiredBuildingLevel: 6 }),
    berserker: unit({
      type: 'berserker',
      requiredLonghouseLevel: 20,
      requiredBuildingType: 'barracks',
      requiredBuildingLevel: 10,
    }),
    ram: unit({
      type: 'ram',
      requiredBuildingType: 'siegeworkshop',
      requiredBuildingLevel: 10,
      requiredUnitType: 'berserker',
    }),
    karve: unit({ type: 'karve', class: 'ship', requiredBuildingType: 'dockyard' }),
  };
  const ctx = (over: Partial<UnitRequirementContext> = {}): UnitRequirementContext => ({
    longhouseLevel: 20,
    byType,
    orderingLevel: 10,
    bestBuildingLevelOf: () => 10,
    coastal: true,
    ...over,
  });

  it('is empty when every requirement holds', () => {
    expect(unitRequirements('berserker', ctx())).toEqual([]);
  });

  it('names the ordering building\'s level, not the best of its type', () => {
    // A second Barracks at 10 exists, but the opened one is level 4.
    expect(unitRequirements('axeman', ctx({ orderingLevel: 4, bestBuildingLevelOf: () => 10 }))).toEqual([
      { kind: 'buildingLevel', building: 'barracks', required: 6, current: 4 },
    ]);
  });

  it('lists exactly the missing requirements, together', () => {
    expect(unitRequirements('berserker', ctx({ longhouseLevel: 12, orderingLevel: 6 }))).toEqual([
      { kind: 'buildingLevel', building: 'barracks', required: 10, current: 6 },
      { kind: 'longhouse', required: 20, current: 12 },
    ]);
  });

  it('asks for a prerequisite unit that is not unlocked in this settlement', () => {
    const missing = unitRequirements('ram', ctx({ bestBuildingLevelOf: (b) => (b === 'barracks' ? 4 : 10) }));
    expect(missing).toEqual([{ kind: 'unit', unit: 'berserker' }]);
  });

  it('is satisfied by the prerequisite unit unlocked in a different building', () => {
    expect(unitRequirements('ram', ctx())).toEqual([]);
  });

  it('asks for a coast on ships, only when it is known to be missing', () => {
    expect(unitRequirements('karve', ctx({ coastal: false }))).toEqual([{ kind: 'coast' }]);
    expect(unitRequirements('karve', ctx({ coastal: null }))).toEqual([]);
  });

  it('is empty for an unknown unit type', () => {
    expect(unitRequirements('nonexistent', ctx())).toEqual([]);
  });
});

describe('maxAffordableCount', () => {
  const spearman = unit({ type: 'spearman', trainingCost: { wood: 80, stone: 40, food: 20, iron: 40 } });

  it('is bounded by the scarcest resource', () => {
    expect(maxAffordableCount(spearman, { wood: 1000, stone: 1000, food: 1000, iron: 130 })).toBe(3);
  });

  it('is 0 when one resource is missing', () => {
    expect(maxAffordableCount(spearman, { wood: 1000, stone: 1000, food: 1000, iron: 0 })).toBe(0);
  });

  it('ignores resources the unit does not cost', () => {
    const thrall = unit({ type: 'thrall', trainingCost: { wood: 60, stone: 30, food: 25, iron: 0 } });
    expect(maxAffordableCount(thrall, { wood: 120, stone: 60, food: 50, iron: 0 })).toBe(2);
  });
});

describe('trainingCancelRefund', () => {
  const spearman = unit({ type: 'spearman', trainingCost: { wood: 80, stone: 40, food: 20, iron: 40 } });

  it('pays back half of the cost of the units not trained yet', () => {
    expect(trainingCancelRefund(spearman, 4)).toEqual({ wood: 160, stone: 80, food: 40, iron: 80 });
  });

  it('rounds down per resource', () => {
    expect(trainingCancelRefund(spearman, 1)).toEqual({ wood: 40, stone: 20, food: 10, iron: 20 });
    expect(trainingCancelRefund(unit({ type: 'x', trainingCost: { wood: 25, stone: 0, food: 0, iron: 0 } }), 1).wood).toBe(12);
  });

  it('floors whole resources the way the backend does (one Thrall: 25 food refunds 12)', () => {
    const thrall = unit({ type: 'thrall', trainingCost: { wood: 60, stone: 30, food: 25, iron: 0 } });
    expect(trainingCancelRefund(thrall, 1)).toEqual({ wood: 30, stone: 15, food: 12, iron: 0 });
    expect(trainingCancelRefund(thrall, 3).food).toBe(37);
  });

  it('pays nothing when every unit is trained', () => {
    expect(trainingCancelRefund(spearman, 0)).toEqual({ wood: 0, stone: 0, food: 0, iron: 0 });
  });
});

describe('unlockLadder', () => {
  it('groups one building\'s units by level, lowest first, and skips other buildings', () => {
    const defs = [
      unit({ type: 'berserker', requiredBuildingType: 'barracks', requiredBuildingLevel: 10 }),
      unit({ type: 'thrall', requiredBuildingType: 'barracks', requiredBuildingLevel: 1 }),
      unit({ type: 'spearman', requiredBuildingType: 'barracks', requiredBuildingLevel: 3 }),
      unit({ type: 'bowman', requiredBuildingType: 'archeryrange', requiredBuildingLevel: 1 }),
    ];
    expect(unlockLadder(defs, 'barracks')).toEqual([
      { level: 1, units: ['thrall'] },
      { level: 3, units: ['spearman'] },
      { level: 10, units: ['berserker'] },
    ]);
  });
});

describe('formatTrainingDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatTrainingDuration(45, 1)).toBe('45s');
  });

  it('formats minute-scale durations as minutes and seconds', () => {
    expect(formatTrainingDuration(90, 1)).toBe('1m 30s');
  });

  it('formats hour-scale durations as hours and minutes, scaled by count', () => {
    expect(formatTrainingDuration(1800, 4)).toBe('2h 0m');
  });
});

describe('formatCostLine', () => {
  it('joins non-zero resources and omits zero ones', () => {
    expect(formatCostLine({ wood: 80, stone: 0, food: 20, iron: 40 })).toBe('80 Wood · 20 Food · 40 Iron');
  });

  it('returns an empty string when every resource is zero', () => {
    expect(formatCostLine({ wood: 0, stone: 0, food: 0, iron: 0 })).toBe('');
  });
});

describe('trainingTimeFactor', () => {
  it('takes 1% off per building level, 20% at level 20', () => {
    expect(trainingTimeFactor(0)).toBe(1);
    expect(trainingTimeFactor(1)).toBeCloseTo(0.99);
    expect(trainingTimeFactor(7)).toBeCloseTo(0.93);
    expect(trainingTimeFactor(20)).toBeCloseTo(0.8);
  });

  it('reads as whole percent for the building header', () => {
    expect(trainingBonusPercent(0)).toBe(0);
    expect(trainingBonusPercent(7)).toBe(7);
    expect(trainingBonusPercent(20)).toBe(20);
  });

  it('scales a unit\'s catalogue time by the building level', () => {
    expect(unitTrainingSeconds(unit({ type: 'thrall', trainingSeconds: 100 }), 10, 1)).toBeCloseTo(90);
  });

  it('divides by the world speed factor, like the server', () => {
    expect(unitTrainingSeconds(unit({ type: 'thrall', trainingSeconds: 100 }), 10, 3)).toBeCloseTo(30);
  });
});

describe('distributedTrainingSeconds', () => {
  const thrall = unit({ type: 'thrall', trainingSeconds: 100 });

  it('evenly: the building with the larger share and the lower level finishes last', () => {
    // 5 units over levels 0 and 20: shares 3 and 2 -> max(3 * 100, 2 * 80)
    expect(distributedTrainingSeconds(thrall, 5, [0, 20], 'evenly', 1)).toBeCloseTo(300);
  });

  it('fastest: orders finish together, faster buildings take more', () => {
    // rates 1/100 + 1/80 per second -> 10 units take 10 / 0.0225
    expect(distributedTrainingSeconds(thrall, 10, [0, 20], 'fastest', 1)).toBeCloseTo(10 / (1 / 100 + 1 / 80));
  });

  it('divides both splits by the world speed factor', () => {
    expect(distributedTrainingSeconds(thrall, 5, [0, 20], 'evenly', 2)).toBeCloseTo(150);
    expect(distributedTrainingSeconds(thrall, 10, [0, 20], 'fastest', 2)).toBeCloseTo(10 / (1 / 100 + 1 / 80) / 2);
  });

  it('fastest is never slower than evenly', () => {
    expect(distributedTrainingSeconds(thrall, 7, [0, 20], 'fastest', 1)).toBeLessThanOrEqual(
      distributedTrainingSeconds(thrall, 7, [0, 20], 'evenly', 1),
    );
  });
});
