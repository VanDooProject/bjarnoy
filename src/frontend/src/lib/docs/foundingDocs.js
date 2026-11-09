/** `SettlementService.MinimumSpacing`: hexes between a new settlement and every other settlement's claim border. */
export const MINIMUM_SPACING = 15;
/** `BuildingCatalogue.BaseStorageCapacity`: storage per resource before any storage building. */
export const BASE_STORAGE = 500;
/** `BuildingCatalogue.FoundingHeadroom`: how far below its full storage a new settlement's stock starts. */
export const FOUNDING_HEADROOM = 50;
/** `Founding.CostMultiplier`: the Settler price doubles with every settlement you already hold (×1 at one). */
export function settlerCostMultiplier(settlementsHeld) {
    return 2 ** Math.max(0, settlementsHeld - 1);
}
/** `RenownThresholds.RequiredFor`: the renown you need to found your Nth settlement (55,000 for the 2nd, doubling). */
export function renownRequired(settlementNumber) {
    return settlementNumber <= 1 ? 0 : 55_000 * 2 ** (settlementNumber - 2);
}
/** `Feasts.Duration`: hours a Town Square feast runs. */
export const FEAST_HOURS = 12;
/** `Feasts.CostFor`: each of wood, stone and food a feast costs at a Town Square level. */
export function feastCost(townSquareLevel) {
    return Math.round(800 * 1.25 ** (Math.max(1, townSquareLevel) - 1));
}
/** `Feasts.RenownFor`: renown a finished feast grants at a Town Square level. */
export function feastRenown(townSquareLevel) {
    return Math.round(3500 * 1.15 ** (Math.max(1, townSquareLevel) - 1));
}
/** `BuildingCatalogue.FoundingStock`: a new settlement starts with its storage less the headroom, and no iron. */
export function foundingStock(longhouseLevelOneStorage) {
    const each = BASE_STORAGE + longhouseLevelOneStorage - FOUNDING_HEADROOM;
    return { wood: each, stone: each, food: each, iron: 0 };
}
