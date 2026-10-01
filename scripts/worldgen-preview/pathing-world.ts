// The terrain, rivers and bogs of a preview world as the movement rules see them: what a land
// army would walk over in the game (seed terrain, with the bog generator's lakes and bog moss
// laid over it, and the river tiles of the real generator). Shared by the `pathing` layer and the
// unreachable-land statistics.
import { coordKey } from '../../src/frontend/src/lib/hex/coords';
import { terrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import type { PathContext, MovementRules } from '../../src/frontend/src/lib/map/hexPath';
import type { RiverTile, Terrain } from '../../src/frontend/src/lib/map/types';
import { computeRivers, type RiverField, type Window } from './rivers';

/** HexPathfinder's LandTerrainCost / RiverCrossingCost (the golden fixture's own table). */
export const BACKEND_RULES: MovementRules = {
  land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0, bog: 2.0 },
  riverCrossingCost: 8.0,
};

/** The river widths that count as a wide river (impassable). The owner's rule: width `river`, nothing else. */
export const WIDE_WIDTHS: readonly NonNullable<RiverTile['width']>[] = ['river'];

export interface PathingWorld {
  field: RiverField;
  terrainAt(c: { q: number; r: number }): Terrain;
  isRiver(c: { q: number; r: number }): boolean;
  riverAt(c: { q: number; r: number }): RiverTile | undefined;
  isWideRiver(c: { q: number; r: number }): boolean;
  /** A sea hex with at least one land neighbour (where `palisade_end_coast` can stand). */
  isCoastalWater(c: { q: number; r: number }): boolean;
}

export function buildPathingWorld(world: WorldSeed, window?: Window, wideWidths: readonly string[] = WIDE_WIDTHS): PathingWorld {
  const field = computeRivers(world, window);
  const terrain = (c: { q: number; r: number }): Terrain => {
    const bog = field.bogs.get(coordKey(c));
    if (bog) return bog.kind === 'lake' ? 'lake' : 'bog';
    return terrainAt(c.q, c.r, world);
  };
  const riverAt = (c: { q: number; r: number }) => field.tiles.get(coordKey(c));
  return {
    field,
    terrainAt: terrain,
    isRiver: (c) => field.tiles.has(coordKey(c)),
    riverAt,
    isWideRiver: (c) => {
      const t = riverAt(c);
      return t !== undefined && wideWidths.includes(t.width ?? 'river');
    },
    isCoastalWater: (c) => {
      if (terrain(c) !== 'sea') return false;
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
        if (terrain({ q: c.q + dq, r: c.r + dr }) !== 'sea') return true;
      }
      return false;
    },
  };
}

/** A PathContext over a pathing world. `restrictions` default to the owner's two terrain rules. */
export function pathContext(
  pw: PathingWorld,
  restrictions: PathContext['restrictions'] = { wideRiversImpassable: true, mountainsImpassable: true },
): PathContext {
  return {
    terrainAt: pw.terrainAt,
    isRiver: pw.isRiver,
    isWideRiver: pw.isWideRiver,
    rules: BACKEND_RULES,
    hexesPerHour: 1,
    restrictions,
  };
}
