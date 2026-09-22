// Shared by the settlement hover tooltip (HexMapRenderer.hoverInfoFor) and
// BuildingModal.vue's build/details screen, so both always show the exact
// same "current stats" for a tile instead of two formulas drifting apart.
import type { ResourceLine } from '../../api/types';
import { neighbors, type AxialCoord } from '../hex/coords';
import type { Terrain, Tile } from './types';

export type BuildingKind = NonNullable<Tile['buildingType']>;

export type BuildingOutput =
  | { kind: 'resourceRate'; resource: 'wood' | 'stone' | 'food' | 'iron'; amount: number }
  | { kind: 'populationCapacity'; amount: number }
  | { kind: 'storageCapacity'; amount: number }
  | { kind: 'visionRing'; amount: number };

export type BuildingModifier =
  | { kind: 'borderAnchor' }
  | { kind: 'trainsLandTroops' }
  | { kind: 'trainsShips' }
  | { kind: 'trainsCivilianCrews' }
  | { kind: 'terrainBoost'; terrain: 'forest' | 'mountain'; percent: number }
  | { kind: 'coastal'; percent?: number }
  | { kind: 'arcane' }
  | { kind: 'shrineFavour'; percent: number; domain: 'landAttack' | 'food' | 'wood' | 'shipAttack' }
  | { kind: 'radiusBoost'; percent: number; range: number; resource: 'wood' | 'food' };

/**
 * Structured (not pre-formatted) so callers in different render contexts —
 * HexTooltip.vue and BuildingModal.vue, both translated via useI18n — can
 * each turn the same numbers into their own display text, rather than
 * baking one locale's phrasing into the shared formula.
 */
export interface BuildingLevelStats {
  output?: BuildingOutput;
  modifier?: BuildingModifier;
  workers?: { cap: number };
}

/**
 * The terrain a building's production is boosted by adjacency to, mirroring
 * the server-authoritative table in `BuildingCatalogue.cs`'s `Boosts`
 * dictionary (10% per matching direct neighbour, capped at 50% — see
 * `boostMultiplier` below). A building with no entry here (Farm/PumpkinFarm
 * included) gets no such bonus. Sawmill has no entry either — it has no
 * production of its own to be terrain-boosted any more, see
 * `RADIUS_BOOST_TARGET`/`radiusBoostPercent`/`radiusBoostRange` below.
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

/**
 * Which resource (and, implicitly, which building type — Lumberjack for
 * Sawmill, Farm/PumpkinFarm for CropMill) a radius-boost producer raises the
 * output of within its range, mirroring `BuildingCatalogue.cs`'s
 * `RadiusBoostTargets`. Sawmill/CropMill have no production of their own any
 * more — this replaces it.
 */
export const RADIUS_BOOST_RESOURCE: Partial<Record<BuildingKind, 'wood' | 'food'>> = {
  sawmill: 'wood',
  cropmill: 'food',
};

const MAX_LEVEL = 10;

/** Mirrors `BuildingCatalogue.RadiusBoostPercent`: linear from 5% at level 1 to 100% at level 10. */
export function radiusBoostPercent(level: number): number {
  const clamped = Math.min(Math.max(level, 1), MAX_LEVEL);
  return 5 + (clamped - 1) * (95 / (MAX_LEVEL - 1));
}

/** Mirrors `BuildingCatalogue.RadiusBoostRange`: 1 ring at levels 1-2, +1 ring every 2 levels after. */
export function radiusBoostRange(level: number): number {
  const clamped = Math.min(Math.max(level, 1), MAX_LEVEL);
  return 1 + Math.floor((clamped - 1) / 2);
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
        output: { kind: 'resourceRate', resource: 'food', amount: level * 36 },
        workers: { cap: workersCap },
      };
    }
    case 'hut':
      return { output: { kind: 'populationCapacity', amount: level * 5 } };
    case 'tower':
      return { output: { kind: 'visionRing', amount: level }, modifier: { kind: 'borderAnchor' } };
    // No production/storage of its own — trains the land combat/siege
    // roster in place of the Longhouse. No combat bonus (deferred), unlike
    // Tower, which is why this reads the same as Tower's own "no output"
    // shape rather than inventing a stat line with nothing behind it.
    case 'archeryrange':
      return { modifier: { kind: 'trainsLandTroops' } };
    case 'dockyard':
      return { modifier: { kind: 'trainsShips' } };
    // Trains the land army's core line (Thrall/Spearman/Axeman/Berserker) in
    // place of the Longhouse — the same "trainsLandTroops" shape as Archery
    // Range above, which trains the rest of the roster (see
    // UnitCatalogue's doc comment on the backend for the exact split).
    case 'barracks':
      return { modifier: { kind: 'trainsLandTroops' } };
    // A third food-producer variant alongside Farm/PumpkinFarm — same
    // fixed-field shape, no terrain/adjacency boost (mirrors those two's
    // exclusion from BuildingCatalogue.cs's Boosts table).
    case 'fisherhut': {
      const workersCap = level * 4;
      return {
        output: { kind: 'resourceRate', resource: 'food', amount: level * 32 },
        workers: { cap: workersCap },
      };
    }
    // No production of its own — boosts every Lumberjack within its level's
    // range instead (see radiusBoostPercent/radiusBoostRange above).
    case 'sawmill':
      return {
        modifier: {
          kind: 'radiusBoost',
          percent: Math.round(radiusBoostPercent(level)),
          range: radiusBoostRange(level),
          resource: 'wood',
        },
      };
    case 'longhouse':
      return { output: { kind: 'storageCapacity', amount: level * 100 } };
    // Mirrors BuildingCatalogue.cs's StorageHouse(level): ResourceAmounts.Uniform(1000) * level.
    case 'storagehouse':
      return { output: { kind: 'storageCapacity', amount: level * 1000 } };
    // Mirrors BuildingCatalogue.cs's GreatStorehouse(level): ResourceAmounts.Uniform(2000) * level.
    case 'greatstorehouse':
      return { output: { kind: 'storageCapacity', amount: level * 2000 } };
    case 'pumpkinfarm': {
      const workersCap = level * 4;
      return {
        output: { kind: 'resourceRate', resource: 'food', amount: level * 36 },
        workers: { cap: workersCap },
      };
    }
    case 'lumberjack': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = Math.round(level * 30 * multiplier);
      return {
        output: { kind: 'resourceRate', resource: 'wood', amount: output },
        modifier:
          multiplier > 1
            ? { kind: 'terrainBoost', terrain: 'forest', percent: Math.round((multiplier - 1) * 100) }
            : undefined,
      };
    }
    case 'quarry': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = Math.round(level * 24 * multiplier);
      return {
        output: { kind: 'resourceRate', resource: 'stone', amount: output },
        modifier:
          multiplier > 1
            ? { kind: 'terrainBoost', terrain: 'mountain', percent: Math.round((multiplier - 1) * 100) }
            : undefined,
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
        output: { kind: 'resourceRate', resource: 'food', amount: output },
        modifier:
          multiplier > 1
            ? { kind: 'coastal', percent: Math.round((multiplier - 1) * 100) }
            : { kind: 'coastal' },
      };
    }
    case 'magictower':
      return { output: { kind: 'resourceRate', resource: 'iron', amount: level * 6 }, modifier: { kind: 'arcane' } };
    // Mirrors ShrineCatalogue.Favour.cs: +10% at level 1, +3%/level after,
    // capped at level 5 (+22%) so slotted runes always have headroom.
    case 'shrineofthor':
    case 'shrineoffreyja':
    case 'shrineofullr':
    case 'shrineofnjord': {
      const favour = Math.round((0.10 + 0.03 * (Math.min(level, 5) - 1)) * 100);
      const domain =
        type === 'shrineofthor'
          ? 'landAttack'
          : type === 'shrineoffreyja'
            ? 'food'
            : type === 'shrineofullr'
              ? 'wood'
              : 'shipAttack';
      return { modifier: { kind: 'shrineFavour', percent: favour, domain } };
    }
    // No production or storage of its own yet — its mead is meant for a
    // future morale-boost mechanic, same "no output" shape as townsquare/
    // druidhut below (see BuildingCatalogue.cs's Meadery doc comment).
    case 'meadery':
      return {};
    // No production of its own — boosts every Farm/PumpkinFarm within range
    // instead, same shape as Sawmill above.
    case 'cropmill':
      return {
        modifier: {
          kind: 'radiusBoost',
          percent: Math.round(radiusBoostPercent(level)),
          range: radiusBoostRange(level),
          resource: 'food',
        },
      };
    case 'claybrickworks':
      return { output: { kind: 'resourceRate', resource: 'stone', amount: level * 20 } };
    // No production or storage of its own yet — retired Iron production for
    // a future troop-upgrade mechanic, same "no output" shape as meadery
    // above (see BuildingCatalogue.cs's Smithy doc comment).
    case 'smithy':
      return {};
    // Mirrors BuildingCatalogue.cs's CartWorkshop(level): purely a training
    // gate for the civilian roster it took over from the longhouse
    // (Provisioner/SettlerCrew) — no storage or production of its own.
    case 'cartworkshop':
      return { modifier: { kind: 'trainsCivilianCrews' } };
    // No production or storage of its own yet — see BuildingType.TownSquare/
    // DruidHut's own doc comments on the backend (a future civic/rune
    // mechanic), same "no output" shape as the default case below.
    case 'townsquare':
    case 'druidhut':
      return {};
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
  shrineofullr: { wood: 180, stone: 140, food: 60, iron: 0 },
  shrineofnjord: { wood: 180, stone: 140, food: 60, iron: 0 },
  storagehouse: { wood: 150, stone: 120, food: 0, iron: 0 },
  greatstorehouse: { wood: 300, stone: 260, food: 0, iron: 0 },
  archeryrange: { wood: 140, stone: 100, food: 0, iron: 20 },
  dockyard: { wood: 200, stone: 120, food: 0, iron: 20 },
  barracks: { wood: 130, stone: 110, food: 0, iron: 15 },
  fisherhut: { wood: 100, stone: 80, food: 0, iron: 0 },
  sawmill: { wood: 100, stone: 80, food: 0, iron: 0 },
  // Meadery/CropMill/Smithy/ClayBrickworks are all plain Producer()
  // buildings (BuildingCatalogue.cs), so they share the same base cost as
  // farm/lumberjack/quarry/etc above. TownSquare/DruidHut/CartWorkshop are
  // bespoke definitions with their own Cost.
  meadery: { wood: 100, stone: 80, food: 0, iron: 0 },
  cropmill: { wood: 100, stone: 80, food: 0, iron: 0 },
  smithy: { wood: 100, stone: 80, food: 0, iron: 0 },
  claybrickworks: { wood: 100, stone: 80, food: 0, iron: 0 },
  townsquare: { wood: 160, stone: 140, food: 40, iron: 0 },
  druidhut: { wood: 160, stone: 110, food: 80, iron: 0 },
  cartworkshop: { wood: 150, stone: 110, food: 0, iron: 10 },
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
