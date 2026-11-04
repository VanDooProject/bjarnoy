// Buildings outside the realm (docs/design/economy.md section 5, "Buildings outside the realm decay"): such a building has no function
// and loses a level at a steady pace until the realm reaches it again. The server owns the rule and sends the state per building
// (`PlacedBuildingResponse.outsideRealmSince`, `nextLevelLossInSeconds`); this module is the one place the client reads it, so the map
// (gates and bridges open to everyone), the building window and anything else agree and nothing recomputes the decay.
import type { PlacedBuildingResponse } from '../../api/types';

/** Whether the server marked the building as standing outside its owner's realm. */
export function isOutsideRealm(building: Pick<PlacedBuildingResponse, 'outsideRealmSince'> | undefined | null): boolean {
  return !!building?.outsideRealmSince;
}

/**
 * Seconds until the building loses its next level, counted down from when the answer arrived (`fetchedAtMs`), or null when the
 * building is inside the realm or the server gave no time (a frozen world clock).
 */
export function secondsToNextLevelLoss(
  building: Pick<PlacedBuildingResponse, 'outsideRealmSince' | 'nextLevelLossInSeconds'> | undefined | null,
  fetchedAtMs: number,
  nowMs: number,
): number | null {
  if (!isOutsideRealm(building) || building?.nextLevelLossInSeconds == null) return null;
  return Math.max(0, building.nextLevelLossInSeconds - (nowMs - fetchedAtMs) / 1000);
}

/**
 * A wait as the player reads it, in the player's language: days and hours from a day on, hours and minutes from an hour on, else
 * minutes (never less than one).
 */
export function formatDecayWait(seconds: number, locale: string): string {
  const unit = (value: number, name: 'day' | 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'long' }).format(value);
  const total = Math.max(0, Math.round(seconds / 60));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return hours > 0 ? `${unit(days, 'day')}, ${unit(hours, 'hour')}` : unit(days, 'day');
  if (hours > 0) return minutes > 0 ? `${unit(hours, 'hour')}, ${unit(minutes, 'minute')}` : unit(hours, 'hour');
  return unit(Math.max(1, minutes), 'minute');
}
