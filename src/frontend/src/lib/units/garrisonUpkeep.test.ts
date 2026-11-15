import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import { foodRunsOutInSeconds, stackUpkeepPerHour, stacksUpkeepPerHour } from './garrisonUpkeep';

const byType = {
  karve: { type: 'karve', upkeepPerHour: 1.5 },
  axeman: { type: 'axeman', upkeepPerHour: 0.5 },
} as unknown as Record<string, UnitDefinitionResponse>;

describe('garrisonUpkeep', () => {
  it('multiplies a stack by its unit upkeep', () => {
    expect(stackUpkeepPerHour({ unit: 'karve', count: 3004 }, byType)).toBe(4506);
  });

  it('counts an unknown unit type as zero', () => {
    expect(stackUpkeepPerHour({ unit: 'ghost', count: 10 }, byType)).toBe(0);
    expect(stacksUpkeepPerHour([{ unit: 'ghost', count: 10 }, { unit: 'axeman', count: 4 }], byType)).toBe(2);
  });

  it('sums stacks, merging repeated unit types', () => {
    expect(
      stacksUpkeepPerHour(
        [
          { unit: 'karve', count: 2 },
          { unit: 'axeman', count: 10 },
          { unit: 'axeman', count: 10 },
        ],
        byType,
      ),
    ).toBe(13);
    expect(stacksUpkeepPerHour([], byType)).toBe(0);
  });

  it('has no run-out time while food is not shrinking or the stock is empty', () => {
    expect(foodRunsOutInSeconds(1000, 0)).toBeNull();
    expect(foodRunsOutInSeconds(1000, 50)).toBeNull();
    expect(foodRunsOutInSeconds(0, -50)).toBeNull();
    expect(foodRunsOutInSeconds(-5, -50)).toBeNull();
  });

  it('gives seconds until the stock is gone at a negative rate', () => {
    expect(foodRunsOutInSeconds(1000, -500)).toBe(7200);
    expect(foodRunsOutInSeconds(50, -100)).toBe(1800);
  });
});
