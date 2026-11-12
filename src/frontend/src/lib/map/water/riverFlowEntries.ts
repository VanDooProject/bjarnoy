// The river flow entry of a hex, derived from the world model alone, so a cell's solver key (its frame, its edges, its
// neighbours' frames and its psi range) is the same whichever hexes the viewport happens to cover. The drawn entries and the
// neighbour / downstream lookups all come from `entryAt`.
import type { Texture } from 'pixi.js';
import type { AxialCoord } from '../../hex/coords';
import { coordKey, neighbors } from '../../hex/coords';
import { TILE_ORIENTATIONS, type BogTile, type RiverTile, type TileOrientation } from '../types';
import { riverFlowOf, type RiverFlowEntry } from './riverFlowLayer';

export interface RiverFlowWorld {
  getRiverTile(q: number, r: number): RiverTile | undefined;
  getBog(q: number, r: number): BogTile | undefined;
  seaFacingDirectionOf(coord: AxialCoord, inDirection?: TileOrientation): TileOrientation | null;
}

export interface RiverFlowEntrySource {
  /** The entry of the hex at `c`: null when it has no flow. Memoised, so one object per hex per source. */
  entryAt(c: AxialCoord): RiverFlowEntry | null;
}

/**
 * @param baseTextureOf the base art texture drawn on a hex (any hex, in view or not); undefined when it draws none. Only asked for a
 *   hex that has flow.
 * @param artOrigin where the base art's top-left lies in world space
 */
export function createRiverFlowEntrySource(
  world: RiverFlowWorld,
  baseTextureOf: (c: AxialCoord) => Texture | undefined,
  artOrigin: (c: AxialCoord) => { x: number; y: number },
): RiverFlowEntrySource {
  const memo = new Map<string, RiverFlowEntry | null>();
  const complete = new Set<RiverFlowEntry>();
  // The hex's own art and flow, without its neighbours.
  const baseOf = (c: AxialCoord): RiverFlowEntry | null => {
    const key = coordKey(c);
    const known = memo.get(key);
    if (known !== undefined) return known;
    const river = world.getRiverTile(c.q, c.r);
    const seaDirection = river?.shape === 'mouth' ? world.seaFacingDirectionOf(c, river.inDirections[0]) : null;
    const flow = riverFlowOf(river, world.getBog(c.q, c.r), seaDirection);
    // Most hexes have no flow, and for those the base art is never resolved.
    const texture = flow ? baseTextureOf(c) : undefined;
    const entry: RiverFlowEntry | null = texture && flow ? { texture, ...artOrigin(c), ...flow } : null;
    memo.set(key, entry);
    return entry;
  };
  const entryAt = (c: AxialCoord): RiverFlowEntry | null => {
    const entry = baseOf(c);
    if (!entry || complete.has(entry)) return entry;
    complete.add(entry);
    const around = neighbors(c);
    const behind = (direction: TileOrientation) => around[TILE_ORIENTATIONS.indexOf(direction)];
    // The neighbouring river hex behind each in and out edge, so a cell can measure the distance to the bank on both sides of a seam.
    entry.neighbours = [];
    for (const direction of new Set([entry.outDirection, ...entry.inDirections])) {
      const next = behind(direction);
      const other = next ? baseOf(next) : null;
      if (other) entry.neighbours.push({ direction, name: other.texture.label ?? '', x: other.x, y: other.y });
    }
    const out = behind(entry.outDirection);
    if (out) entry.downstream = () => entryAt(out) ?? undefined;
    return entry;
  };
  return { entryAt };
}
