// The rules of "what does upgrading this building need", shared by the ring menu's Upgrade bubble and the building HUD so
// both read the same level, the same Longhouse gate and the same missing prerequisites.
import type { AxialCoord } from '../hex/coords';
import { missingPrerequisites } from '../map/ringAvailability';
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
