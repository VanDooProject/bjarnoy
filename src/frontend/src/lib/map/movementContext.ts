// The PathContext the game prices land routes with: the world's own terrain and river tiles, the backend's
// movement rules (WorldResponse.movement), the wide-river rule (isWideRiverTile, riverGenerator.ts) and the world's standing palisades
// (palisadeMovement.ts). Built once per range-tint recompute / route query, so wideness is memoised per hex.
import { coordKey, type AxialCoord } from '../hex/coords';
import type { MovementRules, PathContext, PathRestrictions } from './hexPath';
import { bridgeRestrictions, type StandingBridges } from './bridgeMovement';
import { palisadeRestrictions, type PalisadeWalls } from './palisadeMovement';
import { isWideRiverTile } from './riverGenerator';
import type { RiverTile, Terrain } from './types';

export interface MovementWorldView {
  getTile(q: number, r: number): { terrain: Terrain };
  getRiverTile(q: number, r: number): RiverTile | undefined;
  /** The standing palisade hexes with their owners (`WorldModel.standingPalisadeWalls`); a view with none leaves it out. */
  standingPalisadeWalls?(): PalisadeWalls;
  /** The standing bridge hexes (level 1 or more) with their owners (`WorldModel.standingBridges`); a view with none leaves it out. */
  standingBridges?(): StandingBridges;
}

/**
 * `ownerKey` is the owner of the army that walks (the owning player of the selected settlement, for the range tint): the palisade rules
 * need it to tell a friendly gate from somebody else's. Without it every wall is somebody else's (a gate blocks too).
 * `friendOwners` are the other accounts whose gates open too: the owner's guildmates and the guilds at peace with theirs.
 */
export function gamePathContext(
  world: MovementWorldView,
  rules: MovementRules,
  hexesPerHour: number,
  ownerKey?: string,
  friendOwners?: ReadonlySet<string>,
): PathContext {
  const riverAt = (c: AxialCoord) => world.getRiverTile(c.q, c.r);
  const wide = new Map<string, boolean>();
  const terrainAt = (c: AxialCoord): Terrain => world.getTile(c.q, c.r).terrain;
  const isWideRiver = (c: AxialCoord): boolean => {
    const key = coordKey(c);
    let isWide = wide.get(key);
    if (isWide === undefined) {
      const tile = riverAt(c);
      isWide = tile !== undefined && isWideRiverTile(tile, riverAt);
      wide.set(key, isWide);
    }
    return isWide;
  };
  return {
    terrainAt,
    isRiver: (c) => riverAt(c) !== undefined,
    isWideRiver,
    rules,
    hexesPerHour,
    restrictions: mergeRestrictions(
      palisadeRestrictions(world.standingPalisadeWalls?.() ?? new Map(), terrainAt, isWideRiver, ownerKey ?? '', friendOwners),
      bridgeRestrictions(world.standingBridges?.() ?? new Map(), terrainAt, rules, ownerKey ?? '', friendOwners),
    ),
  };
}

function mergeRestrictions(...parts: (PathRestrictions | undefined)[]): PathRestrictions | undefined {
  const present = parts.filter((p): p is PathRestrictions => p !== undefined);
  return present.length === 0 ? undefined : Object.assign({}, ...present);
}
