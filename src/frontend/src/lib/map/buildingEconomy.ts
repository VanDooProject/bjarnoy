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
  | { kind: 'terrainBoost'; terrain: 'forest' | 'mountain' | 'bog' | 'lake'; percent: number }
  | { kind: 'coastal'; percent?: number }
  | { kind: 'shrineFavour'; percent: number; domain: 'landAttack' | 'food' | 'wood' | 'shipAttack' }
  | { kind: 'odinFavour'; buildTimePercent: number; visionRings: number }
  | { kind: 'radiusBoost'; percent: number; range: number; resource: 'wood' | 'food' | 'iron' }
  // A wall hex (docs/design/economy.md section 5): it blocks every land army; the gate lets the owner's through.
  | { kind: 'palisadeWall' }
  | { kind: 'palisadeGate' };

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
export const BOOST_TERRAIN: Partial<Record<BuildingKind, Terrain | readonly Terrain[]>> = {
  lumberjack: 'forest',
  quarry: 'mountain',
  // The hut itself already stands on coastal water; more open sea around it
  // is what the backend rewards, not the land it backs onto. A hut on a bog
  // lake's half shore counts the lake hexes around it the same way.
  fishinghut: ['sea', 'lake'],
  // The bog around a bog-ore works: any bog hex (moss, shore, creek, mouth, spring) or lake water.
  bogoreworks: ['bog', 'lake'],
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
export const RADIUS_BOOST_RESOURCE: Partial<Record<BuildingKind, 'wood' | 'food' | 'iron'>> = {
  sawmill: 'wood',
  cropmill: 'food',
  // Raises the bog-ore works within range (BuildingCatalogue.RadiusBoostTargets).
  hammerschmiede: 'iron',
};

/** The level the mills (Sawmill, Crop Mill) top out at — where their boost reaches +100%. */
const RADIUS_BOOST_MAX_LEVEL = 20;

/** Mirrors `BuildingCatalogue.RadiusBoostPercent`: linear from 5% at level 1 to 100% at level 20. */
export function radiusBoostPercent(level: number): number {
  const clamped = Math.min(Math.max(level, 1), RADIUS_BOOST_MAX_LEVEL);
  return 5 + (clamped - 1) * (95 / (RADIUS_BOOST_MAX_LEVEL - 1));
}

/** Mirrors `BuildingCatalogue.RadiusBoostRange`: 1 ring at levels 1-4, +1 ring every 4 levels after (5 at 17-20). */
export function radiusBoostRange(level: number): number {
  const clamped = Math.min(Math.max(level, 1), RADIUS_BOOST_MAX_LEVEL);
  return 1 + Math.floor((clamped - 1) / 4);
}

/**
 * Mirrors `BuildingCatalogue.MaxLevelFor` (docs/design/economy.md §4):
 * Longhouse 30; resource producers and Storage House 25; military/civic
 * buildings and the mills 20; Tower and Great Storehouse 10; shrines 5; Palisade and Palisade Gate 3.
 * `hut` is demo-only (no backend entry) and gets the small-building ceiling.
 */
export function maxLevelFor(type: BuildingKind): number {
  switch (type) {
    case 'longhouse':
      return 30;
    case 'lumberjack':
    case 'quarry':
    case 'claybrickworks':
    case 'reindeerherder':
    case 'farm':
    case 'pumpkinfarm':
    case 'fishinghut':
    case 'bogoreworks':
    case 'storagehouse':
      return 25;
    case 'barracks':
    case 'archeryrange':
    case 'dockyard':
    case 'townsquare':
    case 'cartworkshop':
    case 'druidhut':
    case 'smithy':
    case 'meadery':
    case 'sawmill':
    case 'cropmill':
    case 'hammerschmiede':
      return 20;
    case 'tower':
    case 'greatstorehouse':
    case 'hut':
      return 10;
    case 'shrineofthor':
    case 'shrineoffreyja':
    case 'shrineofullr':
    case 'shrineofnjord':
    case 'odinstatue':
      return 5;
    case 'palisade':
    case 'palisadegate':
      return 3;
    default:
      return 0;
  }
}

/**
 * Mirrors `BuildingCatalogue.MaxTowers`: how many towers a settlement with a
 * Longhouse at `longhouseLevel` may hold — none below LH 3, then
 * `1 + max(0, floor((LH − 5) / 2))` (1 for LH 3-6, 2 at LH 7, … 13 at LH 29-30).
 */
export function maxTowers(longhouseLevel: number): number {
  return longhouseLevel < 3 ? 0 : 1 + Math.max(0, Math.floor((longhouseLevel - 5) / 2));
}

/**
 * Every shrine building type — `BuildingCatalogue.GodOf(type) is not null`. A
 * settlement raises at most one of them in total
 * (`BuildRejection.SettlementAlreadyHasShrine`).
 */
export const SHRINE_BUILDING_TYPES: ReadonlySet<string> = new Set([
  'shrineofthor',
  'shrineoffreyja',
  'shrineofullr',
  'shrineofnjord',
  'odinstatue',
]);

/**
 * Mirrors `Settlement.BuildTimeFactor`: Odin's Wisdom takes 2% off every
 * build's duration per Odin Statue level (levels past 5 keep level 5's 10%).
 */
export function wisdomBuildTimeFactor(odinLevel: number): number {
  return 1 - 0.02 * Math.min(Math.max(odinLevel, 0), 5);
}

/**
 * Mirrors `Settlement.VisionBonusRings`: Odin's Ravens add two rings of fog
 * vision per Odin Statue level (10 at level 5) to the settlement's claim, its
 * towers and its travelling armies.
 */
export function ravensRings(odinLevel: number): number {
  return 2 * Math.min(Math.max(odinLevel, 0), 5);
}

/**
 * Mirrors `BuildingCatalogue.AdditionalStorageHouseRequirement`: with
 * `existing` storage houses held (standing plus queued), one more needs
 * `min(existing, 4)` of them at level `min(10 + 5·(existing − 1), 25)` — 1 at
 * L10, 2 at L15, 3 at L20, then 4 at L25 (the max), after which any number
 * more is allowed. `{ count: 0, level: 0 }` for the first house.
 */
export function additionalStorageHouseRequirement(existing: number): { count: number; level: number } {
  if (existing < 1) return { count: 0, level: 0 };
  return { count: Math.min(existing, 4), level: Math.min(10 + 5 * (existing - 1), 25) };
}

/** Mirrors `BuildingCatalogue.BogOreWorksIronAtLevelOne`: iron per hour of a level-1 bog-ore works. */
export const BOG_ORE_WORKS_IRON_AT_LEVEL_ONE = 20;

/** Mirrors `BuildingCatalogue.ProductionFor`: a level's total output is `perHourAtLevelOne · 1.20^(level−1)`. */
function producerOutput(perHourAtLevelOne: number, level: number, multiplier = 1): number {
  return Math.round(perHourAtLevelOne * Math.pow(1.2, level - 1) * multiplier);
}

/** Mirrors `BuildingCatalogue.GeometricCapacity`: `c1 · (g^L − 1) / (g − 1)` per resource. */
function geometricCapacity(c1: number, growth: number, level: number): number {
  return Math.round((c1 * (Math.pow(growth, level) - 1)) / (growth - 1));
}

/** How many of `tile`'s six direct neighbours (never `tile` itself) are `terrain` (or any of them, when several). */
export function matchingNeighbourCount(
  tile: AxialCoord,
  terrain: Terrain | readonly Terrain[],
  getTile: (q: number, r: number) => Tile,
): number {
  const wanted = typeof terrain === 'string' ? [terrain] : terrain;
  return neighbors(tile).filter((c) => wanted.includes(getTile(c.q, c.r).terrain)).length;
}

/**
 * `buildingStatsFor` for a building standing on `tile`: reads the boost terrain's neighbour count off the map, and knows a
 * Fishing Hut on a bog lake's half shore boosts by lake (not coastal) water. One helper for the hover card, the building
 * modal and the ring menu, so they can't drift apart.
 */
export function buildingStatsAt(
  type: BuildingKind,
  level: number,
  tile: AxialCoord & { bog?: Tile['bog'] },
  getTile: (q: number, r: number) => Tile,
): BuildingLevelStats {
  const boostTerrain = BOOST_TERRAIN[type];
  const matching = boostTerrain ? matchingNeighbourCount(tile, boostTerrain, getTile) : 0;
  return buildingStatsFor(type, level, matching, type === 'fishinghut' && tile.bog?.kind === 'half');
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
  onLake = false,
): BuildingLevelStats {
  switch (type) {
    // ReindeerHerder, Farm and PumpkinFarm are deliberately excluded from
    // BuildingCatalogue.cs's Boosts table (they work a herd or a fixed field,
    // not a resource that concentrates nearby) — no terrain or water adjacency
    // changes their output. The herder is the starting food building; Farm is
    // buildable everywhere from LH 4; PumpkinFarm is gated to Pumpkin-soil
    // islands (see ringCatalogue.ts's cropAllowedHere) and yields more, the
    // "more fertile" island's bonus crop.
    case 'reindeerherder':
    case 'farm': {
      const workersCap = level * 4;
      return {
        output: { kind: 'resourceRate', resource: 'food', amount: producerOutput(40, level) },
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
    // Mirrors BuildingCatalogue.cs's Longhouse(level): Uniform(250) * level.
    case 'longhouse':
      return { output: { kind: 'storageCapacity', amount: level * 250 } };
    // Mirrors BuildingCatalogue.cs's StorageHouse(level): 600 * (1.22^L - 1) / 0.22 per resource.
    case 'storagehouse':
      return { output: { kind: 'storageCapacity', amount: geometricCapacity(600, 1.22, level) } };
    // Mirrors BuildingCatalogue.cs's GreatStorehouse(level): 2500 * (1.30^L - 1) / 0.30 per resource.
    case 'greatstorehouse':
      return { output: { kind: 'storageCapacity', amount: geometricCapacity(2500, 1.3, level) } };
    case 'pumpkinfarm': {
      const workersCap = level * 4;
      return {
        output: { kind: 'resourceRate', resource: 'food', amount: producerOutput(44, level) },
        workers: { cap: workersCap },
      };
    }
    case 'lumberjack': {
      const multiplier = boostMultiplier(matchingNeighbours);
      const output = producerOutput(40, level, multiplier);
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
      const output = producerOutput(40, level, multiplier);
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
      const output = producerOutput(40, level, multiplier);
      return {
        output: { kind: 'resourceRate', resource: 'food', amount: output },
        modifier: onLake
          ? multiplier > 1
            ? { kind: 'terrainBoost', terrain: 'lake', percent: Math.round((multiplier - 1) * 100) }
            : undefined
          : multiplier > 1
            ? { kind: 'coastal', percent: Math.round((multiplier - 1) * 100) }
            : { kind: 'coastal' },
      };
    }
    // Iron, from bog moss only; boosted by the bog, creeks and lakes around it (10% each, capped at 50%) and by the
    // Hammerschmiede. P1 is BuildingCatalogue.BogOreWorksIronAtLevelOne, tuned in the Economy lab.
    case 'bogoreworks': {
      const multiplier = boostMultiplier(matchingNeighbours);
      return {
        output: { kind: 'resourceRate', resource: 'iron', amount: producerOutput(BOG_ORE_WORKS_IRON_AT_LEVEL_ONE, level, multiplier) },
        modifier:
          multiplier > 1
            ? { kind: 'terrainBoost', terrain: 'bog', percent: Math.round((multiplier - 1) * 100) }
            : undefined,
      };
    }
    // No production of its own: raises every bog-ore works within range, like the Sawmill raises Lumberjacks.
    case 'hammerschmiede':
      return {
        modifier: {
          kind: 'radiusBoost',
          percent: Math.round(radiusBoostPercent(level)),
          range: radiusBoostRange(level),
          resource: 'iron',
        },
      };
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
    // Mirrors ShrineCatalogue.Favour(Odin): Wisdom takes 2% off every build per
    // level, Ravens adds two rings of vision per level (levels past 5 keep the
    // level-5 favour).
    case 'odinstatue':
      return {
        modifier: {
          kind: 'odinFavour',
          buildTimePercent: Math.round((1 - wisdomBuildTimeFactor(level)) * 100),
          visionRings: ravensRings(level),
        },
      };
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
      return { output: { kind: 'resourceRate', resource: 'stone', amount: producerOutput(36, level) } };
    // The Weaponsmith (display name; the type stays `smithy`): no production
    // or storage of its own, a troop-upgrade building only — same "no output"
    // shape as meadery above (see BuildingCatalogue.cs's Smithy doc comment).
    case 'smithy':
      return {};
    // Mirrors BuildingCatalogue.cs's CartWorkshop(level): purely a training
    // gate for the civilian roster it took over from the longhouse
    // (Provisioner/SettlerCrew) — no storage or production of its own.
    case 'cartworkshop':
      return { modifier: { kind: 'trainsCivilianCrews' } };
    // A wall hex: no production, it stops land armies (the gate lets only its owner's through).
    case 'palisade':
      return { modifier: { kind: 'palisadeWall' } };
    case 'palisadegate':
      return { modifier: { kind: 'palisadeGate' } };
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

/** Cost growth per level: ×1.30 for every building, ×1.34 for the Longhouse. Mirrors BuildingCatalogue.cs's CostFactor. */
function costFactor(type: BuildingKind, level: number): number {
  return Math.pow(type === 'longhouse' ? 1.34 : 1.3, level - 1);
}

// Base (level-1) resource cost per type, mirroring BuildingCatalogue.cs's
// per-type builders. Buildings cost no iron. "hut" has no backend
// catalogue entry — it's demo-only, see SettlementView.vue's build() doc
// comment — so it's approximated at the producer cost.
const PRODUCER_COST: ResourceLine = { wood: 50, stone: 40, food: 15, iron: 0 };
const SMALL_BUILDING_COST: ResourceLine = { wood: 100, stone: 80, food: 0, iron: 0 };
const BASE_COST: Record<BuildingKind, ResourceLine> = {
  hut: PRODUCER_COST,
  reindeerherder: PRODUCER_COST,
  farm: PRODUCER_COST,
  pumpkinfarm: PRODUCER_COST,
  fishinghut: PRODUCER_COST,
  lumberjack: PRODUCER_COST,
  quarry: PRODUCER_COST,
  claybrickworks: PRODUCER_COST,
  bogoreworks: PRODUCER_COST,
  hammerschmiede: SMALL_BUILDING_COST,
  longhouse: { wood: 120, stone: 100, food: 60, iron: 0 },
  tower: { wood: 120, stone: 200, food: 0, iron: 0 },
  shrineofthor: { wood: 180, stone: 140, food: 60, iron: 0 },
  shrineoffreyja: { wood: 180, stone: 140, food: 60, iron: 0 },
  shrineofullr: { wood: 180, stone: 140, food: 60, iron: 0 },
  shrineofnjord: { wood: 180, stone: 140, food: 60, iron: 0 },
  odinstatue: { wood: 180, stone: 140, food: 60, iron: 0 },
  storagehouse: { wood: 80, stone: 60, food: 0, iron: 0 },
  greatstorehouse: { wood: 300, stone: 260, food: 0, iron: 0 },
  archeryrange: { wood: 140, stone: 100, food: 0, iron: 0 },
  dockyard: { wood: 200, stone: 120, food: 0, iron: 0 },
  barracks: { wood: 130, stone: 110, food: 0, iron: 0 },
  sawmill: SMALL_BUILDING_COST,
  meadery: SMALL_BUILDING_COST,
  cropmill: SMALL_BUILDING_COST,
  smithy: SMALL_BUILDING_COST,
  townsquare: { wood: 160, stone: 140, food: 40, iron: 0 },
  druidhut: { wood: 160, stone: 110, food: 80, iron: 0 },
  cartworkshop: { wood: 150, stone: 110, food: 0, iron: 0 },
  // One wall hex, plain or gate: BuildingCatalogue.PalisadeHex.
  palisade: { wood: 40, stone: 10, food: 0, iron: 0 },
  palisadegate: { wood: 40, stone: 10, food: 0, iron: 0 },
};

/** Resource cost to build `type` at `targetLevel` (1 for a fresh build, current level + 1 for an upgrade). */
export function buildingUpgradeCost(type: BuildingKind, targetLevel: number): ResourceLine {
  const base = BASE_COST[type];
  const factor = costFactor(type, targetLevel);
  return {
    wood: Math.round(base.wood * factor),
    stone: Math.round(base.stone * factor),
    food: Math.round(base.food * factor),
    iron: Math.round(base.iron * factor),
  };
}
