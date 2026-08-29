// Mirrors src/backend/src/Bjarnoy.Domain/Trade/TradeRatio.cs exactly (issue
// #46's design brief): a player may offer at most `DEFAULT_MAX_RATIO` units
// of one resource for one unit of another on the open market, or
// `GUILD_MAX_RATIO` between guild mates. Kept here as a standalone module
// (rather than inlined in TradePanel.vue) so both the live-mode instant
// client-side check (TradePanel) and the demo-mode simulation
// (WorldModel.postTradeOffer) validate against the exact same rule instead
// of two hand-copied versions drifting apart.

/** Max ratio (offered:requested or requested:offered) on the open market. */
export const DEFAULT_MAX_RATIO = 2;

/** Max ratio between guild mates. */
export const GUILD_MAX_RATIO = 8;

export type TradeRatioRejection = 'ZeroAmount' | 'SameResource' | 'RatioExceeded' | null;

/**
 * Validates offered/requested amounts and resources against the ratio
 * corridor, exactly as `TradeRatio.Validate` does server-side. Returns the
 * rejection reason (matching the backend's `TradeRejection` names) or null
 * if the trade is within bounds. Does not check resource stock/carts/
 * longhouse level — those are server-only (or, in demo mode,
 * WorldModel-only) checks that need more context than a ratio check does.
 */
export function validateTradeRatio(
  offeredResource: string,
  offeredAmount: number,
  requestedResource: string,
  requestedAmount: number,
  guildOnly: boolean,
): TradeRatioRejection {
  if (offeredAmount <= 0 || requestedAmount <= 0) return 'ZeroAmount';
  if (offeredResource === requestedResource) return 'SameResource';

  const maxRatio = guildOnly ? GUILD_MAX_RATIO : DEFAULT_MAX_RATIO;
  // Symmetric corridor: at 1:2 you may post 400 for 200 or 200 for 400, but
  // never 500 for 200 in either direction.
  if (offeredAmount > maxRatio * requestedAmount || requestedAmount > maxRatio * offeredAmount) {
    return 'RatioExceeded';
  }
  return null;
}
