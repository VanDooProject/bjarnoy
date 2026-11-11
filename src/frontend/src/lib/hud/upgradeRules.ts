// The rules of "what does upgrading this building need", shared by the ring menu's Upgrade bubble and the building HUD so
// both read the same level, the same Longhouse gate and the same missing prerequisites.
import type { AxialCoord } from '../hex/coords';
import { buildingUpgradeCost, maxLevelFor, type BuildingKind } from '../map/buildingEconomy';
import { RING_RESOURCE_KEYS, missingPrerequisites, type RingResourceKey, type RingStock } from '../map/ringAvailability';
import { nextUpgradeLevel } from './pendingBuild';
import type { BuildOrderResponse } from '../../api/types';

interface UpgradeDefinition {
  level: number;
  requiredLonghouseLevel?: number;
  prerequisites?: readonly { type: string; level: number }[];
}

export interface UpgradeTarget<D extends UpgradeDefinition> {
  /** Level the upgrade reaches; queued behind a running upgrade it starts from the level that one reaches. */
  nextLevel: number;
  /** `nextLevel - 1`. */
  level: number;
  /** The catalogue entry of `nextLevel`, when the catalogue has it. */
  definition: D | undefined;
  /** The catalogue lists the building but has no further level: nothing left to upgrade to. */
  maxed: boolean;
}

export function resolveUpgradeTarget<D extends UpgradeDefinition>(
  builtLevel: number,
  queue: readonly Pick<BuildOrderResponse, 'q' | 'r' | 'kind' | 'targetLevel'>[],
  at: AxialCoord,
  definitions: readonly D[] | undefined,
): UpgradeTarget<D> {
  const nextLevel = nextUpgradeLevel(builtLevel, queue, at);
  const definition = definitions?.find((d) => d.level === nextLevel);
  return { nextLevel, level: nextLevel - 1, definition, maxed: !!definitions?.length && !definition };
}

export interface UpgradeBlockers {
  /** The Longhouse level the upgrade needs, when the settlement's is lower. */
  longhouse: number | undefined;
  /** Prerequisite buildings (all required) not yet at their level. */
  prerequisites: { type: string; level: number }[];
}

export function upgradeBlockers(
  definition: UpgradeDefinition | undefined,
  longhouseLevel: number,
  builtLevels: Readonly<Record<string, number | undefined>>,
): UpgradeBlockers {
  const required = definition?.requiredLonghouseLevel;
  return {
    longhouse: required !== undefined && required > longhouseLevel ? required : undefined,
    prerequisites: missingPrerequisites(definition?.prerequisites, builtLevels),
  };
}

type UpgradeCost = Readonly<Record<RingResourceKey, number>>;

export interface UpgradeVerdictInput<D extends UpgradeDefinition & { cost?: UpgradeCost }> {
  type: string;
  /** The level the building stands at. */
  builtLevel: number;
  queue: readonly Pick<BuildOrderResponse, 'q' | 'r' | 'kind' | 'targetLevel'>[];
  at: AxialCoord;
  /** Catalogue entries of the type (all levels); undefined while the catalogue has none. */
  definitions: readonly D[] | undefined;
  longhouseLevel: number;
  /** Highest standing level per building type. */
  builtLevels: Readonly<Record<string, number | undefined>>;
  storageCap: RingStock;
}

export interface UpgradeVerdict<D extends UpgradeDefinition> extends UpgradeTarget<D> {
  /** The building stands at its last level (the type's ceiling or the catalogue's last entry). Max and the crown mean this. */
  atMax: boolean;
  /** What the next level costs: the catalogue's price, else the client estimate; undefined once nothing is left to queue. */
  cost: UpgradeCost | undefined;
  blockers: UpgradeBlockers;
  /** The next level's price is above what the stores can hold, so waiting would never get there. */
  storageShort: boolean;
}

/**
 * The one answer to "can this building be upgraded, and what stops it", read by the ring's Upgrade bubble and the building
 * HUD alike: the target level, max (standing at the last level) and `maxed` (nothing left to queue, which a queued order for
 * the last level also causes), the cost, the Longhouse and prerequisite blockers, and the storage cap rule.
 */
export function upgradeVerdict<D extends UpgradeDefinition & { cost?: UpgradeCost }>(input: UpgradeVerdictInput<D>): UpgradeVerdict<D> {
  const { type, builtLevel, definitions } = input;
  const target = resolveUpgradeTarget(builtLevel, input.queue, input.at, definitions);
  const catalogueTop = definitions?.length ? Math.max(...definitions.map((d) => d.level)) : undefined;
  const atMax = builtLevel >= maxLevelFor(type as BuildingKind) || (catalogueTop !== undefined && builtLevel >= catalogueTop);
  const maxed = atMax || target.maxed;
  const cost = maxed ? undefined : (target.definition?.cost ?? buildingUpgradeCost(type as BuildingKind, target.nextLevel));
  return {
    ...target,
    maxed,
    atMax,
    cost,
    blockers: upgradeBlockers(target.definition, input.longhouseLevel, input.builtLevels),
    storageShort: !!cost && RING_RESOURCE_KEYS.some((key) => (cost[key] ?? 0) > input.storageCap[key]),
  };
}
