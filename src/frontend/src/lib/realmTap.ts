/**
 * The realm a tap on a hex should switch to first: in the settlement view only, when the hex belongs to another of the player's
 * realms than the one being run. World zoom never switches. `ownRealmOf` is `world.ownRealmOf`.
 */
export function realmToSwitchTo(
  mode: 'settlement' | 'world',
  tileOwnerId: string | null | undefined,
  selectedRealmId: string | null,
  ownRealmOf: (settlementId: string | null | undefined) => string | null,
): string | null {
  if (mode !== 'settlement') return null;
  const realm = ownRealmOf(tileOwnerId);
  return realm && realm !== selectedRealmId ? realm : null;
}
