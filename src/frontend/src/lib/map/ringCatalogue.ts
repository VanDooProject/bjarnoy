// Small formatting helpers shared by the ring menu's hover card. The numbers
// themselves are server-authoritative and come from the building catalogue
// (`GET /api/v1/buildings`, or its bundled snapshot in demo mode via
// stores/buildingCatalogue.ts) — nothing here re-derives a game rule, it only
// renders one.
import type { ResourceLine } from '../../api/types';
import { resourceName } from '../../i18n/catalogueNames';
import { i18n } from '../../i18n';
import { additionalStorageHouseRequirement, maxTowers } from './buildingEconomy';
import type { RiverVariant } from './worldGenerator';

const RESOURCE_KEYS: (keyof ResourceLine)[] = ['wood', 'stone', 'food', 'iron'];

/**
 * `buildSeconds` as the card shows it: "4:00", "12:00", "1:30:00". Mirrors
 * BuildQueuePanel's own countdown formatting so a queued build reads the same
 * before and after it's queued.
 */
export function formatBuildTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * The reason a building can't be placed yet, or undefined when it can. Only
 * the longhouse gate is checked here: terrain is already filtered by which
 * categories the tile offers, and affordability is shown as a red cost chip
 * rather than a hard lock (the player can still queue and let it fill).
 */
export function longhouseLock(requiredLevel: number | undefined, currentLevel: number): string | undefined {
  if (requiredLevel === undefined || requiredLevel <= currentLevel) return undefined;
  return `Requires longhouse ${requiredLevel}`;
}

/**
 * The reason a *new* tower can't be placed: the settlement already holds
 * (standing plus queued) as many as its Longhouse level allows — mirrors
 * `Settlement.PlanBuild`'s `BuildRejection.TowerLimitReached` and
 * `buildingEconomy.maxTowers`. Undefined while there is room (or while the
 * longhouse itself is still too low, which `longhouseLock` already explains).
 * Like `longhouseLock` this is a progression gate the player can work
 * towards, so it is shown as an explained, disabled bubble.
 */
export function towerLimitLock(towersHeld: number, longhouseLevel: number): string | undefined {
  const allowed = maxTowers(longhouseLevel);
  if (allowed === 0 || towersHeld < allowed) return undefined;
  return `Tower limit reached (${towersHeld}/${allowed}) — level up the longhouse for more`;
}

/**
 * The reason a *new* shrine can't be placed: the settlement already holds one
 * (standing or queued) — mirrors `Settlement.PlanBuild`'s
 * `BuildRejection.SettlementAlreadyHasShrine`. A settlement raises one shrine
 * in total, of any god.
 */
export function shrineLimitLock(shrinesHeld: number): string | undefined {
  if (shrinesHeld < 1) return undefined;
  return i18n.global.t('hud.ringMenu.shrineLimitLock') as string;
}

/**
 * The reason an *additional* storage house can't be placed: with `n` held
 * (standing or queued) it needs `min(n, 4)` of them at level
 * `min(10 + 5·(n − 1), 25)` — mirrors `Settlement.PlanBuild`'s
 * `BuildRejection.StorageHouseTooLow`. `standingLevels` are the levels of the
 * standing houses. The first storage house is never locked by this.
 */
export function storageHouseLock(storageHousesHeld: number, standingLevels: readonly number[]): string | undefined {
  if (storageHousesHeld < 1) return undefined;
  const { count, level } = additionalStorageHouseRequirement(storageHousesHeld);
  if (standingLevels.filter((l) => l >= level).length >= count) return undefined;
  return i18n.global.t('hud.ringMenu.storageHouseLock', { count, level }, count) as string;
}

/**
 * The river shapes each river-gated building's vendor art has a matching
 * composite for (`BuildingDefinition.RequiresRiverShape`, mirrored here) —
 * Sawmill's waterwheel reads from the bank on a Straight, gentler 60°-off
 * Bend, or tight 60° Bend60 tile; Crop Mill's stands directly in the
 * current so only a Straight tile has its composite. A type with no entry
 * here has no river requirement at all.
 *
 * The general rule: a river building may only stand where its art matches
 * the hex's river art (Sawmill on straight/bend/bend60, Crop Mill on
 * straight). River art variants (bend180_island/meander, bend120_island/
 * meander) count as their base shape; `bend60_loop` does not allow a
 * Sawmill (see `SAWMILL_EXCLUDED_VARIANTS` below) — its waterwheel reads
 * from the bank of the plain hairpin channel, and the pack has no composite
 * for the full-half-circle loop. See `BuildingCatalogue.cs`'s
 * `SawmillRiverShapes`/`SawmillExcludedRiverVariants`/`CropMillRiverShapes`,
 * which this set has to keep matching.
 */
const RIVER_SHAPES_BY_TYPE: Partial<Record<string, ReadonlySet<string>>> = {
  sawmill: new Set(['straight', 'bend', 'bend60']),
  cropmill: new Set(['straight']),
};

/**
 * The river-art variant(s) that disqualify an otherwise-matching shape —
 * mirrors `BuildingCatalogue.cs`'s `SawmillExcludedRiverVariants`. Only the
 * Sawmill has one: Straight/Bend's own variants (Meander/Island) have a
 * matching Sawmill composite at every one of their shape's own
 * orientations, so only Bend60's Loop is excluded.
 */
const EXCLUDED_VARIANTS_BY_TYPE: Partial<Record<string, ReadonlySet<RiverVariant>>> = {
  sawmill: new Set<RiverVariant>(['loop']),
};

/**
 * Whether `type` can be placed on this specific Grass hex at all — Sawmill
 * and Crop Mill are built directly on a river tile
 * (`WorldModel.placeBuilding` mirrors `BuildingDefinition.RequiresRiverShape`),
 * and only some shapes have matching art (see `RIVER_SHAPES_BY_TYPE`) —
 * `riverShape` is this hex's own river tile's shape, if it has one, and
 * `riverVariant` its river-art variant (`'plain'` when omitted, matching
 * the backend's default). Unlike `longhouseLock` (a progression gate the
 * player can still work towards and so is shown as a disabled, explained
 * bubble), this is a fixed property of the hex itself: a hex that will
 * never grow a matching river should not offer the bubble at all, so
 * callers filter it out of the category rather than rendering it locked.
 * Every other buildable type has no such requirement (the water buildings —
 * see `isWaterOnlyBuilding` — need coastal water, checked separately).
 */
export function riverBuildingAllowedHere(
  type: string,
  riverShape: string | undefined,
  riverVariant: RiverVariant = 'plain',
  riverWidth: string = 'river',
): boolean {
  const allowedShapes = RIVER_SHAPES_BY_TYPE[type];
  if (!allowedShapes) return true;
  // The river buildings' art is river width: a stream or widening hex never takes one.
  if (riverWidth !== 'river') return false;
  if (riverShape === undefined || !allowedShapes.has(riverShape)) return false;
  return !EXCLUDED_VARIANTS_BY_TYPE[type]?.has(riverVariant);
}

/**
 * Whether `type` can be placed given this settlement's island soil — only
 * PumpkinFarm cares (`WorldModel.placeBuilding`/the backend's
 * `Settlement.PlanBuild` mirror this): it's the bonus crop a Pumpkin-soil
 * island unlocks, a "more fertile" island over a Wheat-soil one. Farm stays
 * offered everywhere. `soil` is `undefined` when the caller couldn't resolve
 * an island (e.g. a demo settlement founded with no island id) — permissive
 * by default, same as the backend's null islandSoil.
 */
export function cropAllowedHere(type: string, soil: 'wheat' | 'pumpkin' | undefined): boolean {
  return type !== 'pumpkinfarm' || soil === undefined || soil === 'pumpkin';
}

/**
 * The exact shortfall against `cost`, e.g. "40 Wood, 15 Stone" — omits any
 * resource `stock` already covers. Mirrors `trainingEconomy.ts`'s
 * `formatCostLine` (which shows the whole price), but for what's still
 * missing: a disabled Upgrade/Build bubble's hint needs to say precisely what
 * to go get more of, not restate the full cost the player mostly already has.
 */
export function formatMissingResources(cost: ResourceLine, stock: ResourceLine): string {
  return RESOURCE_KEYS.filter((key) => cost[key] > stock[key])
    .map((key) => `${Math.ceil(cost[key] - stock[key])} ${resourceName(key)}`)
    .join(', ');
}

/**
 * Buildings that stand directly on a coastal-water hex instead of on land
 * (matches BuildingDefinition.RequiresCoastalWater on the backend). The one
 * place the frontend decides this: placement (`WorldModel.placeBuilding`)
 * and the building modal's "can this hex be inspected/upgraded" check both
 * read it, so a new water building is covered everywhere by adding it here.
 */
const WATER_ONLY_BUILDINGS: ReadonlySet<string> = new Set(['fishinghut', 'dockyard', 'shrineofnjord']);

export function isWaterOnlyBuilding(type: string | undefined): boolean {
  return type !== undefined && WATER_ONLY_BUILDINGS.has(type);
}

/**
 * Whether the building modal treats a tile as buildable/upgradeable: any
 * non-sea tile, or a sea tile that already carries a water building (open
 * water itself is never offered as an empty build target).
 */
export function tileIsBuildable(tile: { terrain: string; buildingType?: string }): boolean {
  return (tile.terrain !== 'sea' && tile.terrain !== 'lake') || isWaterOnlyBuilding(tile.buildingType);
}
