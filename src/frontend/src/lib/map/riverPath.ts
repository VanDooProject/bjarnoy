// World-map river rendering (blue vector lines) — a sibling to
// riverTexturesFor (textures.ts), which draws the settlement view's sprite
// river art. World mode never renders tile art at all (see
// WORLD_TERRAIN_FILL in HexMapRenderer.ts), so it needs its own,
// geometry-only way to show a river: a stroked line through each river
// tile, joined to its neighbours at shared hex edges.
//
// Pure and canvas-free — same reasoning as worldLayerOrder — so the path
// math is unit-testable without a real Pixi Graphics object.

import type { AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints, type Point } from '../hex/geometry';
import { TILE_ORIENTATIONS, type RiverTile, type TileOrientation } from './types';

/** One flow leg: a curve from an inflow edge (or the spring's own centre) to the tile's outflow point. */
export interface RiverSegment {
  from: Point;
  /** quadraticCurveTo control point — always the hex centre, so straight-through flow (opposite edges) still reads as a straight line. */
  control: Point;
  to: Point;
}

export interface RiverDrawing {
  segments: RiverSegment[];
  /** Present only for a `spring` tile — the small pond dot at the hex centre. */
  springDot?: Point;
}

/** Direction `d`'s shared edge is polygon edge `(3 - d) mod 6` — see types.ts's derivation comment. */
function edgeMidpoint(top: Point[], direction: TileOrientation): Point {
  const dirIndex = TILE_ORIENTATIONS.indexOf(direction);
  const edgeIndex = (3 - dirIndex + 6) % 6;
  const a = top[edgeIndex]!;
  const b = top[(edgeIndex + 1) % 6]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Builds the stroke path for one river hex. `seaDirection` is only
 * meaningful for a `mouth` tile (no `outDirection` of its own) — same
 * caller contract as `riverTexturesFor`'s own `seaDirection` param
 * (`WorldModel.seaFacingDirectionOf`).
 *
 * Every segment starts/ends exactly on a hex edge midpoint (or the centre,
 * for a spring's pond / a mouth with no resolvable sea neighbour), so
 * adjacent tiles' segments always meet at the same point — no explicit
 * "join to neighbour" step is needed.
 */
export function riverPathFor(
  coord: AxialCoord,
  tile: RiverTile,
  seaDirection: TileOrientation | null,
  w: number,
  h: number,
): RiverDrawing {
  const grid = isoGridPosition(coord, w, h);
  const top = isoTopPoints(w, h).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
  const center = { x: grid.x + w / 2, y: grid.y + h / 2 };

  const exit = tile.outDirection ?? (tile.shape === 'mouth' ? seaDirection : null);
  const exitPoint = exit ? edgeMidpoint(top, exit) : center;

  if (tile.inDirections.length === 0) {
    // Spring: no inflow, just a pond at the centre feeding its one outflow.
    return {
      segments: exit ? [{ from: center, control: center, to: exitPoint }] : [],
      springDot: center,
    };
  }

  return {
    segments: tile.inDirections.map((inDirection) => ({
      from: edgeMidpoint(top, inDirection),
      control: center,
      to: exitPoint,
    })),
  };
}
