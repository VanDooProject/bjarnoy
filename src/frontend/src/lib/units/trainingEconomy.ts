// Shared by TrainingModal.vue (and its own tests) so the cost×count,
// availability and affordability logic is unit-testable without mounting
// the component/Pinia stores — same reasoning as lib/map/buildingEconomy.ts.
import type { PlacedBuildingResponse, ResourceLine, TrainUnitsRequest, UnitDefinitionResponse } from '../../api/types';
import { resourceName } from '../../i18n/catalogueNames';
import { isOutsideRealm } from '../map/realmDecay';

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

/** Share of the per-unit training time a building takes off per level (docs/design: -1% per level, -20% at level 20). */
export const TRAINING_TIME_REDUCTION_PER_LEVEL = 0.01;

/** Mirrors the backend's cap on the orders one building trains at a time (the running one plus those waiting). */
export const MAX_TRAINING_ORDERS_PER_BUILDING = 5;

/** Where a training order goes: one building, or spread over all of the type — evenly by count or by time. */
export type TrainingSplit = TrainUnitsRequest['split'];

/** The factor a building at `level` scales a unit's training time by: `1 - 0.01 * level`. */
export function trainingTimeFactor(level: number): number {
  return 1 - TRAINING_TIME_REDUCTION_PER_LEVEL * Math.max(0, level);
}

/** The training bonus of a building at `level` in whole percent (7 at level 7) - the inverse of the factor. */
export function trainingBonusPercent(level: number): number {
  return Math.round((1 - trainingTimeFactor(level)) * 100);
}

/** One unit's training time in seconds in a building of `level`, in a world running at `speedFactor` (`UnitCatalogue.TrainingTime`). */
export function unitTrainingSeconds(
  definition: Pick<UnitDefinitionResponse, 'trainingSeconds'>,
  level: number,
  speedFactor: number,
): number {
  return (definition.trainingSeconds * trainingTimeFactor(level)) / speedFactor;
}

/**
 * How long `count` units take when spread over buildings of the given `levels`, as an estimate that ignores what each building
 * already has queued: `evenly` hands each building the same share (the first ones get the remainder), `fastest` splits by speed so
 * all orders finish together. Used for the duration the training window shows in "Distribute" mode.
 */
export function distributedTrainingSeconds(
  definition: Pick<UnitDefinitionResponse, 'trainingSeconds'>,
  count: number,
  levels: number[],
  split: Exclude<TrainingSplit, 'here'>,
  speedFactor: number,
): number {
  if (levels.length === 0 || count <= 0) return 0;
  const perUnit = levels.map((level) => unitTrainingSeconds(definition, level, speedFactor));
  if (split === 'fastest') {
    const rate = perUnit.reduce((sum, seconds) => sum + 1 / seconds, 0);
    return count / rate;
  }
  const base = Math.floor(count / levels.length);
  const extra = count % levels.length;
  return Math.max(...perUnit.map((seconds, i) => (base + (i < extra ? 1 : 0)) * seconds));
}

/** The settlement's buildings of `type` that can train: standing (level 1+) and inside the realm (a building outside it has no function). */
export function trainingBuildingsOfType(buildings: PlacedBuildingResponse[], type: string): PlacedBuildingResponse[] {
  return buildings.filter((b) => b.type === type && b.level >= 1 && !isOutsideRealm(b));
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

/** `"80 Wood · 40 Brick · ..."`, omitting any resource that costs 0. */
export function formatCostLine(cost: ResourceLine): string {
  return RESOURCE_KEYS.filter((key) => cost[key] > 0)
    .map((key) => `${cost[key]} ${resourceName(key)}`)
    .join(' · ');
}
