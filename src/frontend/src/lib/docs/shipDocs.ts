// What the ships docs page (ShipsView.vue) shows beyond the unit catalogue: the sea rules that live in the backend.
// Keep these in step with the C# files named on each line.

/** `Founding.ShipCapacity`: Settlers a ship can carry, one founding party (the one thing ships carry besides loot). Admin note only. */
export const SHIP_SETTLER_CAPACITY = { karve: 5, longship: 5 } as const;

/** `BuildingCatalogue.TowerDefenseBonusPercent`: defence a Watchtower adds per level, for the defender. */
export const TOWER_DEFENCE_PERCENT_PER_LEVEL = 5;

/** `HexPathfinder.SeaTerrainCost`: one hex of sea costs 1, shallow or deep alike; no land is enterable. */
export const SEA_HEX_COST = 1;

/** Minutes one fleet needs for one sea hex at `speed` hexes per hour (default world speed). */
export function minutesPerSeaHex(speed: number): number {
  return (60 * SEA_HEX_COST) / speed;
}
