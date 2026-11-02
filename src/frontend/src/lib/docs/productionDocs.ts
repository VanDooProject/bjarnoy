// What the resource production docs page (ResourceProductionView.vue) shows beyond the building catalogue.
// Output per level and unlocks come from the catalogue; the boost curves come from buildingEconomy.ts (the client
// mirror of BuildingCatalogue.cs). Only what has no client mirror is written down here: which buildings a mill
// raises (BuildingCatalogue.RadiusBoostTargets) and the storage floor (BuildingCatalogue.BaseStorageCapacity).
import {
  BOOST_TERRAIN,
  additionalStorageHouseRequirement,
  buildingStatsFor,
  radiusBoostPercent,
  radiusBoostRange,
  type BuildingKind,
} from '../map/buildingEconomy';
import { newPlacementDisabled } from '../map/ringCatalogue';

/** The producers in the order the table lists them; the Longhouse (four resources) has its own row. */
export const PRODUCER_TYPES = [
  'lumberjack',
  'quarry',
  'reindeerherder',
  'farm',
  'pumpkinfarm',
  'fishinghut',
  'claybrickworks',
  'bogoreworks',
] as const;
export type ProducerType = (typeof PRODUCER_TYPES)[number];

/** The producers a player can still place: a type whose new placement is disabled (the Quarry) stays out of the docs. */
export const BUILDABLE_PRODUCER_TYPES: readonly ProducerType[] = PRODUCER_TYPES.filter((type) => !newPlacementDisabled(type));

/** The levels the producer table spells out. */
export const PRODUCER_LEVELS = [1, 10] as const;

/** Mirrors `BuildingCatalogue.BaseStorageCapacity`: what each resource can hold before any storage building. */
export const BASE_STORAGE = 500;

/**
 * Mirrors `BuildingCatalogue.RadiusBoostTargets`. The Crop Mill raises Farms only: the backend leaves Pumpkin
 * Farms out ("a different crop"), so this follows it, not the `RADIUS_BOOST_RESOURCE` comment in buildingEconomy.ts.
 */
export const MILLS = [
  { type: 'sawmill', boosts: ['lumberjack'], stands: 'river' },
  { type: 'cropmill', boosts: ['farm'], stands: 'straightRiver' },
  { type: 'hammerschmiede', boosts: ['bogoreworks'], stands: 'bogCreek' },
] as const satisfies readonly { type: BuildingKind; boosts: readonly BuildingKind[]; stands: string }[];

/** The mill levels the boost table spells out. */
export const MILL_LEVELS = [1, 5, 10, 20] as const;

export function millBoostAt(level: number): { percent: number; rings: number } {
  return { percent: Math.round(radiusBoostPercent(level)), rings: radiusBoostRange(level) };
}

/** The terrain kinds whose neighbours boost `type`, or none for a producer without a neighbour boost. */
export function boostTerrainsOf(type: BuildingKind): readonly string[] {
  const t = BOOST_TERRAIN[type];
  return t === undefined ? [] : typeof t === 'string' ? [t] : t;
}

/** The neighbour boost curve, read off the same function the hover card uses: per matching neighbour, and the cap. */
export function neighbourBoost(): { perNeighbour: number; max: number } {
  const percentAt = (n: number) => {
    const m = buildingStatsFor('lumberjack', 1, n).modifier;
    return m?.kind === 'terrainBoost' ? m.percent : 0;
  };
  return { perNeighbour: percentAt(1), max: percentAt(6) };
}

/** What the 2nd, 3rd, 4th and every later Storage house ask for: that many Storage houses at that level. */
export function storageHouseSteps(): { nth: number; later: boolean; count: number; level: number }[] {
  return [1, 2, 3, 4].map((existing) => ({
    nth: existing + 1,
    later: existing === 4,
    ...additionalStorageHouseRequirement(existing),
  }));
}
