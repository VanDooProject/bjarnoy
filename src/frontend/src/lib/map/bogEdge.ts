// The border drawn where bog moss meets grass in settlement mode. The bog art's moss is duller and yellower than the
// grass art, so a bog hex next to a grass hex otherwise ends in a hard, perfectly straight hex edge. This softens it.
//
// Drawn into its own layer directly above `terrainBase` (see `worldLayerOrder`): under the water mesh, the realm
// borders, the hover outline and every topping in `terrainTop` (reeds, trees, buildings), so it only ever touches
// the ground.
import type { AxialCoord } from '../hex/coords';
import type { Point } from '../hex/geometry';
import { TILE_ORIENTATIONS, type RiverTile, type Tile } from './types';

/** How the border looks — `bogEdgeDebug` picks one per neighbour kind; see `bogEdgeShapes`. */
export type BogEdgeStyle = 'off' | 'feather' | 'rim' | 'straight' | 'lobes' | 'lobesRim';

export const BOG_EDGE_STYLES: readonly BogEdgeStyle[] = ['off', 'feather', 'rim', 'straight', 'lobes', 'lobesRim'];

/** What a bordered bog edge faces. */
export type BogEdgeNeighbour = 'grass' | 'forest';

/** The bog art's moss and the brown of its pool rims, sampled off the rendered tiles. */
export const BOG_MOSS = 0x799244;
export const BOG_PEAT = 0x5e4a34;

/**
 * Demo-mode debug switch (`window.__bogEdge`), read on every rebuild: the style against grass, the style against
 * forest, and the line colour of the `rim`, `straight` and `lobesRim` styles.
 */
export const bogEdgeDebug: { style: BogEdgeStyle; forestStyle: BogEdgeStyle; color: number } = {
  style: 'lobesRim',
  forestStyle: 'off',
  color: BOG_PEAT,
};

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
 * The shapes for one bog edge from `a` to `b` (world units). `outward` is the unit normal pointing out of the bog,
 * `seed` keys the wobble, `color` is the line colour, `gap` the stretch of the edge a river's water takes up, left
 * bare. Pure, so the shapes are testable without Pixi.
 */
export function bogEdgeShapes(
  style: BogEdgeStyle,
  a: Point,
  b: Point,
  outward: Point,
  seed: [number, number, number],
  color = BOG_PEAT,
  gap?: readonly [number, number],
): BogEdgeShape[] {
  if (style === 'off') return [];
  if (!gap) return rangeShapes(style, a, b, outward, seed, color, true, true);
  const lerp = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  // Two banks, each running from its corner to the water.
  return [
    ...rangeShapes(style, a, lerp(gap[0]), outward, seed, color, true, false),
    ...rangeShapes(style, lerp(gap[1]), b, outward, [seed[0], seed[1], seed[2] + 6], color, false, true),
  ];
}

/** `bogEdgeShapes` for one unbroken stretch; an end at a corner gets a cap, an end at the water tapers to nothing. */
function rangeShapes(
  style: BogEdgeStyle,
  a: Point,
  b: Point,
  outward: Point,
  seed: [number, number, number],
  color: number,
  startCorner: boolean,
  endCorner: boolean,
): BogEdgeShape[] {
  const at = (t: number, off: number): Point => ({
    x: a.x + (b.x - a.x) * t + outward.x * off,
    y: a.y + (b.y - a.y) * t + outward.y * off,
  });
  const along = (fn: (t: number) => number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= SAMPLES; i++) pts.push(at(i / SAMPLES, fn(i / SAMPLES)));
    return pts;
  };
  const corners = [startCorner ? a : null, endCorner ? b : null].filter((p): p is Point => p !== null);
  const phases = wobblePhases(seed);
  const reachAt = (t: number) => wobble(t, phases, startCorner ? CORNER_REACH : 0, endCorner ? CORNER_REACH : 0);

  if (style === 'feather') {
    // Moss bleeding onto the grass in a few translucent bands, the widest the faintest, plus a matching band
    // inside the bog: no line at all, just a softer colour step.
    const bands: BogEdgeShape[] = [];
    for (const [w, alpha] of [
      [16, 0.18],
      [10, 0.22],
      [5, 0.28],
    ] as const) {
      const outer = along((t) => w * Math.pow(Math.sin(Math.PI * t), 0.5));
      const inner = along(() => -w * 0.4).reverse();
      bands.push({ points: [...outer, ...inner], fill: { color: BOG_MOSS, alpha } });
    }
    return bands;
  }

  if (style === 'straight') {
    // A plain line on the hex edge, with a faint shadow under it. Round caps join it to the next edge's line.
    const line = [a, b];
    return [
      { points: line, stroke: { color: 0x000000, alpha: 0.12, width: 7 } },
      { points: line, stroke: { color, alpha: 0.9, width: 3 } },
    ];
  }

  if (style === 'rim') {
    // A thin wavy line right on the edge, like the brown rims of the bog pools.
    const line = along((t) => 3 * (reachAt(t) - 0.5));
    return [
      { points: line, stroke: { color: 0x000000, alpha: 0.12, width: 6 } },
      { points: line, stroke: { color, alpha: 0.85, width: 2.5 } },
    ];
  }

  // 'lobes' / 'lobesRim': organic tongues of moss pushed out over the grass so the edge stops being a ruler line.
  const reach = 14;
  const outer = along((t) => reach * reachAt(t));
  const lobe: BogEdgeShape = { points: [...outer, at(1, -2), at(0, -2)], fill: { color: BOG_MOSS, alpha: 1 } };
  // Round caps on the corners: two edges meeting at a corner point their reach in different directions, the cap
  // fills the wedge between them. Only the grass-facing side, so nothing of a cap shows inside the bog.
  const capR = reach * CORNER_REACH;
  const caps = corners.map((p) => ({ points: fan(p, capR, outward), fill: { color: BOG_MOSS, alpha: 1 } }));
  if (style === 'lobes') return [...caps, lobe];
  // The rim is drawn *under* the moss of every edge (`under`): a wide stroke along the outline and a slightly larger
  // cap at each corner, with all the moss on top, so only the outer half shows and it follows the outline of the
  // whole bog instead of each edge's own shape.
  return [
    { under: true, points: outer, stroke: { color: 0x000000, alpha: 0.12, width: 9 } },
    { under: true, points: outer, stroke: { color, alpha: 1, width: 5 } },
    ...corners.map((p) => ({ under: true, points: fan(p, capR + 2.5, outward), fill: { color, alpha: 1 } })),
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
