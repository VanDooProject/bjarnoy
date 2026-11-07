import { resourceName } from '../../i18n/catalogueNames';
import { i18n } from '../../i18n';
import { additionalStorageHouseRequirement } from './buildingEconomy';
import { campHexBuildable } from './campRules';
const RESOURCE_KEYS = ['wood', 'stone', 'food', 'iron'];
/**
 * `buildSeconds` as the card shows it: "4:00", "12:00", "1:30:00". Mirrors
 * BuildQueuePanel's own countdown formatting so a queued build reads the same
 * before and after it's queued.
 */
export function formatBuildTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
/**
 * The reason a building can't be placed yet, or undefined when it can. Only
 * the longhouse gate is checked here: terrain is already filtered by which
 * categories the tile offers, and affordability is shown as a red cost chip
 * rather than a hard lock (the player can still queue and let it fill).
 */
export function longhouseLock(requiredLevel, currentLevel) {
    if (requiredLevel === undefined || requiredLevel <= currentLevel)
        return undefined;
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
export function towerLimitLock(towersHeld, allowed) {
    if (allowed === 0 || towersHeld < allowed)
        return undefined;
    return `Tower limit reached (${towersHeld}/${allowed}) — level up the longhouse for more`;
}
/**
 * The reason a *new* shrine can't be placed: the settlement already holds one
 * (standing or queued) — mirrors `Settlement.PlanBuild`'s
 * `BuildRejection.SettlementAlreadyHasShrine`. A settlement raises one shrine
 * in total, of any god.
 */
export function shrineLimitLock(shrinesHeld) {
    if (shrinesHeld < 1)
        return undefined;
    return i18n.global.t('hud.ringMenu.shrineLimitLock');
}
/**
 * The reason an *additional* storage house can't be placed: with `n` held
 * (standing or queued) it needs `min(n, 4)` of them at level
 * `min(10 + 5·(n − 1), 25)` — mirrors `Settlement.PlanBuild`'s
 * `BuildRejection.StorageHouseTooLow`. `standingLevels` are the levels of the
 * standing houses. The first storage house is never locked by this.
 */
export function storageHouseLock(storageHousesHeld, standingLevels) {
    if (storageHousesHeld < 1)
        return undefined;
    const { count, level } = additionalStorageHouseRequirement(storageHousesHeld);
    if (standingLevels.filter((l) => l >= level).length >= count)
        return undefined;
    return i18n.global.t('hud.ringMenu.storageHouseLock', { count, level }, count);
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
const RIVER_SHAPES_BY_TYPE = {
    sawmill: new Set(['straight', 'bend', 'bend60']),
    cropmill: new Set(['straight']),
    // The bridge's three tiles (3D_assets hextile135-137) are the straight, the 120 degree bend and the 60 degree bend; whether the
    // hex is also a *wide* river is the bridge rules' (`WorldModel.bridgePlacement`, shown as a lock), not a shape question.
    bridge: new Set(['straight', 'bend', 'bend60']),
};
/**
 * The river-art variant(s) that disqualify an otherwise-matching shape —
 * mirrors `BuildingCatalogue.cs`'s `SawmillExcludedRiverVariants`. Only the
 * Sawmill has one: Straight/Bend's own variants (Meander/Island) have a
 * matching Sawmill composite at every one of their shape's own
 * orientations, so only Bend60's Loop is excluded.
 */
const EXCLUDED_VARIANTS_BY_TYPE = {
    sawmill: new Set(['loop']),
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
export function riverBuildingAllowedHere(type, riverShape, riverVariant = 'plain', riverWidth = 'river') {
    const allowedShapes = RIVER_SHAPES_BY_TYPE[type];
    if (!allowedShapes)
        return true;
    // The river buildings' art is river width: a stream or widening hex never takes one.
    if (riverWidth !== 'river')
        return false;
    if (riverShape === undefined || !allowedShapes.has(riverShape))
        return false;
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
export function cropAllowedHere(type, soil) {
    return type !== 'pumpkinfarm' || soil === undefined || soil === 'pumpkin';
}
/**
 * Buildings that can no longer be placed anew (the Quarry, for now); ones already standing keep producing and upgrading.
 * Mirrors `BuildingCatalogue.NewPlacementDisabled` / `BuildRejection.NewPlacementDisabled`; `WorldModel.placeBuilding` (new
 * placements only) refuses them, and the build ring simply does not list them.
 */
const NEW_PLACEMENT_DISABLED = new Set(['quarry']);
export function newPlacementDisabled(type) {
    return NEW_PLACEMENT_DISABLED.has(type);
}
/**
 * The exact shortfall against `cost`, e.g. "40 Wood, 15 Stone" — omits any
 * resource `stock` already covers. Mirrors `trainingEconomy.ts`'s
 * `formatCostLine` (which shows the whole price), but for what's still
 * missing: a disabled Upgrade/Build bubble's hint needs to say precisely what
 * to go get more of, not restate the full cost the player mostly already has.
 */
export function formatMissingResources(cost, stock) {
    return RESOURCE_KEYS.filter((key) => cost[key] > stock[key])
        .map((key) => `${Math.ceil(cost[key] - stock[key])} ${resourceName(key)}`)
        .join(', ');
}
/**
 * The bog kinds each bog-bound building stands on — mirrors `BuildingDefinition.RequiresBogKind` in `BuildingCatalogue.cs`:
 * Clay Brickworks and bog-ore works on plain moss (not a shore, mouth, creek or lake), the Hammer Forge on a creek
 * (straight or bend; not a mouth or a spring).
 */
const BOG_KINDS_BY_TYPE = {
    claybrickworks: new Set(['bog']),
    bogoreworks: new Set(['bog']),
    hammerschmiede: new Set(['creek']),
};
/** The bog kinds a water building may stand on instead of coastal water — mirrors `BuildingDefinition.LakeShoreKinds`: the Fishing Hut on a lake's half shore. */
const LAKE_SHORE_KINDS_BY_TYPE = {
    fishinghut: new Set(['half']),
};
/** Whether `type` is one of the buildings that stand only on some bog kind (bog-ore works, Clay Brickworks, Hammer Forge). */
export function isBogBoundBuilding(type) {
    return type !== undefined && BOG_KINDS_BY_TYPE[type] !== undefined;
}
/** Whether a Fishing Hut on `tile` is a lake hut (stands on a bog lake's half shore) rather than a coastal one. */
export function isLakeShoreHut(tile) {
    return tile.buildingType !== undefined && LAKE_SHORE_KINDS_BY_TYPE[tile.buildingType]?.has(tile.bog?.kind ?? 'bog') === true;
}
/** Grass, forest, sand or plain bog moss (not a shore, mouth, creek or lake): the ground a wall hex and a tower stand on. */
function wallOrTowerGround(tile) {
    if (tile.terrain === 'bog')
        return tile.bog?.kind === 'bog';
    return tile.terrain === 'grass' || tile.terrain === 'forest' || tile.terrain === 'sand';
}
/**
 * Whether `type` may stand on this one hex, from its terrain, coastal-water flag and bog kind — the client mirror of
 * `BuildingDefinition.AllowsHex` (river shape and soil rules are separate, see `riverBuildingAllowedHere`/`cropAllowedHere`).
 * Nothing stands on a lake or on open sea; the coastal-water buildings stand on coastal water, or (Fishing Hut) on a lake's
 * half shore; bog ground takes only the bog buildings (and that hut), never anything a grass building would.
 */
export function buildingAllowedOnHex(type, tile) {
    if (tile.terrain === 'lake')
        return false;
    // A wall stands on grass, forest, sand or plain bog moss; the palisade (not the gate) also on coastal water, as the wall's sea end. Whether the
    // hex then takes one is the wall rules' (`WorldModel.palisadePlacement`). The tower stands on the same ground, but never on water.
    if (type === 'palisade' || type === 'palisadegate') {
        if (tile.terrain === 'sea')
            return type === 'palisade' && tile.isCoastalWater === true;
        return wallOrTowerGround(tile);
    }
    if (type === 'tower')
        return wallOrTowerGround(tile);
    // A bridge stands on the river tile's own ground: grass, forest or sand (never mountain; BuildingCatalogue.BridgeHex).
    if (type === 'bridge')
        return tile.terrain === 'grass' || tile.terrain === 'forest' || tile.terrain === 'sand';
    const bogKinds = BOG_KINDS_BY_TYPE[type];
    if (bogKinds)
        return tile.terrain === 'bog' && tile.bog !== undefined && bogKinds.has(tile.bog.kind);
    if (isWaterOnlyBuilding(type)) {
        if (tile.terrain === 'sea')
            return tile.isCoastalWater === true;
        return tile.terrain === 'bog' && tile.bog !== undefined && LAKE_SHORE_KINDS_BY_TYPE[type]?.has(tile.bog.kind) === true;
    }
    return tile.terrain !== 'sea' && tile.terrain !== 'bog';
}
/**
 * Buildings that stand directly on a coastal-water hex instead of on land
 * (matches BuildingDefinition.RequiresCoastalWater on the backend; the Fishing Hut also stands on a lake's half shore, see
 * `buildingAllowedOnHex`). The one
 * place the frontend decides this: placement (`WorldModel.placeBuilding`)
 * and the building modal's "can this hex be inspected/upgraded" check both
 * read it, so a new water building is covered everywhere by adding it here.
 */
const WATER_ONLY_BUILDINGS = new Set(['fishinghut', 'dockyard', 'shrineofnjord']);
export function isWaterOnlyBuilding(type) {
    return type !== undefined && WATER_ONLY_BUILDINGS.has(type);
}
/**
 * Whether the building modal treats a tile as buildable/upgradeable: any
 * non-sea tile, or a sea tile that already carries a water building (open
 * water itself is never offered as an empty build target).
 */
export function tileIsBuildable(tile) {
    // A wildlife camp hex is buildable only once the camp is cleared (never Fenrir's brood).
    if (tile.camp && !tile.buildingType && !campHexBuildable(tile.camp))
        return false;
    return (tile.terrain !== 'sea' && tile.terrain !== 'lake') || isWaterOnlyBuilding(tile.buildingType) || isWallBuilding(tile.buildingType);
}
/** The palisade and its gate: the wall hexes (`BuildingType.Palisade`/`PalisadeGate`). */
export function isWallBuilding(type) {
    return type === 'palisade' || type === 'palisadegate';
}
/**
 * The reason a wall hex can't be placed (a refusal of `WorldModel.palisadePlacement`), in the player's words, or `undefined` when it
 * can. Like `longhouseLock` it is shown as an explained, disabled bubble: the hex is a fine place for a wall in general, just not for this
 * one right now.
 */
export function palisadeLock(placement) {
    if (placement.ok)
        return undefined;
    const key = ['branch', 'gateNotStraight', 'river', 'seaEnd', 'occupied'].includes(placement.reason) ? placement.reason : 'terrain';
    return i18n.global.t(`hud.ringMenu.palisadeLock.${key}`);
}
/**
 * The reason a bridge can't be placed on a river hex that otherwise takes one (a Straight, Bend or Bend60 tile; `riverBuildingAllowedHere`
 * hides the bubble on every other hex), in the player's words, or `undefined` when it can: the river there is not a wide one, which a
 * land army already crosses (`BuildRejection.BridgeNeedsWideRiver`), or the island is wasted.
 */
export function bridgeLock(placement) {
    if (placement.ok)
        return undefined;
    return i18n.global.t(`hud.ringMenu.bridgeLock.${placement.reason}`);
}
