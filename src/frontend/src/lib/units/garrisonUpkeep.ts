// Pure food-upkeep maths behind the Garrison HUD panel (GarrisonList.vue): what a unit stack, a
// whole army or the whole garrison plus its guests eat per hour, and how long the food lasts.
import type { UnitDefinitionResponse } from '../../api/types';
import { totalUpkeepPerHour } from './armyDispatch';

export interface UnitStack {
  unit: string;
  count: number;
}

type UnitsByType = Record<string, UnitDefinitionResponse>;

/** Food per hour one stack eats; an unknown unit type eats nothing. */
export function stackUpkeepPerHour(stack: UnitStack, byType: UnitsByType): number {
  return totalUpkeepPerHour({ [stack.unit]: stack.count }, byType);
}

/** Food per hour several stacks eat together (stacks of the same unit type add up). */
export function stacksUpkeepPerHour(stacks: UnitStack[], byType: UnitsByType): number {
  const counts: Record<string, number> = {};
  for (const s of stacks) counts[s.unit] = (counts[s.unit] ?? 0) + s.count;
  return totalUpkeepPerHour(counts, byType);
}

/** Seconds until the food stock is gone at the net hourly rate; null unless food is shrinking and there is some. */
export function foodRunsOutInSeconds(foodStock: number, netFoodPerHour: number): number | null {
  if (netFoodPerHour >= 0 || foodStock <= 0) return null;
  return (foodStock / -netFoodPerHour) * 3600;
}
