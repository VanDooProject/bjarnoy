// The border drawn where bog moss meets grass in settlement mode. The bog art's moss is duller and yellower than the
// grass art, so a bog hex next to a grass hex otherwise ends in a hard, perfectly straight hex edge. This softens it.
//
// Drawn into its own layer directly above `terrainBase` (see `worldLayerOrder`): under the water mesh, the realm
// borders, the hover outline and every topping in `terrainTop` (reeds, trees, buildings), so it only ever touches
// the ground.
import type { AxialCoord } from "../hex/coords";
import type { Point } from "../hex/geometry";
import type { Tile } from "./types";

/** How the border looks — `bogEdgeDebug.style` picks one; see `bogEdgeShapes`. */
export type BogEdgeStyle = "off" | "feather" | "rim" | "lobes" | "lobesRim";

export const BOG_EDGE_STYLES: readonly BogEdgeStyle[] = [
  "off",
  "feather",
  "rim",
  "lobes",
  "lobesRim",
];

/** Demo-mode debug switch (`window.__bogEdge`), read on every rebuild. */
export const bogEdgeDebug: { style: BogEdgeStyle } = { style: "lobesRim" };

/** The bog art's moss and the brown of its pool rims, sampled off the rendered tiles. */
export const BOG_MOSS = 0x799244;
export const BOG_PEAT = 0x5e4a34;

/** Bog ground: the plain moss and every bog shore/creek hex (their outer edges are moss too). Not the open lake. */
export function isBogGround(tile: Tile): boolean {
  if (tile.terrain === "lake") return false;
  return tile.terrain === "bog" || !!tile.bog;
}

/** Grass ground a bog edge is drawn against: plain grass and forest (whose trees stand on grass). */
export function isGrassGround(tile: Tile): boolean {
  return (tile.terrain === "grass" || tile.terrain === "forest") && !tile.bog;
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

/** The top-face polygon edges (`[i, i + 1]` into `isoTopPoints`) of bog hex `c` that face a grass hex. */
export function bogGrassEdges(
  getTile: (q: number, r: number) => Tile,
  c: AxialCoord,
): number[] {
  if (!isBogGround(getTile(c.q, c.r))) return [];
  const edges: number[] = [];
  DIRS.forEach((d, i) => {
    if (isGrassGround(getTile(c.q + d.q, c.r + d.r)))
      edges.push(EDGE_FOR_DIR[i]);
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
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^
    Math.imul(b | 0, 0x165667b1) ^
    Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How far (0..1 of the amplitude) the moss reaches past the edge at `t` along it: a few summed sines with seeded
 * phases, eased to `CORNER_REACH` at both corners, where a round cap (see `bogEdgeShapes`) joins it to the next edge.
 */
function wobble(t: number, seed: [number, number, number]): number {
  const p1 = hash01(...seed) * Math.PI * 2;
  const p2 = hash01(seed[0] + 7, seed[1], seed[2]) * Math.PI * 2;
  const p3 = hash01(seed[0], seed[1] + 13, seed[2]) * Math.PI * 2;
  const n =
    0.5 * Math.sin(t * Math.PI * 3 + p1) +
    0.3 * Math.sin(t * Math.PI * 7 + p2) +
    0.2 * Math.sin(t * Math.PI * 13 + p3);
  const envelope = Math.pow(Math.sin(Math.PI * t), 0.7);
  return CORNER_REACH + (1 - CORNER_REACH) * envelope * (0.55 + 0.45 * n);
}

/**
 * The shapes for one bog/grass edge from `a` to `b` (world units). `outward` is the unit normal pointing into the
 * grass hex, `seed` keys the wobble. Pure, so the shapes are testable without Pixi.
 */
export function bogEdgeShapes(
  style: BogEdgeStyle,
  a: Point,
  b: Point,
  outward: Point,
  seed: [number, number, number],
  scale = 1,
): BogEdgeShape[] {
  if (style === "off") return [];
  const at = (t: number, off: number): Point => ({
    x: a.x + (b.x - a.x) * t + outward.x * off,
    y: a.y + (b.y - a.y) * t + outward.y * off,
  });
  const along = (fn: (t: number) => number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= SAMPLES; i++)
      pts.push(at(i / SAMPLES, fn(i / SAMPLES)));
    return pts;
  };

  if (style === "feather") {
    // Moss bleeding onto the grass in a few translucent bands, the widest the faintest, plus a matching band
    // inside the bog: no line at all, just a softer colour step.
    const bands: BogEdgeShape[] = [];
    for (const [width, alpha] of [
      [16, 0.18],
      [10, 0.22],
      [5, 0.28],
    ] as const) {
      const w = width * scale;
      const outer = along((t) => w * Math.pow(Math.sin(Math.PI * t), 0.5));
      const inner = along(() => -w * 0.4).reverse();
      bands.push({
        points: [...outer, ...inner],
        fill: { color: BOG_MOSS, alpha },
      });
    }
    return bands;
  }

  if (style === "rim") {
    // A thin wavy peat line right on the edge, like the brown rims of the bog pools.
    const line = along((t) => 3 * scale * (wobble(t, seed) - 0.5));
    return [
      {
        points: line,
        stroke: { color: 0x000000, alpha: 0.12, width: 6 * scale },
      },
      {
        points: line,
        stroke: { color: BOG_PEAT, alpha: 0.85, width: 2.5 * scale },
      },
    ];
  }

  // 'lobes' / 'lobesRim': organic tongues of moss pushed out over the grass so the edge stops being a ruler line.
  const reach = 14 * scale;
  const outer = along((t) => reach * wobble(t, seed));
  const lobe: BogEdgeShape = {
    points: [...outer, at(1, -2 * scale), at(0, -2 * scale)],
    fill: { color: BOG_MOSS, alpha: 1 },
  };
  // Round caps on both corners: two edges meeting at a corner point their reach in different directions, the cap
  // fills the wedge between them. Only the grass-facing half, so nothing of a cap shows inside the bog.
  const caps = [a, b].map((p) => ({
    points: halfDisc(p, reach * CORNER_REACH, outward),
    fill: { color: BOG_MOSS, alpha: 1 },
  }));
  if (style === "lobes") return [...caps, lobe];
  // The rim is drawn *under* the moss of every edge (`under`): a wide peat stroke along the outline and a slightly
  // larger peat cap at each corner, with all the moss on top, so only the outer half shows and it follows the outline
  // of the whole bog instead of each edge's own shape.
  const capR = reach * CORNER_REACH;
  return [
    {
      under: true,
      points: outer,
      stroke: { color: 0x000000, alpha: 0.12, width: 9 * scale },
    },
    {
      under: true,
      points: outer,
      stroke: { color: BOG_PEAT, alpha: 1, width: 5 * scale },
    },
    ...[a, b].map((p) => ({
      under: true,
      points: halfDisc(p, capR + 2.5 * scale, outward),
      fill: { color: BOG_PEAT, alpha: 1 },
    })),
    ...caps,
    lobe,
  ];
}

/**
 * A fan around `c` on the `outward` side, ±70° about the normal: wide enough to close the wedge between two edges that
 * meet at a convex corner (their normals are about 60° apart), narrow enough not to reach along the edge line into the
 * next hex.
 */
function halfDisc(c: Point, r: number, outward: Point, steps = 10): Point[] {
  const mid = Math.atan2(outward.y, outward.x);
  const half = (70 * Math.PI) / 180;
  const pts: Point[] = [c];
  for (let i = 0; i <= steps; i++) {
    const t = mid - half + (i / steps) * 2 * half;
    pts.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r });
  }
  return pts;
}
