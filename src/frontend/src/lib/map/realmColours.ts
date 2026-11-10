import type { Settlement } from './types';

/**
 * Owner colours of the map: your own realm is blue, a realm of your guild is
 * green, one of a guild at peace with yours (active treaty) is purple, any
 * other realm is red. Gold is the UI accent ("do this next", selection,
 * click-to-place) and is deliberately not an owner colour. Keep in sync with
 * `--realm-own` / `--realm-guild` / `--realm-treaty` / `--rival` in
 * `src/style.css`.
 */
export const OWN_REALM_COLOR = 0x3f7fe8;
export const GUILD_REALM_COLOR = 0x4fd17a;
export const TREATY_REALM_COLOR = 0x9b5cf0;
export const RIVAL_REALM_COLOR = 0xe2705f;

/** The colour a settlement (and the realm it holds) is drawn in for the player `playerId`; an unknown settlement reads as a rival. */
export function realmColor(settlement: Settlement | undefined, playerId: string): number {
  if (settlement?.ownerId === playerId) return OWN_REALM_COLOR;
  if (settlement?.relation === 'guild') return GUILD_REALM_COLOR;
  if (settlement?.relation === 'treaty') return TREATY_REALM_COLOR;
  return RIVAL_REALM_COLOR;
}
