// The preview's layers. A layer decides the colour of a hex, given the ones the layers
// before it left; each layer also declares its legend entries, and the legend strip is drawn
// from exactly those (and the colours the picture uses are the same table), so the legend
// cannot drift from the picture. Later PRs add layers here (`rivers`, `bog`, `camps`, ...): a
// new entry in LAYERS is all the CLI needs.
import { hexDistance } from '../../src/frontend/src/lib/hex/coords';
import { terrainAt, wastedTerrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import { TILE_ORIENTATIONS, type BogTile, type RiverTile, type Terrain } from '../../src/frontend/src/lib/map/types';
import { coordKey } from '../../src/frontend/src/lib/hex/coords';
import { computeRivers, riverStatsLines, type RiverField, type Window } from './rivers';
import { campsLayer } from './camps';

export type Rgb = readonly [number, number, number];

/** How a legend swatch / map marker is drawn; a plain colour hex when absent. */
export type MarkerShape = 'disc' | 'square' | 'diamond' | 'triangle' | 'triangleDown' | 'cross' | 'x' | 'hollowSquare' | 'hollowDisc' | 'ring';

export interface LegendEntry {
  label: string;
  colour: Rgb;
  /** Draw the swatch as this marker instead of a filled square. */
  shape?: MarkerShape;
}

/** What a layer's overlay and stats know about the picture being drawn. */
export interface PreviewContext {
  world: WorldSeed;
  radius: number;
  /** The drawn window in hexes (the whole world unless `--window`). */
  window: { q: number; r: number; size: number };
  windowed: boolean;
}

/** Pixel-space drawing on the finished map, for things bigger than a hex (markers, rings). */
export interface OverlayCanvas {
  /** Pixels per hex circumradius. */
  scale: number;
  /** Map-pixel position of the centre of hex (q, r). */
  toPixel(q: number, r: number): { x: number; y: number };
  marker(x: number, y: number, shape: MarkerShape, radius: number, colour: Rgb): void;
}

export interface Layer {
  id: string;
  description: string;
  /** What the layer draws, in legend order. */
  legend: readonly LegendEntry[];
  /** Called once before drawing (a layer that needs a whole-world pass does it here); returns extra stats lines. */
  prepare?(world: WorldSeed, window: Window | undefined): string[];
  /** True when `colourAt` wants the pixel's offset inside its hex (a layer that draws lines and marks, not flat hexes). */
  subhex?: boolean;
  /**
   * The colour of hex (q, r), or `null` to leave what the layers below drew. A `subhex` layer also gets
   * the pixel's offset from the hex centre in circumradius units (`dx`, `dy`, |d| <= 1) and whether the
   * hexes are big enough on screen (`fine`) for that to be worth drawing.
   */
  colourAt(q: number, r: number, world: WorldSeed, dx?: number, dy?: number, fine?: boolean): Rgb | null;
  /** Optional: draws markers on top of the finished map (after every layer's colours). */
  overlay?(canvas: OverlayCanvas, context: PreviewContext): void;
  /** Optional: extra footer lines for this layer. */
  stats?(context: PreviewContext): string[];
}

/** The colour of every terrain — used to paint the terrain layer and to build its legend. */
export const TERRAIN_COLOURS: Record<Terrain, Rgb> = {
  sea: [28, 59, 82],
  sand: [216, 193, 132],
  grass: [92, 148, 74],
  forest: [40, 96, 50],
  mountain: [128, 120, 108],
  bog: [98, 104, 56],
  lake: [22, 44, 92],
};

/** Wasted land (hidden as sea in the game until the endboss): a single dark red-brown. */
export const WASTED_COLOUR: Rgb = [122, 42, 36];

// (bog and lake come from the `bog` layer, not from the seed: the terrain layer never shows them.)
const TERRAIN_ORDER: Terrain[] = ['sea', 'sand', 'grass', 'forest', 'mountain'];

const terrainLayer: Layer = {
  id: 'terrain',
  description: 'sea, beach, grass, forest and mountain of the green islands',
  legend: TERRAIN_ORDER.map((t) => ({ label: t, colour: TERRAIN_COLOURS[t] })),
  colourAt: (q, r, world) => TERRAIN_COLOURS[terrainAt(q, r, world)],
};

const wastedLayer: Layer = {
  id: 'wasted',
  description: 'the wasted islands (invisible in game until the endboss triggers)',
  legend: [{ label: 'wasted land', colour: WASTED_COLOUR }],
  colourAt: (q, r, world) => (wastedTerrainAt(q, r, world) === 'sea' ? null : WASTED_COLOUR),
};

export const STREAM_COLOUR: Rgb = [130, 205, 245];
export const RIVER_COLOUR: Rgb = [22, 58, 175];
export const WIDEN_COLOUR: Rgb = [250, 205, 60];
export const SPRING_COLOUR: Rgb = [250, 250, 250];
export const CONFLUENCE_COLOUR: Rgb = [235, 90, 200];
export const MOUTH_COLOUR: Rgb = [255, 140, 30];

const SQRT3 = Math.sqrt(3);
const DIRECTION_VECTORS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
].map(([dq, dr]) => [1.5 * dq!, SQRT3 * (dr! + dq! / 2)] as const);
const RIVER_HALF_WIDTH = 0.3;
const STREAM_HALF_WIDTH = 0.14;

/** Distance from (px, py) to the segment centre -> (vx, vy) / 2. */
function distanceToHalfEdge(px: number, py: number, vx: number, vy: number): number {
  const ex = vx / 2;
  const ey = vy / 2;
  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - t * ex, py - t * ey);
}

let riverField: RiverField | null = null;

/** The rivers a preview drew last (for the stats and tests). */
export function lastRiverField(): RiverField | null {
  return riverField;
}

function riverColourAt(tile: RiverTile, dx: number, dy: number, fine: boolean): Rgb {
  const width = tile.width ?? 'river';
  const markerColour =
    tile.shape === 'spring'
      ? SPRING_COLOUR
      : tile.shape === 'confluence'
        ? CONFLUENCE_COLOUR
        : tile.shape === 'mouth'
          ? MOUTH_COLOUR
          : width === 'widen'
            ? WIDEN_COLOUR
            : null;
  const bodyColour = width === 'stream' ? STREAM_COLOUR : RIVER_COLOUR;
  if (!fine) return markerColour ?? bodyColour;

  const dist = Math.hypot(dx, dy);
  // Marks first: springs and widening tiles are a filled dot, confluences and mouths a ring.
  if (tile.shape === 'spring' || (width === 'widen' && tile.shape !== 'confluence' && tile.shape !== 'mouth')) {
    if (dist < 0.4) return markerColour!;
  } else if (dist > 0.42 && dist < 0.68 && markerColour) {
    return markerColour;
  }

  // The flow: in-segments carry what arrives (stream until the widening), the out-segment what leaves.
  const inHalf = width === 'river' || width === 'riverstream' ? RIVER_HALF_WIDTH : STREAM_HALF_WIDTH;
  const outHalf = width === 'stream' ? STREAM_HALF_WIDTH : RIVER_HALF_WIDTH;
  for (const d of tile.inDirections) {
    const v = DIRECTION_VECTORS[TILE_ORIENTATIONS.indexOf(d)]!;
    if (distanceToHalfEdge(dx, dy, v[0], v[1]) <= inHalf) return inHalf === STREAM_HALF_WIDTH ? STREAM_COLOUR : RIVER_COLOUR;
  }
  if (tile.outDirection) {
    const v = DIRECTION_VECTORS[TILE_ORIENTATIONS.indexOf(tile.outDirection)]!;
    if (distanceToHalfEdge(dx, dy, v[0], v[1]) <= outHalf) return outHalf === STREAM_HALF_WIDTH ? STREAM_COLOUR : RIVER_COLOUR;
  }
  if (dist <= Math.max(inHalf, outHalf)) return width === 'stream' ? STREAM_COLOUR : RIVER_COLOUR;
  return TERRAIN_COLOURS.grass;
}

const riversLayer: Layer = {
  id: 'rivers',
  description: 'the rivers of the green islands: streams (thin, light), rivers (thick, dark), widening tiles, springs, confluences, mouths',
  legend: [
    { label: 'stream', colour: STREAM_COLOUR },
    { label: 'river', colour: RIVER_COLOUR },
    { label: 'widening', colour: WIDEN_COLOUR },
    { label: 'spring', colour: SPRING_COLOUR },
    { label: 'confluence', colour: CONFLUENCE_COLOUR },
    { label: 'mouth', colour: MOUTH_COLOUR },
  ],
  subhex: true,
  prepare(world, window) {
    riverField = computeRivers(world, window);
    return riverStatsLines(riverField);
  },
  colourAt(q, r, _world, dx = 0, dy = 0, fine = false) {
    const tile = riverField?.tiles.get(coordKey({ q, r }));
    if (!tile) return null;
    const colour = riverColourAt(tile, dx, dy, fine);
    // Off the flow on a river hex, let the terrain below show.
    return colour === TERRAIN_COLOURS.grass ? null : colour;
  },
};


export const BOG_COLOUR: Rgb = [104, 112, 58];
export const LAKE_COLOUR: Rgb = [24, 46, 100];
/** Shores tinted by how many lake edges they touch: one (inlet), two (shore), three (half). */
export const INLET_COLOUR: Rgb = [70, 104, 118];
export const SHORE_COLOUR: Rgb = [52, 84, 116];
export const HALF_COLOUR: Rgb = [38, 66, 108];
export const CREEK_COLOUR: Rgb = [90, 150, 225];
export const BOG_MOUTH_COLOUR: Rgb = [255, 170, 40];
export const CREEK_SPRING_COLOUR: Rgb = [255, 255, 255];

const CREEK_HALF_WIDTH = 0.3;

function shoreColourOf(kind: BogTile['kind']): Rgb {
  return kind === 'inlet' ? INLET_COLOUR : kind === 'shore' ? SHORE_COLOUR : kind === 'half' ? HALF_COLOUR : BOG_COLOUR;
}

/** One bog hex's colour at a pixel inside it (`fine`: hexes big enough on screen to draw the creek's flow, not just tint the hex). */
function bogColourAt(tile: BogTile, dx: number, dy: number, fine: boolean): Rgb {
  if (tile.kind === 'lake') return LAKE_COLOUR;
  if (tile.kind === 'bog') return BOG_COLOUR;
  if (tile.kind === 'inlet' || tile.kind === 'shore' || tile.kind === 'half') {
    if (!fine) return shoreColourOf(tile.kind);
    // The lake side of a shore: pixels toward a water edge are lake, the rest is tinted moss.
    for (const d of tile.waterEdges) {
      const v = DIRECTION_VECTORS[TILE_ORIENTATIONS.indexOf(d)]!;
      const along = (dx * v[0] + dy * v[1]) / Math.hypot(v[0], v[1]) ** 2;
      if (along > 0.5) return LAKE_COLOUR;
    }
    return shoreColourOf(tile.kind);
  }

  const markerColour = tile.kind === 'creekspring' ? CREEK_SPRING_COLOUR : tile.kind === 'mouth' ? BOG_MOUTH_COLOUR : null;
  if (!fine) return markerColour ?? CREEK_COLOUR;
  const dist = Math.hypot(dx, dy);
  if (tile.kind === 'creekspring' && dist < 0.4) return CREEK_SPRING_COLOUR;
  if (tile.kind === 'mouth' && dist > 0.42 && dist < 0.68) return BOG_MOUTH_COLOUR;
  const arms = [...tile.inDirections, ...(tile.outDirection ? [tile.outDirection] : [])];
  for (const d of arms) {
    const v = DIRECTION_VECTORS[TILE_ORIENTATIONS.indexOf(d)]!;
    if (distanceToHalfEdge(dx, dy, v[0], v[1]) <= CREEK_HALF_WIDTH) return CREEK_COLOUR;
  }
  return dist <= CREEK_HALF_WIDTH ? CREEK_COLOUR : BOG_COLOUR;
}

/** The rule-violation counts the `bog` layer's footer prints, one label per rule. */
const RULE_LABELS: [keyof RiverField['bogViolations'], string][] = [
  ['R1', 'R1 <=3 CONTIGUOUS LAKE NEIGHBOURS'],
  ['R2', 'R2 LAKES APART'],
  ['R3', 'R3 CREEKS STRAIGHT/BEND'],
  ['R4', 'R4 CREEK MEETS LAKE AT A MOUTH'],
  ['R5', 'R5 FISH WEIR NOT GENERATED'],
  ['R6', 'R6 NO WALKWAYS'],
  ['R7', 'R7 INLAND'],
  ['R8', 'R8 ONE RIVER THROUGH EACH LAKE'],
  ['R9', 'R9 SPRING/SINK RULES'],
  ['R10', 'R10 POCKETS RINGED'],
  ['R11', 'R11 CREEKS AT RIVER WIDTH'],
];

export function bogStatsLines(f: RiverField): string[] {
  const sizes = f.bogIslands.flatMap((i) => i.lakes).sort((a, b) => a - b);
  const sum = (pick: (i: RiverField['bogIslands'][number]) => number) => f.bogIslands.reduce((a, i) => a + pick(i), 0);
  const sites = sum((i) => i.sites);
  const sinks = sum((i) => i.sinks);
  const spawns = sum((i) => i.spawns);
  const median = sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)]! : 0;
  const pct = (n: number) => (sites > 0 ? `${((100 * n) / sites).toFixed(0)}%` : '-');
  const violations = RULE_LABELS.map(([k, label]) => `${label} ${f.bogViolations[k]}`);
  const total = Object.values(f.bogViolations).reduce((a, b) => a + b, 0);
  return [
    `BOG ON ${f.bogIslands.length}/${f.islands} ISLANDS  ${f.bogs.size} TILES  LAKES ${sizes.length} (TILES ${sizes[0] ?? 0}/${median}/${sizes[sizes.length - 1] ?? 0} MIN/MEDIAN/MAX)  THROUGH-RIVER BOGS ${sites}  SINKS ${sinks} (${pct(sinks)})  SPAWNS ${spawns} (${pct(spawns)})`,
    `POCKETS FOUND ${sum((i) => i.pocketsFound)}  FILLED ${sum((i) => i.pocketsFilled)}  RIVERS SUNK INTO POCKETS ${sum((i) => i.pocketSinks)}`,
    `RULE VIOLATIONS (MUST BE 0): ${violations.join('  ')}  TOTAL ${total}`,
  ];
}

const bogLayer: Layer = {
  id: 'bog',
  description: 'bogland: bog moss, lakes, shores (tinted by lake edges), creeks, mouths and creek springs of the green islands',
  legend: [
    { label: 'bog moss', colour: BOG_COLOUR },
    { label: 'bog lake', colour: LAKE_COLOUR },
    { label: 'inlet (1 lake edge)', colour: INLET_COLOUR },
    { label: 'shore (2)', colour: SHORE_COLOUR },
    { label: 'half shore (3)', colour: HALF_COLOUR },
    { label: 'creek', colour: CREEK_COLOUR },
    { label: 'lake mouth', colour: BOG_MOUTH_COLOUR },
    { label: 'creek spring', colour: CREEK_SPRING_COLOUR },
  ],
  subhex: true,
  prepare(world, window) {
    riverField = computeRivers(world, window);
    return bogStatsLines(riverField);
  },
  colourAt(q, r, _world, dx = 0, dy = 0, fine = false) {
    const tile = riverField?.bogs.get(coordKey({ q, r }));
    if (!tile) return null;
    return bogColourAt(tile, dx, dy, fine);
  },
};

export const LAYERS: Record<string, Layer> = {
  [terrainLayer.id]: terrainLayer,
  [wastedLayer.id]: wastedLayer,
  [riversLayer.id]: riversLayer,
  [bogLayer.id]: bogLayer,
  [campsLayer.id]: campsLayer,
};

/** Colours of the frame the map is drawn in — also legend entries, so they are explained. */
export const OUTSIDE_WORLD_TINT = 0.45;
export const RADIUS_OUTLINE: Rgb = [235, 90, 70];

/** The legend of `layerIds`, in layer order, plus the fixed frame entries. */
export function legendFor(layerIds: readonly string[]): LegendEntry[] {
  const entries: LegendEntry[] = [];
  for (const id of layerIds) entries.push(...LAYERS[id].legend);
  entries.push({ label: 'world radius', colour: RADIUS_OUTLINE });
  return entries;
}

export function resolveLayers(ids: readonly string[]): Layer[] {
  return ids.map((id) => {
    const layer = LAYERS[id];
    if (!layer) throw new Error(`unknown layer "${id}" (available: ${Object.keys(LAYERS).join(', ')})`);
    return layer;
  });
}

/** Distance of hex (q, r) from the origin — re-exported so the renderer needs one import. */
export const distanceFromOrigin = (q: number, r: number): number => hexDistance({ q: 0, r: 0 }, { q, r });
