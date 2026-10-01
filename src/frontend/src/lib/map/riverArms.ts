// Which river tiles are "wide" for movement: a land army cannot cross a wide river, only a stream.
// C# twin: RiverArms (Bjarnoy.Domain/World/RiverArms.cs); both are asserted against
// src/shared/river-pathing-golden.json.
import { neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS, type RiverTile } from './types';

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
