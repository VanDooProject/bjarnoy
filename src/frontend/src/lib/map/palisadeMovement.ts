// How the world's standing palisade hexes move a land army: the pathfinding restrictions (`PathRestrictions.blocked`,
// `friendlyGate`, `halfOpen`) for one army owner. The TS twin of Bjarnoy.Domain's Movement/PalisadeIndex.cs; the shared golden
// (river-pathing-golden.json) holds the two to the same routes.
//
// Every wall hex blocks every army, the owner's included, with two exceptions (docs/design/economy.md section 5): a gate is passable
// for its owner's armies only, and a land end (a plain palisade hex with exactly one wall neighbour) is half open, passable for every
// army at HALF_OPEN_END_COST, unless it touches a mountain or a wide river (a sealed end, which blocks like any wall hex). The sea end
// stands on a sea hex a land army never enters anyway. Fleets are unaffected.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { classifyEnd } from './palisadeTiles';
import type { PathRestrictions } from './hexPath';
import type { Terrain } from './types';

/** One standing wall hex (a palisade of level 1 or more; a foundation does not block): whether it is a gate and whose it is. */
export interface PalisadeWall {
  gate: boolean;
  /** An opaque owner key; two armies of one owner share it (the settlement owner's id). */
  owner: string;
}

export type PalisadeWalls = ReadonlyMap<string, PalisadeWall>;

/**
 * The restrictions for an army whose owner is `ownerKey`, or `undefined` when no wall stands (so the caller's context stays exactly the
 * wall-free one). `halfOpen` is memoised per hex.
 */
export function palisadeRestrictions(
  walls: PalisadeWalls,
  terrainAt: (c: AxialCoord) => Terrain,
  isWideRiver: (c: AxialCoord) => boolean,
  ownerKey: string,
): Pick<PathRestrictions, 'blocked' | 'friendlyGate' | 'halfOpen'> | undefined {
  if (walls.size === 0) return undefined;
  const halfOpenMemo = new Map<string, boolean>();
  return {
    blocked: (c) => walls.has(coordKey(c)),
    friendlyGate: (c) => {
      const wall = walls.get(coordKey(c));
      return wall !== undefined && wall.gate && wall.owner === ownerKey;
    },
    halfOpen: (c) => {
      const key = coordKey(c);
      const wall = walls.get(key);
      if (!wall || wall.gate) return false;
      let open = halfOpenMemo.get(key);
      if (open === undefined) {
        open =
          terrainAt(c) !== 'sea' &&
          neighbors(c).filter((n) => walls.has(coordKey(n))).length === 1 &&
          classifyEnd(c, terrainAt, isWideRiver) === 'halfOpen';
        halfOpenMemo.set(key, open);
      }
      return open;
    },
  };
}
