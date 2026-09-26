// Small formatting helpers shared by the ring menu's hover card. The numbers
// themselves are server-authoritative and come from the building catalogue
// (`GET /api/v1/buildings`, or its bundled snapshot in demo mode via
// stores/buildingCatalogue.ts) — nothing here re-derives a game rule, it only
// renders one.
import type { ResourceLine } from '../../api/types';
import { resourceName } from '../../i18n/catalogueNames';
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
 * Every other buildable type has no such requirement (Fisher Hut moved to
 * the water category instead — see `RingMenu`'s `WATER_CATEGORY` — since
 * it's now built on coastal water itself, exactly like Fishing Hut/
 * Dockyard, with no separate check needed).
 */
export function riverBuildingAllowedHere(
  type: string,
  riverShape: string | undefined,
  riverVariant: RiverVariant = 'plain',
): boolean {
  const allowedShapes = RIVER_SHAPES_BY_TYPE[type];
  if (!allowedShapes) return true;
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
