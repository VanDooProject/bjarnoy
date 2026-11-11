// Muscle memory: Build (an empty tile) and Upgrade (a built tile) are the ring's primary actions and always sit in
// the first slot of the inner lane, straight above the tile (12 o'clock; `fullCircle` in ringLayout.ts puts slot 0
// at -90 degrees). Whatever else a tile offers (Train, Raze, Hunt, Send army ...) follows after them, in its own order.
const PRIMARY_IDS = ['build', 'upgrade'];

export function primaryActionFirst<T extends { id: string }>(actions: T[]): T[] {
  return [...actions.filter((a) => PRIMARY_IDS.includes(a.id)), ...actions.filter((a) => !PRIMARY_IDS.includes(a.id))];
}

const TRAINING_BUILDINGS = new Set(['archeryrange', 'siegeworkshop', 'dockyard', 'barracks', 'cartworkshop']);

/**
 * The building-specific entry a built tile adds to the ring, next to Upgrade and Raze: Train on every building a unit
 * is trained at (the longhouse trains none), Feasts on a finished Town Square (opens its BuildingModal, where the feast is held).
 */
/** Whether a building of the player's own can be upgraded or razed from the ring: a beach camp is fixed, it has no levels and nothing to tear down. */
export function offersUpgradeAndRaze(buildingType: string): boolean {
  return buildingType !== 'beachcamp';
}

export function buildingEntryId(buildingType: string, level: number): 'train' | 'feasts' | null {
  if (TRAINING_BUILDINGS.has(buildingType)) return 'train';
  if (buildingType === 'townsquare' && level >= 1) return 'feasts';
  return null;
}
