// What the land movement docs page (LandMovementView.vue) shows beyond the unit catalogue: the ground costs of
// `HexPathfinder.LandTerrainCost` and its stream rule. The game gets the costs from the server with the world
// (`WorldResponse.movement`), so there is no client copy to read them from. Keep these in step with that file.
import { HALF_OPEN_END_COST } from '../map/hexPath';

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
