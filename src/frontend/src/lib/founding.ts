import type { RenownResponse } from '../api/types';
import { neighbors } from './hex/coords';
import type { Terrain } from './map/types';

/** Settlers that found a settlement together — mirrors `Founding.RequiredSettlers` in the backend. */
export const SETTLERS_PER_FOUNDING = 5;

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
