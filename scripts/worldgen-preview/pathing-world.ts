// The terrain, rivers and bogs of a preview world as the movement rules see them: what a land
// army would walk over in the game (seed terrain, with the bog generator's lakes and bog moss
// laid over it, and the river tiles of the real generator). Shared by the `pathing` layer and the
// unreachable-land statistics.
import { coordKey, neighbors } from '../../src/frontend/src/lib/hex/coords';
import { terrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import type { PathContext, MovementRules } from '../../src/frontend/src/lib/map/hexPath';
import { TILE_ORIENTATIONS, type RiverTile, type Terrain } from '../../src/frontend/src/lib/map/types';
import { computeRivers, type RiverField, type Window } from './rivers';

/** HexPathfinder's LandTerrainCost / RiverCrossingCost (the golden fixture's own table). */
export const BACKEND_RULES: MovementRules = {
  land: { grass: 1.0, sand: 1.1, forest: 1.3, mountain: 2.0, bog: 2.0 },
  riverCrossingCost: 8.0,
};

/**
 * Whether a river tile is impassable "wide river" under the owner's rule: a tile that carries a
 * stream is crossable at the stream cost, except where a stream joins a wide river (the
 * `riverstream` Y), which is part of the river. Derived from arm widths, not from names: a tile is
 * wide when at least two of its arms are river width. An arm is river width when the water on it is
 * a river: the upstream neighbour's outflow for an in-arm (`river`, `widen` and `riverstream` tiles
 * all flow out as river, a `stream` tile as stream; a creek or lake upstream is river width on a
 * river tile), the tile's own outflow for the out-arm (a mouth's sea side counts as its out-arm).
 * So `river` tiles (river in, river out) and `riverstream` Ys (river in, stream in, river out)
 * are wide, while a `widen` tile (stream in, river out), a stream-stream confluence and plain
 * stream tiles are not.
 */
export function riverArms(tile: RiverTile, riverAt: (c: { q: number; r: number }) => RiverTile | undefined): { river: number; stream: number } {
  const flowsOutAsRiver = (t: RiverTile) => t.width === undefined || t.width === 'river' || t.width === 'widen' || t.width === 'riverstream';
  const out = flowsOutAsRiver(tile);
  const arms = { river: 0, stream: 0 };
  const add = (isRiver: boolean) => (isRiver ? arms.river++ : arms.stream++);
  const ns = neighbors(tile);
  for (const d of tile.inDirections) {
    const up = riverAt(ns[TILE_ORIENTATIONS.indexOf(d)]!);
    // No river tile upstream: a lake or creek feeds a river tile at river width.
    add(up ? flowsOutAsRiver(up) : tile.width === undefined || tile.width === 'river');
  }
  if (tile.outDirection || tile.shape === 'mouth') add(out);
  return arms;
}

export const isWideRiverTile = (tile: RiverTile, riverAt: (c: { q: number; r: number }) => RiverTile | undefined): boolean =>
  riverArms(tile, riverAt).river >= 2;

export interface PathingWorld {
  field: RiverField;
  terrainAt(c: { q: number; r: number }): Terrain;
  isRiver(c: { q: number; r: number }): boolean;
  riverAt(c: { q: number; r: number }): RiverTile | undefined;
  isWideRiver(c: { q: number; r: number }): boolean;
  /** A sea hex with at least one land neighbour (where `palisade_end_coast` can stand). */
  isCoastalWater(c: { q: number; r: number }): boolean;
}

export function buildPathingWorld(world: WorldSeed, window?: Window): PathingWorld {
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
      return t !== undefined && isWideRiverTile(t, riverAt);
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

/** A crossable river tile (not wide): walkable at a flat cost whatever lies under it. */
export const isStream = (pw: PathingWorld, c: { q: number; r: number }): boolean => pw.isRiver(c) && !pw.isWideRiver(c);

/** A PathContext over a pathing world. `restrictions` default to the owner's two terrain rules. */
export function pathContext(
  pw: PathingWorld,
  restrictions: PathContext['restrictions'] = { wideRiversImpassable: true, mountainsImpassable: true, streamsIgnoreTerrain: true },
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
