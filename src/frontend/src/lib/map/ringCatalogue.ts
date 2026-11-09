// Small formatting helpers shared by the ring menu's hover card. The numbers
// themselves are server-authoritative and come from the building catalogue
// (`GET /api/v1/buildings`, or its bundled snapshot in demo mode via
// stores/buildingCatalogue.ts) — nothing here re-derives a game rule, it only
// renders one.
import type { ResourceLine } from '../../api/types';
import { resourceName } from '../../i18n/catalogueNames';
import { i18n } from '../../i18n';
import { additionalStorageHouseRequirement } from './buildingEconomy';
import { campHexBuildable } from './campRules';
import { allPlacementRules, placementRuleFor } from './placementRules';
import type { BogTileKind } from './types';
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
 * A catalogue `buildSeconds` as the build actually runs: times Odin's Wisdom (`wisdomFactor`), divided by the world's speed
 * factor. Mirrors the server's `Settlement.ScaledBuildDuration`.
 */
export function scaledBuildSeconds(baseSeconds: number, wisdomFactor: number, speedFactor: number): number {
  return (baseSeconds * wisdomFactor) / speedFactor;
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
 * (standing plus queued) as many as `allowed` — mirrors
 * `Settlement.PlanBuild`'s `BuildRejection.TowerLimitReached`. `allowed` is the
 * server's `construction.towerLimit` (a linked realm: the members' limits added
 * up) in live mode, `buildingEconomy.maxTowers` in demo mode. Undefined while there is room (or while the
 * longhouse itself is still too low, which `longhouseLock` already explains).
 * Like `longhouseLock` this is a progression gate the player can work
 * towards, so it is shown as an explained, disabled bubble.
 */
export function towerLimitLock(towersHeld: number, allowed: number): string | undefined {
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
 * Whether `type` can be placed on this specific Grass hex at all — Sawmill
 * and Crop Mill are built directly on a river tile
 * (`WorldModel.placeBuilding` follows the catalogue's `requiresRiverShapes`/`excludedRiverVariants`: the Sawmill on a straight, a bend or a
 * tight bend but not the hairpin loop, the Crop Mill on a straight only, the bridge on a straight or a bend),
 * and only some shapes have matching art (see `riverBuildingAllowedHere`) —
 * `riverShape` is this hex's own river tile's shape, if it has one, and
 * `riverVariant` its river-art variant (`'plain'` when omitted, matching
 * the backend's default). Unlike `longhouseLock` (a progression gate the
 * player can still work towards and so is shown as a disabled, explained
 * bubble), this is a fixed property of the hex itself: a hex that will
 * never grow a matching river should not offer the bubble at all, so
 * callers filter it out of the category rather than rendering it locked.
 * Every other buildable type is refused on a river hex altogether (`riverShape` is the hex's river tile of any width, `undefined`
 * when there is none); the water buildings — see `isWaterOnlyBuilding` — need coastal water, checked separately.
 */
export function riverBuildingAllowedHere(
  type: string,
  riverShape: string | undefined,
  riverVariant: RiverVariant = 'plain',
  riverWidth: string = 'river',
): boolean {
  const rule = placementRuleFor(type);
  // A river hex of any width or shape (stream, widening, spring, confluence, mouth, bend, straight) takes no ordinary building, walls
  // included: only the river buildings below and the bridge stand on one (matches `Settlement.PlanBuild`'s `onRiverTile`).
  if (!rule || rule.requiresRiverShapes.length === 0) return riverShape === undefined;
  // The river buildings' art is river width: a stream or widening hex never takes one.
  if (riverWidth !== 'river') return false;
  if (riverShape === undefined || !rule.requiresRiverShapes.includes(riverShape)) return false;
  return !rule.excludedRiverVariants.includes(riverVariant);
}

/** The river shapes any river building can stand on (the union over the catalogue). */
function buildableRiverShapes(): Set<string> {
  const shapes = new Set<string>();
  for (const rule of allPlacementRules()) for (const shape of rule.requiresRiverShapes) shapes.add(shape);
  return shapes;
}

/**
 * Why a river building can't take this river hex although the hex itself can host one, in the player's words, or `undefined`: the
 * hex is a full-width tile of a shape some river building stands on, but this building has no art for its curve (the Crop Mill needs a
 * straight piece, the Sawmill no hairpin loop). Shown as an explained, disabled bubble; a stream, a widening, a spring, a confluence
 * or a mouth gets no bubble at all (`riverBuildingAllowedHere`). The player is never told degrees. The bridge has its own lock.
 */
export function riverFitLock(type: string, riverShape: string | undefined, riverVariant: RiverVariant = 'plain', riverWidth: string = 'river'): string | undefined {
  if (type === 'bridge' || (placementRuleFor(type)?.requiresRiverShapes.length ?? 0) === 0) return undefined;
  if (riverWidth !== 'river' || riverShape === undefined || !buildableRiverShapes().has(riverShape)) return undefined;
  if (riverBuildingAllowedHere(type, riverShape, riverVariant, riverWidth)) return undefined;
  return i18n.global.t('hud.ringMenu.riverLock.tooCurved') as string;
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
 * The exact shortfall against `cost`, e.g. "40 Wood, 15 Brick" — omits any
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
 * Buildings that can no longer be placed anew (the Quarry, for now); ones already standing keep producing and upgrading. The catalogue
 * says which (`newPlacementDisabled`, from `BuildingCatalogue.NewPlacementDisabled`); `WorldModel.placeBuilding` (new placements only)
 * refuses them, and the build ring simply does not list them.
 */
export function newPlacementDisabled(type: string): boolean {
  return placementRuleFor(type)?.newPlacementDisabled === true;
}

/** Whether `type` is one of the buildings that stand only on some bog kind (bog-ore works, Clay Brickworks, Hammer Forge). */
export function isBogBoundBuilding(type: string | undefined): boolean {
  return (placementRuleFor(type)?.requiresBogKinds.length ?? 0) > 0;
}

/** Whether a Fishing Hut on `tile` is a lake hut (stands on a bog lake's half shore) rather than a coastal one. */
export function isLakeShoreHut(tile: { buildingType?: string; bog?: { kind: BogTileKind } }): boolean {
  return placementRuleFor(tile.buildingType)?.lakeShoreKinds.includes(tile.bog?.kind ?? 'bog') === true;
}

/**
 * Whether `type` may stand on this one hex, from its terrain, coastal-water flag and bog kind — the client side of
 * `BuildingDefinition.AllowsHex`, read from the catalogue's placement rules (river shape and soil rules are separate, see
 * `riverBuildingAllowedHere`/`cropAllowedHere`). Nothing stands on a lake; a coastal-water building stands on coastal water, or on
 * the bog kinds its `lakeShoreKinds` name (the Fishing Hut on a lake's half shore); a wall's sea end (`alsoOnCoastalWater`) also on
 * coastal water; bog ground takes only what names its kind, never anything a grass building would. Whether a hex then takes a wall is
 * the wall rules' (`WorldModel.palisadePlacement`).
 */
export function buildingAllowedOnHex(
  type: string,
  tile: { terrain: string; isCoastalWater?: boolean; bog?: { kind: BogTileKind } },
): boolean {
  const rule = placementRuleFor(type);
  if (!rule || tile.terrain === 'lake') return false;
  if (tile.terrain === 'sea') return tile.isCoastalWater === true && (rule.requiresCoastalWater || rule.alsoOnCoastalWater);
  if (tile.terrain === 'bog') {
    const kind = tile.bog?.kind;
    if (kind === undefined) return false;
    if (rule.requiresCoastalWater) return rule.lakeShoreKinds.includes(kind);
    if (rule.requiresBogKinds.length > 0) return rule.requiresBogKinds.includes(kind);
    return rule.alsoOnBogKinds.includes(kind);
  }
  if (rule.requiresCoastalWater) return false;
  return rule.allowedTerrain.length === 0 || rule.allowedTerrain.includes(tile.terrain);
}

/**
 * Buildings that stand directly on a coastal-water hex instead of on land (`requiresCoastalWater` in the catalogue; the Fishing Hut
 * also stands on a lake's half shore, see `buildingAllowedOnHex`). Placement (`WorldModel.placeBuilding`) and the building modal's
 * "can this hex be inspected/upgraded" check both read it.
 */
export function isWaterOnlyBuilding(type: string | undefined): boolean {
  return placementRuleFor(type)?.requiresCoastalWater === true;
}

/**
 * Whether the building modal treats a tile as buildable/upgradeable: any
 * non-sea tile, or a sea tile that already carries a water building (open
 * water itself is never offered as an empty build target).
 */
export function tileIsBuildable(tile: {
  terrain: string;
  buildingType?: string;
  camp?: { family: string; empty?: boolean };
}): boolean {
  // A wildlife camp hex is buildable only once the camp is cleared (never Fenrir's brood).
  if (tile.camp && !tile.buildingType && !campHexBuildable(tile.camp)) return false;
  return (tile.terrain !== 'sea' && tile.terrain !== 'lake') || isWaterOnlyBuilding(tile.buildingType) || isWallBuilding(tile.buildingType);
}

/** The palisade and its gate: the wall hexes (`BuildingType.Palisade`/`PalisadeGate`). */
export function isWallBuilding(type: string | undefined): boolean {
  return type === 'palisade' || type === 'palisadegate';
}

/**
 * The reason a wall hex can't be placed (a refusal of `WorldModel.palisadePlacement`), in the player's words, or `undefined` when it
 * can. Like `longhouseLock` it is shown as an explained, disabled bubble: the hex is a fine place for a wall in general, just not for this
 * one right now.
 */
export function palisadeLock(placement: { ok: true } | { ok: false; reason: string }): string | undefined {
  if (placement.ok) return undefined;
  const key = ['branch', 'gateNotStraight', 'river', 'seaEnd', 'occupied'].includes(placement.reason) ? placement.reason : 'terrain';
  return i18n.global.t(`hud.ringMenu.palisadeLock.${key}`) as string;
}

/**
 * The reason a bridge can't be placed on a river hex that otherwise takes one (a Straight, Bend or Bend60 tile; `riverBuildingAllowedHere`
 * hides the bubble on every other hex), in the player's words, or `undefined` when it can: the river there is not a wide one, which a
 * land army already crosses (`BuildRejection.BridgeNeedsWideRiver`), or the island is wasted.
 */
export function bridgeLock(placement: { ok: true } | { ok: false; reason: 'notWide' | 'wasted' }): string | undefined {
  if (placement.ok) return undefined;
  return i18n.global.t(`hud.ringMenu.bridgeLock.${placement.reason}`) as string;
}
