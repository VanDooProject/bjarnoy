// Shared by TrainingModal.vue (and its own tests) so the cost×count,
// availability and affordability logic is unit-testable without mounting
// the component/Pinia stores — same reasoning as lib/map/buildingEconomy.ts.
import type { ResourceLine, UnitDefinitionResponse } from '../../api/types';
import { resourceName } from '../../i18n/catalogueNames';

const RESOURCE_KEYS: (keyof ResourceLine)[] = ['wood', 'stone', 'food', 'iron'];

/** A batch's total cost: each resource in `trainingCost` scaled by `count`. */
export function totalTrainingCost(definition: UnitDefinitionResponse, count: number): ResourceLine {
  const cost = definition.trainingCost;
  return {
    wood: cost.wood * count,
    stone: cost.stone * count,
    food: cost.food * count,
    iron: cost.iron * count,
  };
}

/** Whether `stock` covers every non-zero resource in `cost`. */
export function canAfford(cost: ResourceLine, stock: ResourceLine): boolean {
  return RESOURCE_KEYS.every((key) => stock[key] >= cost[key]);
}

/**
 * Whether `type` is trainable at `longhouseLevel` — mirrors the backend's
 * `UnitCatalogue.IsAvailable`: the longhouse is high enough, its training
 * building (`requiredBuildingType`) stands if `buildingLevelOf` is supplied,
 * and (recursively) any prerequisite unit is itself available under the same
 * conditions. `byType` is the catalogue indexed by wire type name (see
 * `stores/unitCatalogue.ts`'s `byType` getter).
 *
 * `buildingLevelOf` mirrors `Settlement.PlanTrain`'s own lookup (a
 * settlement's level of a given building type, 0 if it has none); omitting
 * it skips the training-building check entirely, the same "unknown" escape
 * hatch the backend uses for callers with no settlement to check against.
 */
export function isUnitAvailable(
  type: string,
  longhouseLevel: number,
  byType: Record<string, UnitDefinitionResponse>,
  buildingLevelOf?: (buildingType: string) => number,
): boolean {
  const definition = byType[type];
  if (!definition) return false;
  if (longhouseLevel < definition.requiredLonghouseLevel) return false;
  if (buildingLevelOf && buildingLevelOf(definition.requiredBuildingType) < 1) return false;
  return (
    !definition.requiredUnitType || isUnitAvailable(definition.requiredUnitType, longhouseLevel, byType, buildingLevelOf)
  );
}

/** `count` batches of `seconds` each, formatted as `Hh Mm`/`Mm Ss`/`Ss`. */
export function formatTrainingDuration(seconds: number, count: number): string {
  const total = Math.max(0, Math.round(seconds * count));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** `"80 Wood · 40 Stone · ..."`, omitting any resource that costs 0. */
export function formatCostLine(cost: ResourceLine): string {
  return RESOURCE_KEYS.filter((key) => cost[key] > 0)
    .map((key) => `${cost[key]} ${resourceName(key)}`)
    .join(' · ');
}
