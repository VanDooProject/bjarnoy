// Muscle memory: Build (an empty tile) and Upgrade (a built tile) are the ring's primary actions and always sit in
// the first slot of the inner lane, straight above the tile (12 o'clock; `fullCircle` in ringLayout.ts puts slot 0
// at -90 degrees). Whatever else a tile offers (Train, Raze, Hunt, Send army ...) follows after them, in its own order.
const PRIMARY_IDS = ['build', 'upgrade'];

export function primaryActionFirst<T extends { id: string }>(actions: T[]): T[] {
  return [...actions.filter((a) => PRIMARY_IDS.includes(a.id)), ...actions.filter((a) => !PRIMARY_IDS.includes(a.id))];
}
