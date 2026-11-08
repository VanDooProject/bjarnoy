/**
 * Razing numbers (docs/design/construction-slots.md, "Razing"), mirrored from `BuildingCatalogue` on the server. One place
 * for the ring card and anything else that quotes them; the server is the authority, these only preview its result.
 */
import type { ResourceLine } from '../../api/types';
import type { RingAvailability } from './ringAvailability';

/** A raze takes this share of the razed level's build time (`BuildingCatalogue.RazeTimeFactor`). */
export const RAZE_TIME_FACTOR = 0.75;

/** The share of the razed level's cost that comes back when the raze completes (rounded down per resource). */
export const RAZE_REFUND_FRACTION = 1 / 3;

/** Seconds a raze of a level with this (already scaled) build time takes. */
export function razeSeconds(buildSeconds: number): number {
  return buildSeconds * RAZE_TIME_FACTOR;
}

/** What razing a level refunds: a third of its cost, rounded down per resource. The server also caps it by the storage room. */
export function razeRefund(cost: ResourceLine): ResourceLine {
  const third = (amount: number) => Math.floor(amount * RAZE_REFUND_FRACTION + 1e-9);
  return { wood: third(cost.wood), stone: third(cost.stone), food: third(cost.food), iron: third(cost.iron) };
}

/** Why a raze can't be queued right now; null when it can (it may still wait in the premium queue). */
export type RazeBlock = 'longhouse' | 'hexBusy' | 'noSlot';

/**
 * What holds the Raze bubble back: the Longhouse is never razable, a hex with an order takes no other, and without a free
 * slot (or room in the waiting queue) the order would be refused. `availability` is the raze's own (no cost, the razed level's
 * slots, `hexBusy` set when the hex has an order).
 */
export function razeBlock(
  buildingType: string,
  hexBusy: boolean,
  availability: Pick<RingAvailability, 'state'>,
): RazeBlock | null {
  if (buildingType === 'longhouse') return 'longhouse';
  if (hexBusy) return 'hexBusy';
  return availability.state === 'waiting' ? 'noSlot' : null;
}
