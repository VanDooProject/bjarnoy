// The border drawn where bog moss meets grass or forest in settlement mode. The bog art's moss is duller and yellower
// than the grass art and lighter than the forest's ground, so a bog hex otherwise ends in a hard, perfectly straight
// hex edge. This breaks it up: against grass, wobbly tongues of moss with a peat rim reach out over the grass; against
// forest, the forest's ground reaches into the bog instead.
//
// Drawn into its own layer directly above `terrainBase` (see `worldLayerOrder`): under the water mesh, the realm
// borders, the hover outline and every topping in `terrainTop` (reeds, trees, buildings), so it only ever touches
// the ground.
import type { AxialCoord } from '../hex/coords';
import type { Point } from '../hex/geometry';
import { TILE_ORIENTATIONS, type RiverTile, type Tile } from './types';

/** What a bordered bog edge faces: grass gets moss pushed out over it, forest pushes its own ground into the bog. */
export type BogEdgeNeighbour = 'grass' | 'forest';

/** The bog art's moss and the brown of its pool rims, sampled off the rendered tiles. */
export const BOG_MOSS = 0x799244;
export const BOG_PEAT = 0x5e4a34;
/**
 * The forest art's ground between the trees (its baked shadow catcher), sampled off the rendered tiles: darker and
 * more saturated than the moss, which is why moss pushed out over it reads as the wrong colour.
 */
export const FOREST_GROUND = 0x52822a;

/** Bog ground: the plain moss and every bog shore/creek hex (their outer edges are moss too). Not the open lake. */
export function isBogGround(tile: Tile): boolean {
  if (tile.terrain === 'lake') return false;
  return tile.terrain === 'bog' || !!tile.bog;
}

/** What a bog edge facing `tile` is drawn against, or `null` for no border. A giant's art covers its hexes' ground. */
export function bogEdgeNeighbour(tile: Tile): BogEdgeNeighbour | null {
  if (tile.bog || tile.giant) return null;
  if (tile.terrain === 'grass') return 'grass';
  if (tile.terrain === 'forest') return 'forest';
  return null;
}

/** The axial direction offsets in `neighbors()` order, and each one's top-face polygon edge (see `types.ts`). */
const DIRS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const EDGE_FOR_DIR = [3, 2, 1, 0, 5, 4];

/**
 * The stretch (as `t` along the edge, 0..1) a river or stream tile's water and banks take up on an edge it flows
 * through, pixel-measured on every `rivertile*_base` frame: the river 0.23-0.77 (the bend180 meander reaches 0.84
 * on one end), the stream 0.36-0.64. Widened a little each way; the moss tapers to nothing at the water.
 */
export const RIVER_EDGE_GAP: readonly [number, number] = [0.17, 0.83];
export const STREAM_EDGE_GAP: readonly [number, number] = [0.32, 0.68];

/**
 * The water gap on the edge of `river` that faces direction `towards`, or `null` when no water crosses that edge
 * (the rest of a river hex is plain grass). See `RiverTile.width` for which edges of a mixed tile are stream.
 */
export function riverGapOn(river: RiverTile, towards: (typeof TILE_ORIENTATIONS)[number]): readonly [number, number] | null {
  const isIn = river.inDirections.includes(towards);
  if (!isIn && river.outDirection !== towards) return null;
  const width = river.width ?? 'river';
  const stream =
    width === 'stream' || (width === 'widen' && isIn) || (width === 'riverstream' && river.inDirections[0] === towards);
  return stream ? STREAM_EDGE_GAP : RIVER_EDGE_GAP;
}

/**
 * A bordered edge of a bog hex: its top-face polygon edge (`[edge, edge + 1]` into `isoTopPoints`), what it faces,
 * and the stretch of it a river's water takes up, which stays bare.
 */
export interface BogEdge {
  edge: number;
  neighbour: BogEdgeNeighbour;
  gap?: readonly [number, number];
}

/** The edges of bog hex `c` that get a border. */
export function bogEdgesOf(
  getTile: (q: number, r: number) => Tile,
  getRiver: (q: number, r: number) => RiverTile | undefined,
  c: AxialCoord,
): BogEdge[] {
  if (!isBogGround(getTile(c.q, c.r))) return [];
  const edges: BogEdge[] = [];
  DIRS.forEach((d, i) => {
    const q = c.q + d.q;
    const r = c.r + d.r;
    const neighbour = bogEdgeNeighbour(getTile(q, r));
    if (!neighbour) return;
    // A river hex is grass terrain with its water in the art: border its banks, not the water.
    const river = getRiver(q, r);
    const gap = river ? riverGapOn(river, TILE_ORIENTATIONS[(i + 3) % 6]) : null;
    edges.push(gap ? { edge: EDGE_FOR_DIR[i], neighbour, gap } : { edge: EDGE_FOR_DIR[i], neighbour });
  });
  return edges;
}

/** One filled or stroked shape of a border, in world units. */
export interface BogEdgeShape {
  points: Point[];
  fill?: { color: number; alpha: number };
  stroke?: { color: number; alpha: number; width: number };
  /** Drawn before every shape without it, across all edges in view (the rim under the moss). */
  under?: boolean;
}

const SAMPLES = 18;
/** The share of the full reach left at a corner. */
const CORNER_REACH = 0.35;

/** A small deterministic hash in [0, 1) — the same edge always gets the same wobble, rebuild after rebuild. */
function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Phases = readonly [number, number, number];

/** The three sine phases a seed keys, hashed once per edge range instead of at every sample point. */
function wobblePhases(seed: [number, number, number]): Phases {
  return [
    hash01(...seed) * Math.PI * 2,
    hash01(seed[0] + 7, seed[1], seed[2]) * Math.PI * 2,
    hash01(seed[0], seed[1] + 13, seed[2]) * Math.PI * 2,
  ];
}

/**
 * How far (0..1 of the amplitude) the moss reaches past the edge at `t` along it: a few summed sines with seeded
 * phases, eased to `start` / `end` at the two ends — `CORNER_REACH` at a corner, where a round cap (see
 * `bogEdgeShapes`) joins it to the next edge, 0 where it meets a river's water.
 */
function wobble(t: number, phases: Phases, start = CORNER_REACH, end = CORNER_REACH): number {
  const [p1, p2, p3] = phases;
  const n = 0.5 * Math.sin(t * Math.PI * 3 + p1) + 0.3 * Math.sin(t * Math.PI * 7 + p2) + 0.2 * Math.sin(t * Math.PI * 13 + p3);
  const envelope = Math.pow(Math.sin(Math.PI * t), 0.7);
  return start + (end - start) * t + (1 - CORNER_REACH) * envelope * (0.55 + 0.45 * n);
}

/**
 * The shapes for one bog edge from `a` to `b` (world units), facing `neighbour`. `outward` is the unit normal pointing
 * out of the bog, `seed` keys the wobble, `gap` is the stretch of the edge a river's water takes up, left bare. Pure,
 * so the shapes are testable without Pixi.
 */
export function bogEdgeShapes(
  neighbour: BogEdgeNeighbour,
  a: Point,
  b: Point,
  outward: Point,
  seed: [number, number, number],
  gap?: readonly [number, number],
): BogEdgeShape[] {
  const shapes = (from: Point, to: Point, rangeSeed: [number, number, number], startCorner: boolean, endCorner: boolean) =>
    neighbour === 'grass'
      ? lobeShapes(from, to, outward, rangeSeed, startCorner, endCorner, BOG_MOSS, true)
      : lobeShapes(from, to, { x: -outward.x, y: -outward.y }, rangeSeed, startCorner, endCorner, FOREST_GROUND, false);
  if (!gap) return shapes(a, b, seed, true, true);
  const lerp = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  // Two banks, each running from its corner to the water.
  return [...shapes(a, lerp(gap[0]), seed, true, false), ...shapes(lerp(gap[1]), b, [seed[0], seed[1], seed[2] + 6], false, true)];
}

/**
 * Organic tongues of `fill` pushed out along `normal` from one unbroken stretch of edge, so the edge stops being a
 * ruler line. An end at a corner gets a round cap, an end at a river's water tapers to nothing. With `rim`, a peat
 * outline goes with them.
 */
function lobeShapes(
  a: Point,
  b: Point,
  normal: Point,
  seed: [number, number, number],
  startCorner: boolean,
  endCorner: boolean,
  fill: number,
  rim: boolean,
): BogEdgeShape[] {
  const at = (t: number, off: number): Point => ({
    x: a.x + (b.x - a.x) * t + normal.x * off,
    y: a.y + (b.y - a.y) * t + normal.y * off,
  });
  const phases = wobblePhases(seed);
  const reach = 14;
  const outer: Point[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    outer.push(at(t, reach * wobble(t, phases, startCorner ? CORNER_REACH : 0, endCorner ? CORNER_REACH : 0)));
  }
  const lobe: BogEdgeShape = { points: [...outer, at(1, -2), at(0, -2)], fill: { color: fill, alpha: 1 } };
  // Round caps on the corners: two edges meeting at a corner point their reach in different directions, the cap
  // fills the wedge between them. Only the side the lobes reach into, so nothing of a cap shows on the other.
  const capR = reach * CORNER_REACH;
  const corners = [startCorner ? a : null, endCorner ? b : null].filter((p): p is Point => p !== null);
  const caps = corners.map((p) => ({ points: fan(p, capR, normal), fill: { color: fill, alpha: 1 } }));
  if (!rim) return [...caps, lobe];
  // The rim is drawn *under* the moss of every edge (`under`): a wide stroke along the outline and a slightly larger
  // cap at each corner, with all the moss on top, so only the outer half shows and it follows the outline of the
  // whole bog instead of each edge's own shape.
  return [
    { under: true, points: outer, stroke: { color: 0x000000, alpha: 0.12, width: 9 } },
    { under: true, points: outer, stroke: { color: BOG_PEAT, alpha: 1, width: 5 } },
    ...corners.map((p) => ({ under: true, points: fan(p, capR + 2.5, normal), fill: { color: BOG_PEAT, alpha: 1 } })),
    ...caps,
    lobe,
  ];
}

/**
 * A fan around `c` on the `outward` side, ±70° about the normal: wide enough to close the wedge between two edges that
 * meet at a convex corner (their normals are about 60° apart), narrow enough not to reach along the edge line into the
 * next hex.
 */
function fan(c: Point, r: number, outward: Point, steps = 10): Point[] {
  const mid = Math.atan2(outward.y, outward.x);
  const half = (70 * Math.PI) / 180;
  const pts: Point[] = [c];
  for (let i = 0; i <= steps; i++) {
    const t = mid - half + (i / steps) * 2 * half;
    pts.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r });
  }
  return pts;
}
