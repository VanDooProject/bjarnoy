// The PathContext the game prices land routes with: the world's own terrain and river tiles, the backend's
// movement rules (WorldResponse.movement) and the wide-river rule (riverArms.ts). Built once per range-tint
// recompute / route query, so wideness is memoised per hex.
import { coordKey, type AxialCoord } from '../hex/coords';
import type { MovementRules, PathContext } from './hexPath';
import { isWideRiverTile } from './riverArms';
import type { RiverTile, Terrain } from './types';

export interface MovementWorldView {
  getTile(q: number, r: number): { terrain: Terrain };
  getRiverTile(q: number, r: number): RiverTile | undefined;
}

export function gamePathContext(world: MovementWorldView, rules: MovementRules, hexesPerHour: number): PathContext {
  const riverAt = (c: AxialCoord) => world.getRiverTile(c.q, c.r);
  const wide = new Map<string, boolean>();
  return {
    terrainAt: (c) => world.getTile(c.q, c.r).terrain,
    isRiver: (c) => riverAt(c) !== undefined,
    isWideRiver: (c) => {
      const key = coordKey(c);
      let isWide = wide.get(key);
      if (isWide === undefined) {
        const tile = riverAt(c);
        isWide = tile !== undefined && isWideRiverTile(tile, riverAt);
        wide.set(key, isWide);
      }
      return isWide;
    },
    rules,
    hexesPerHour,
  };
}
