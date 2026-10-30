// How the world's standing bridges open a wide river to a land army: `PathRestrictions.bridgeCost` for one army owner. The TS twin of
// Bjarnoy.Domain's Movement/BridgeIndex.cs; the shared golden (river-pathing-golden.json) holds the two to the same routes.
//
// A wide river is impassable to land armies; a bridge on it (level 1 or more, a foundation does not open anything) makes it enterable:
// level 1 (causeway) costs 1 + CAUSEWAY_CROSSING_COST, level 2 (footbridge) 1 + FOOTBRIDGE_CROSSING_COST, level 3 (king's bridge) the land
// terrain's own cost, all for every army; level 4 (guarded bridge) the terrain's cost for its owner's armies and their friends (the same
// guild, or guilds at peace, like a palisade gate) and impassable for everyone else. Streams and fleets are unaffected.
import { coordKey, type AxialCoord } from '../hex/coords';
import type { MovementRules, PathRestrictions } from './hexPath';
import type { Terrain } from './types';

/** Extra cost, on top of the base 1.0 step, of crossing a wide river over a level-1 bridge: HexPathfinder.CausewayCrossingCost. */
export const CAUSEWAY_CROSSING_COST = 5.0;
/** Extra cost, on top of the base 1.0 step, of crossing a wide river over a level-2 bridge: HexPathfinder.FootbridgeCrossingCost. */
export const FOOTBRIDGE_CROSSING_COST = 3.0;
/** The highest bridge level: the guarded one that only its owner and their friends cross. */
export const GUARDED_BRIDGE_LEVEL = 4;

/** One standing bridge hex (level 1 or more) and whose it is (the same opaque owner key `PalisadeWall.owner` uses). */
export interface StandingBridge {
  level: number;
  owner: string;
}

export type StandingBridges = ReadonlyMap<string, StandingBridge>;

/**
 * What an army of `ownerKey` pays to enter the wide-river hex `c` over its bridge, or `null` when there is no bridge or it is a guarded
 * one the army may not cross.
 */
export function bridgeCrossingCost(
  bridge: StandingBridge | undefined,
  terrain: Terrain,
  rules: MovementRules,
  ownerKey: string,
  friendOwners: ReadonlySet<string> = new Set(),
): number | null {
  if (!bridge || bridge.level < 1) return null;
  switch (bridge.level) {
    case 1:
      return 1.0 + CAUSEWAY_CROSSING_COST;
    case 2:
      return 1.0 + FOOTBRIDGE_CROSSING_COST;
    case 3:
      return rules.land[terrain] ?? null;
    default:
      return bridge.owner === ownerKey || friendOwners.has(bridge.owner) ? (rules.land[terrain] ?? null) : null;
  }
}

/** The `bridgeCost` restriction for an army of `ownerKey`, or `undefined` when no bridge stands. */
export function bridgeRestrictions(
  bridges: StandingBridges,
  terrainAt: (c: AxialCoord) => Terrain,
  rules: MovementRules,
  ownerKey: string,
  friendOwners: ReadonlySet<string> = new Set(),
): Pick<PathRestrictions, 'bridgeCost'> | undefined {
  if (bridges.size === 0) return undefined;
  return {
    bridgeCost: (c) => bridgeCrossingCost(bridges.get(coordKey(c)), terrainAt(c), rules, ownerKey, friendOwners),
  };
}
