import type { RenownResponse } from '../api/types';
import { neighbors } from './hex/coords';
import type { Terrain } from './map/types';

/** Settlers that found a settlement together — mirrors `Founding.RequiredSettlers` in the backend. */
export const SETTLERS_PER_FOUNDING = 5;

/** Camp builders that set a beach camp up together (and are used up doing it) — mirrors `BeachCamp.RequiredBuilders` in the backend. */
export const CAMP_BUILDERS_PER_CAMP = 2;

/** What a beach camp costs, paid at set-out — mirrors `BeachCamp.Cost` in the backend. */
export const BEACH_CAMP_COST = { wood: 200, stone: 100, food: 0, iron: 0 } as const;

/** How long the army stands on the site before the camp is up, at world speed 1 — mirrors `BeachCamp.BuildDuration`. */
export const BEACH_CAMP_BUILD_SECONDS = 10 * 60;

/** Why the ring's "Set up camp" bubble is locked; see `campLock`. */
export type CampLock =
  | { reason: 'builders'; have: number; need: number }
  | { reason: 'resources'; cost: typeof BEACH_CAMP_COST };

/**
 * What stops a camp right now, or `null` when the army can go: the camp builders at home first, then the camp's cost against
 * what the settlement has free. Whether the site itself is fine is the ring's own filter (`isCampSite`).
 */
export function campLock(
  buildersAtHome: number,
  available: { wood: number; stone: number; food: number; iron: number },
): CampLock | null {
  if (buildersAtHome < CAMP_BUILDERS_PER_CAMP) {
    return { reason: 'builders', have: buildersAtHome, need: CAMP_BUILDERS_PER_CAMP };
  }
  if (available.wood < BEACH_CAMP_COST.wood || available.stone < BEACH_CAMP_COST.stone) {
    return { reason: 'resources', cost: BEACH_CAMP_COST };
  }
  return null;
}

/** Why the ring's "Send settlers" / "Land here" bubble is locked; see `foundingLock`. */
export type FoundingLock =
  | { reason: 'settlers'; have: number; need: number }
  | { reason: 'renown'; total: number; required: number }
  | { reason: 'renownUnknown' };

/**
 * What stops a founding right now, or `null` when the convoy can go. Settlers are checked first
 * (a missing convoy is the most direct blocker), then the account's renown, which the server
 * reports as `canFoundAnother`. Whether the target hex itself is foundable (spacing) is left to
 * the server's own rejection.
 */
export function foundingLock(
  settlersAtHome: number,
  renown: Pick<RenownResponse, 'total' | 'requiredForNextSettlement' | 'canFoundAnother'> | null,
): FoundingLock | null {
  if (settlersAtHome < SETTLERS_PER_FOUNDING) {
    return { reason: 'settlers', have: settlersAtHome, need: SETTLERS_PER_FOUNDING };
  }
  if (!renown) return { reason: 'renownUnknown' };
  if (!renown.canFoundAnother) {
    return { reason: 'renown', total: renown.total, required: renown.requiredForNextSettlement };
  }
  return null;
}

/**
 * A shoreline hex: land with at least one open-sea neighbour — mirrors `Shoreline.IsShoreline` in the backend.
 * Bog lakes (`lake`) are not sea. The ring offers "Land here" (a convoy that sails) on these, "Send settlers" elsewhere.
 */
export function isShorelineHex(coord: { q: number; r: number }, terrainOf: (q: number, r: number) => Terrain): boolean {
  const own = terrainOf(coord.q, coord.r);
  if (own === 'sea' || own === 'lake') return false;
  return neighbors(coord).some((n) => terrainOf(n.q, n.r) === 'sea');
}

/**
 * Whether a hex can take a beach camp: sand on the shoreline, nothing standing on it (a building of any player, a settlement
 * centre, a wildlife camp) and not part of a giant — mirrors `BeachCamp.CheckSite`. There is no spacing rule: an enemy realm is fine.
 */
export function isCampSite(
  tile: { q: number; r: number; terrain: Terrain; buildingType?: string; camp?: { removed?: boolean } },
  terrainOf: (q: number, r: number) => Terrain,
  giantAnchorAt: (coord: { q: number; r: number }) => unknown,
): boolean {
  if (tile.terrain !== 'sand' || !isShorelineHex(tile, terrainOf)) return false;
  if (tile.buildingType) return false;
  if (tile.camp && !tile.camp.removed) return false;
  return !giantAnchorAt(tile);
}
