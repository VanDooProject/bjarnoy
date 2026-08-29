import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import {
  canAfford,
  formatCostLine,
  formatTrainingDuration,
  isUnitAvailable,
  totalTrainingCost,
} from './trainingEconomy';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry',
    attack: 0,
    defense: 0,
    speed: 1,
    carryCapacity: 0,
    foodCarryCapacity: 0,
    upkeepPerHour: 1,
    trainingCost: { wood: 10, stone: 5, food: 5, iron: 0 },
    trainingSeconds: 60,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
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

describe('isUnitAvailable', () => {
  const byType: Record<string, UnitDefinitionResponse> = {
    axeman: unit({ type: 'axeman', requiredLonghouseLevel: 3 }),
    berserker: unit({ type: 'berserker', requiredLonghouseLevel: 6, requiredUnitType: 'axeman' }),
  };

  it('is false below the unit\'s own required longhouse level', () => {
    expect(isUnitAvailable('axeman', 2, byType)).toBe(false);
  });

  it('is true once the longhouse is high enough with no prerequisite', () => {
    expect(isUnitAvailable('axeman', 3, byType)).toBe(true);
  });

  it('recursively requires the prerequisite unit to also be available at that longhouse level', () => {
    // Berserker's own level (6) is met, but axeman's prerequisite level (3)
    // is what actually gates it here — both must hold.
    expect(isUnitAvailable('berserker', 6, byType)).toBe(true);
  });

  it('is false for an unknown unit type', () => {
    expect(isUnitAvailable('nonexistent', 99, byType)).toBe(false);
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
