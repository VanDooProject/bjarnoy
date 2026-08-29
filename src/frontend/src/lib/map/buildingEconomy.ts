// Shared by the settlement hover tooltip (HexMapRenderer.hoverInfoFor) and
// BuildingModal.vue's build/details screen, so both always show the exact
// same "current stats" for a tile instead of two formulas drifting apart.
import type { ResourceLine } from '../../api/types';
import type { Tile } from './types';

export type BuildingKind = NonNullable<Tile['buildingType']>;

export interface BuildingLevelStats {
  output?: string;
  modifier?: string;
  workers?: string;
}

/**
 * Per-type/level output. None of this is tracked per-building anywhere (the
 * backend/WorldModel only know a settlement's *aggregate* rates, not a
 * single building's own output) so these are derived deterministically from
 * the building's type/level/neighbours purely for display — see HoverInfo's
 * doc comment in HexMapRenderer.ts for the full rationale.
 */
export function buildingStatsFor(type: BuildingKind, level: number, nearWater: boolean): BuildingLevelStats {
  switch (type) {
    case 'farm': {
      const irrigated = nearWater;
      const base = level * 120;
      const workersCap = level * 4;
      return {
        output: `+${irrigated ? Math.round(base * 1.1) : base} food/h`,
        modifier: irrigated ? 'Irrigated (+10%)' : undefined,
        workers: `${workersCap}/${workersCap}`,
      };
    }
    case 'hut':
      return { output: `+${level * 5} population capacity` };
    case 'tower':
      return { output: `Vision +${level} ring`, modifier: 'Border anchor' };
    case 'longhouse':
      return { output: `+${level * 100} storage capacity` };
    case 'pumpkinfarm': {
      const workersCap = level * 4;
      return { output: `+${level * 144} food/h`, workers: `${workersCap}/${workersCap}` };
    }
    // Placed on coastal water itself (BuildingCatalogue.cs's FishingHut),
    // not merely built near it, so unlike farm's irrigation bonus this is
    // unconditional rather than gated on nearWater.
    case 'fishinghut':
      return { output: `+${level * 30} food/h`, modifier: 'Coastal' };
    case 'magictower':
      return { output: `+${level * 24} iron/h`, modifier: 'Arcane' };
    // Mirrors ShrineCatalogue.Favour.cs: +10% at level 1, +3%/level after,
    // capped at level 5 (+22%) so slotted runes always have headroom.
    case 'shrineofthor':
    case 'shrineoffreyja': {
      const favour = Math.round((0.10 + 0.03 * (Math.min(level, 5) - 1)) * 100);
      const domain = type === 'shrineofthor' ? 'Wood/Stone' : 'Food';
      return { modifier: `+${favour}% ${domain} production` };
    }
    default:
      return {};
  }
}

/** Cost multiplier for a level: 1, 1.6, 2.56, … Mirrors BuildingCatalogue.cs's CostFactor. */
function costFactor(level: number): number {
  return Math.pow(1.6, level - 1);
}

// Base (level-1) resource cost per type, mirroring BuildingCatalogue.cs's
// per-type builders (Producer/Longhouse/Tower). "hut" has no backend
// catalogue entry — it's demo-only, see SettlementView.vue's build() doc
// comment — so it's approximated at the same base cost as the other small
// producer buildings.
const BASE_COST: Record<BuildingKind, ResourceLine> = {
  hut: { wood: 100, stone: 80, food: 0, iron: 0 },
  farm: { wood: 100, stone: 80, food: 0, iron: 0 },
  pumpkinfarm: { wood: 100, stone: 80, food: 0, iron: 0 },
  fishinghut: { wood: 100, stone: 80, food: 0, iron: 0 },
  magictower: { wood: 100, stone: 80, food: 0, iron: 0 },
  longhouse: { wood: 200, stone: 150, food: 100, iron: 0 },
  tower: { wood: 120, stone: 200, food: 0, iron: 10 },
  shrineofthor: { wood: 180, stone: 140, food: 60, iron: 0 },
  shrineoffreyja: { wood: 180, stone: 140, food: 60, iron: 0 },
};

/** Resource cost to build `type` at `targetLevel` (1 for a fresh build, current level + 1 for an upgrade). */
export function buildingUpgradeCost(type: BuildingKind, targetLevel: number): ResourceLine {
  const base = BASE_COST[type];
  const factor = costFactor(targetLevel);
  return {
    wood: Math.round(base.wood * factor),
    stone: Math.round(base.stone * factor),
    food: Math.round(base.food * factor),
    iron: Math.round(base.iron * factor),
  };
}
