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

/** One requirement a unit still misses in the building the order goes to. */
export type UnitRequirement =
  | { kind: 'buildingLevel'; building: string; required: number; current: number }
  | { kind: 'longhouse'; required: number; current: number }
  | { kind: 'unit'; unit: string }
  | { kind: 'coast' };

export interface UnitRequirementContext {
  longhouseLevel: number;
  /** The catalogue indexed by wire type name (see `stores/unitCatalogue.ts`'s `byType` getter). */
  byType: Record<string, UnitDefinitionResponse>;
  /** The level of the building the order goes to (the opened building, not the best of its type). */
  orderingLevel: number;
  /** The level of the settlement's best functioning building of a type, 0 when it has none; used for prerequisite units. */
  bestBuildingLevelOf: (buildingType: string) => number;
  /** Whether the settlement claims a shoreline hex; `null` (unknown, e.g. demo mode) counts as coastal. */
  coastal: boolean | null;
}

/** Whether `type` is unlocked in this settlement somewhere: the Longhouse, its building's best level and its own prerequisite hold. */
function isUnlockedSomewhere(type: string, ctx: UnitRequirementContext): boolean {
  const definition = ctx.byType[type];
  if (!definition) return false;
  if (ctx.longhouseLevel < definition.requiredLonghouseLevel) return false;
  if (ctx.bestBuildingLevelOf(definition.requiredBuildingType) < definition.requiredBuildingLevel) return false;
  return !definition.requiredUnitType || isUnlockedSomewhere(definition.requiredUnitType, ctx);
}

/**
 * Everything `type` still misses in the building the order goes to, in the order the window lists it; empty means it can be
 * trained. Mirrors the backend's `UnitCatalogue.IsAvailable` and `Settlement.PlanTrain` (the level is the ordering building's own).
 * The row and the gate both read this one list.
 */
export function unitRequirements(type: string, ctx: UnitRequirementContext): UnitRequirement[] {
  const definition = ctx.byType[type];
  if (!definition) return [];
  const missing: UnitRequirement[] = [];
  if (ctx.orderingLevel < definition.requiredBuildingLevel) {
    missing.push({
      kind: 'buildingLevel',
      building: definition.requiredBuildingType,
      required: definition.requiredBuildingLevel,
      current: ctx.orderingLevel,
    });
  }
  if (ctx.longhouseLevel < definition.requiredLonghouseLevel) {
    missing.push({ kind: 'longhouse', required: definition.requiredLonghouseLevel, current: ctx.longhouseLevel });
  }
  if (definition.requiredUnitType && !isUnlockedSomewhere(definition.requiredUnitType, ctx)) {
    missing.push({ kind: 'unit', unit: definition.requiredUnitType });
  }
  if (definition.class === 'ship' && ctx.coastal === false) {
    missing.push({ kind: 'coast' });
  }
  return missing;
}

/** The largest count of `definition` that `stock` covers (0 when it covers none). */
export function maxAffordableCount(definition: UnitDefinitionResponse, stock: ResourceLine): number {
  const cost = definition.trainingCost;
  let max = Number.POSITIVE_INFINITY;
  for (const key of RESOURCE_KEYS) {
    if (cost[key] > 0) max = Math.min(max, Math.floor(stock[key] / cost[key]));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

/** `stock` minus `cost`, floored at 0 per resource. */
export function subtractCost(stock: ResourceLine, cost: ResourceLine): ResourceLine {
  return {
    wood: Math.max(0, stock.wood - cost.wood),
    stone: Math.max(0, stock.stone - cost.stone),
    food: Math.max(0, stock.food - cost.food),
    iron: Math.max(0, stock.iron - cost.iron),
  };
}

/** Share of the cost of the units not yet trained that cancelling an order pays back (`Settlement.TrainingCancelRefundShare`). */
export const TRAINING_CANCEL_REFUND_SHARE = 0.5;

/** What cancelling an order pays back: 50 % of the cost of its `untrained` units, rounded down per resource. */
export function trainingCancelRefund(definition: UnitDefinitionResponse, untrained: number): ResourceLine {
  const full = totalTrainingCost(definition, Math.max(0, untrained));
  return {
    wood: Math.floor(full.wood * TRAINING_CANCEL_REFUND_SHARE),
    stone: Math.floor(full.stone * TRAINING_CANCEL_REFUND_SHARE),
    food: Math.floor(full.food * TRAINING_CANCEL_REFUND_SHARE),
    iron: Math.floor(full.iron * TRAINING_CANCEL_REFUND_SHARE),
  };
}

/** The unit types of one training building grouped by the building level that opens them, lowest level first. */
export function unlockLadder(
  definitions: UnitDefinitionResponse[],
  buildingType: string,
): { level: number; units: string[] }[] {
  const byLevel = new Map<number, string[]>();
  for (const d of definitions) {
    if (d.requiredBuildingType !== buildingType) continue;
    const list = byLevel.get(d.requiredBuildingLevel) ?? [];
    list.push(d.type);
    byLevel.set(d.requiredBuildingLevel, list);
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, units]) => ({ level, units }));
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
