import type { RenownResponse } from '../api/types';

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
