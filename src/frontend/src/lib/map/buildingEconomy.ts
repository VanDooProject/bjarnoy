// Shared by the settlement hover tooltip (HexMapRenderer.hoverInfoFor) and
// BuildingModal.vue's build/details screen, so both always show the exact
// same "current stats" for a tile instead of two formulas drifting apart.
import type { ResourceLine } from '../../api/types';
import { neighbors, type AxialCoord } from '../hex/coords';
import type { Terrain, Tile } from './types';

export type BuildingKind = NonNullable<Tile['buildingType']>;

export interface BuildingLevelStats {
  output?: string;
  modifier?: string;
  workers?: string;
}

/**
 * The terrain a building's production is boosted by adjacency to, mirroring
 * the server-authoritative table in `BuildingCatalogue.cs`'s `Boosts`
 * dictionary (10% per matching direct neighbour, capped at 50% — see
 * `boostMultiplier` below). A building with no entry here (Farm/PumpkinFarm
 * included) gets no such bonus.
 */
export const BOOST_TERRAIN: Partial<Record<BuildingKind, Terrain>> = {
  lumberjack: 'forest',
  quarry: 'mountain',
  // The hut itself already stands on coastal water; more open sea around it
  // is what the backend rewards, not the land it backs onto.
  fishinghut: 'sea',
};

/** Mirrors `BuildingCatalogue.BoostMultiplier`'s 10%-per-neighbour curve, capped at 50% (5 of 6 neighbours). */
function boostMultiplier(matchingNeighbours: number): number {
  return 1 + Math.min(matchingNeighbours * 0.1, 0.5);
}

/** How many of `tile`'s six direct neighbours (never `tile` itself) are `terrain`. */
export function matchingNeighbourCount(
  tile: AxialCoord,
  terrain: Terrain,
  getTile: (q: number, r: number) => Tile,
): number {
  return neighbors(tile).filter((c) => getTile(c.q, c.r).terrain === terrain).length;
}

/** Whether any of `tile`'s six direct neighbours is one of `terrains`. */
export function isNearAnyOf(tile: AxialCoord, terrains: Terrain[], getTile: (q: number, r: number) => Tile): boolean {
  return neighbors(tile).some((c) => terrains.includes(getTile(c.q, c.r).terrain));
}

/**
 * Per-type/level output. None of this is tracked per-building anywhere (the
 * backend/WorldModel only know a settlement's *aggregate* rates, not a
 * single building's own output) so these are derived deterministically from
 * the building's type/level/neighbours purely for display — see HoverInfo's
 * doc comment in HexMapRenderer.ts for the full rationale.
 */
export function buildingStatsFor(
  type: BuildingKind,
  level: number,
  matchingNeighbours = 0,
): BuildingLevelStats {
  switch (type) {
    // Farm and PumpkinFarm are deliberately excluded from BuildingCatalogue.cs's
    // Boosts table (they work a fixed field, not a resource that concentrates
    // nearby) — no terrain or water adjacency changes their output.
    case 'farm': {
      const workersCap = level * 4;
      return {
        output: `+${level * 36} food/h`,
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
      return { output: `+${level * 36} food/h`, workers: `${workersCap}/${workersCap}` };
    }
    case 'lumberjack': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = Math.round(level * 30 * multiplier);
      return {
        output: `+${output} wood/h`,
        modifier: multiplier > 1 ? `Forest (+${Math.round((multiplier - 1) * 100)}%)` : undefined,
      };
    }
    case 'quarry': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = Math.round(level * 24 * multiplier);
      return {
        output: `+${output} stone/h`,
        modifier: multiplier > 1 ? `Mountain (+${Math.round((multiplier - 1) * 100)}%)` : undefined,
      };
    }
    // Placed on coastal water itself (BuildingCatalogue.cs's FishingHut),
    // not merely built near it — but real, server-authoritative production
    // still scales with how much open sea (not the land it backs onto)
    // surrounds it, same 10%-per-neighbour/50%-cap curve as lumberjack/quarry.
    case 'fishinghut': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = Math.round(level * 30 * multiplier);
      return {
        output: `+${output} food/h`,
        modifier: multiplier > 1 ? `Coastal (+${Math.round((multiplier - 1) * 100)}%)` : 'Coastal',
      };
    }
    case 'magictower':
      return { output: `+${level * 6} iron/h`, modifier: 'Arcane' };
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
  lumberjack: { wood: 100, stone: 80, food: 0, iron: 0 },
  quarry: { wood: 100, stone: 80, food: 0, iron: 0 },
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
