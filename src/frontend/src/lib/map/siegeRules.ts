// Which wall hexes a player may besiege (endgame "Breaching walls"): the standing palisade or gate of another player's settlement
// that is neither the player's own nor a friend's (same guild, or a guild at peace). A siege is an ordinary Attack on the wall's
// settlement that names the wall hex as its preferred target building (only rams damage a wall); this only drives the ring
// menu's Siege action.

/** The tile facts the rule reads. A foundation (no level yet) is not a wall. */
export interface WallTileFacts {
  buildingType?: string;
  buildingLevel?: number;
  /** The settlement that holds the hex. */
  ownerId?: string;
}

/** True when `tile` is a standing palisade or gate whose owner is another, non-friendly player. */
export function isHostileWallTile(
  tile: WallTileFacts,
  /**
   * The account that owns the wall: a user id; `null` for a rival's anonymous settlement (nobody's friend, so hostile); `undefined`
   * when the hex is not a known rival wall (the player's own, or not loaded).
   */
  ownerPlayerId: string | null | undefined,
  playerId: string,
  friendlyUserIds: ReadonlySet<string>,
): boolean {
  if (tile.buildingType !== 'palisade' && tile.buildingType !== 'palisadegate') return false;
  if (!tile.ownerId || !tile.buildingLevel || tile.buildingLevel < 1) return false;
  if (ownerPlayerId === undefined || ownerPlayerId === playerId) return false;
  return ownerPlayerId === null || !friendlyUserIds.has(ownerPlayerId);
}

/**
 * The dispatch the ring menu's Siege action opens on a rival wall hex: an Attack on the settlement the wall belongs to, with the wall
 * hex as the preferred target building (the same draft state the target-building picker sets). `null` when the hex carries no
 * settlement (nothing to attack).
 */
export function siegeAttackOptions(
  tile: Pick<WallTileFacts, 'ownerId'>,
  wall: { q: number; r: number },
): { mission: 'attack'; targetSettlementId: string; targetBuildingCoord: { q: number; r: number } } | null {
  if (!tile.ownerId) return null;
  return {
    mission: 'attack',
    targetSettlementId: tile.ownerId,
    targetBuildingCoord: { q: wall.q, r: wall.r },
  };
}
