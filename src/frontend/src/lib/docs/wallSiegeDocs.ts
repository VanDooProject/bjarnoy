// The numbers the Walls docs page quotes in its siege section, taken from the game's own mirrors of the backend rules rather
// than typed into the texts: a wall hex (palisade or gate) has `BuildingCatalogue.MaxLevelFor` levels (3), and a won siege takes
// exactly one of them (`SiegeResolver.LevelsTakenFrom`, docs/design/economy.md section 5) however many catapults survive.
import { maxLevelFor } from '../map/buildingEconomy';

export const WALL_SIEGE = {
  /** The levels a palisade hex and a gate have: the won sieges a fully built wall hex takes to breach. */
  levels: maxLevelFor('palisade'),
  /** The levels one won siege takes off a wall hex. */
  levelsPerSiege: 1,
} as const;
