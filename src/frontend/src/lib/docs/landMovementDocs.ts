// What the land movement docs page (LandMovementView.vue) shows beyond the unit catalogue: the ground costs of
// `HexPathfinder.LandTerrainCost` and its stream rule. The game gets the costs from the server with the world
// (`WorldResponse.movement`), so there is no client copy to read them from. Keep these in step with that file.
import { HALF_OPEN_END_COST } from '../map/hexPath';
import { CAUSEWAY_CROSSING_COST, FOOTBRIDGE_CROSSING_COST, GUARDED_BRIDGE_LEVEL } from '../map/bridgeMovement';

/** The ground a land army can enter, with the cost of one hex (`HexPathfinder.LandTerrainCost`, grass = 1). */
export const GROUND_COSTS = [
  { terrain: 'grass', cost: 1 },
  { terrain: 'sand', cost: 1.1 },
  { terrain: 'forest', cost: 1.3 },
  { terrain: 'bog', cost: 2 },
] as const;

/** `HexPathfinder.RiverCrossingCost`: added to the base step of 1 when entering a stream. */
export const RIVER_CROSSING_COST = 8;

/** A stream costs a flat `1 + RiverCrossingCost` whatever it runs over (`HexPathfinder.LandStepCost`). */
export const STREAM_COST = 1 + RIVER_CROSSING_COST;

/** What entering the open end of a wall costs, instead of its ground (`HexPathfinder.HalfOpenEndCost`). */
export const WALL_END_COST = HALF_OPEN_END_COST;

/**
 * What entering a wide river costs over a bridge (`BridgeIndex.CrossingCost`, mirrored by `bridgeCrossingCost` in bridgeMovement.ts), by level:
 * a causeway and a footbridge have a price of their own (`1 + CausewayCrossingCost`, `1 + FootbridgeCrossingCost`); the king's bridge and the
 * guarded one cost what the ground under the river costs (`groundBelow`), the guarded one only for its owner and their friends.
 */
export const BRIDGE_LEVELS = [
  { level: 1, name: 'causeway', cost: 1 + CAUSEWAY_CROSSING_COST, everyone: true },
  { level: 2, name: 'footbridge', cost: 1 + FOOTBRIDGE_CROSSING_COST, everyone: true },
  { level: 3, name: 'kings', cost: null, everyone: true },
  { level: GUARDED_BRIDGE_LEVEL, name: 'guarded', cost: null, everyone: false },
] as const;

/**
 * Where a bridge is unlocked: `BuildingCatalogue` has it at Longhouse 7 (`MinLonghouseLevel`) behind a level-1 Town Square
 * (`RequiredBuildings`).
 */
export const BRIDGE_UNLOCK = { longhouse: 7, townSquare: 1 } as const;

/** The cheapest and dearest ground a bridge can stand on (grass, forest, sand: `BuildingCatalogue.BridgeHex`), the cost of a level 3 and 4 crossing. */
export const BRIDGE_GROUND_COST = {
  min: Math.min(...GROUND_COSTS.filter((g) => g.terrain !== 'bog').map((g) => g.cost)),
  max: Math.max(...GROUND_COSTS.filter((g) => g.terrain !== 'bog').map((g) => g.cost)),
} as const;

/** `FogVisionRadii.ArmyVisionRadiusHexes`: rings of the map a travelling army explores around itself. */
export const ARMY_VISION_RINGS = 2;

/** `CampGenerator.GuardRange` for a strong camp: it guards `2 + level` hexes around itself. */
export function strongCampGuardRange(level: number): number {
  return 2 + level;
}

/** Minutes one army needs to cross one hex of `cost` at `speed` hexes per hour (default world speed). */
export function minutesPerHex(cost: number, speed: number): number {
  return (60 * cost) / speed;
}

/** "15 min", "16.5 min", "2 h 15 min": minutes with at most one decimal, hours from 60 up. */
export function formatMinutes(minutes: number, locale = 'en'): string {
  const rounded = Math.round(minutes * 10) / 10;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (rounded < 60) return `${nf.format(rounded)} min`;
  const hours = Math.floor(rounded / 60);
  const rest = Math.round((rounded - hours * 60) * 10) / 10;
  return rest === 0 ? `${hours} h` : `${hours} h ${nf.format(rest)} min`;
}
