// The preview's layers. A layer decides the colour of a hex, given the ones the layers
// before it left; each layer also declares its legend entries, and the legend strip is drawn
// from exactly those (and the colours the picture uses are the same table), so the legend
// cannot drift from the picture. Later PRs add layers here (`rivers`, `bog`, `camps`, ...): a
// new entry in LAYERS is all the CLI needs.
import { hexDistance } from '../../src/frontend/src/lib/hex/coords';
import { terrainAt, wastedTerrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import type { Terrain } from '../../src/frontend/src/lib/map/types';

export type Rgb = readonly [number, number, number];

export interface LegendEntry {
  label: string;
  colour: Rgb;
}

export interface Layer {
  id: string;
  description: string;
  /** What the layer draws, in legend order. */
  legend: readonly LegendEntry[];
  /** The colour of hex (q, r), or `null` to leave what the layers below drew. */
  colourAt(q: number, r: number, world: WorldSeed): Rgb | null;
}

/** The colour of every terrain — used to paint the terrain layer and to build its legend. */
export const TERRAIN_COLOURS: Record<Terrain, Rgb> = {
  sea: [28, 59, 82],
  sand: [216, 193, 132],
  grass: [92, 148, 74],
  forest: [40, 96, 50],
  mountain: [128, 120, 108],
};

/** Wasted land (hidden as sea in the game until the endboss): a single dark red-brown. */
export const WASTED_COLOUR: Rgb = [122, 42, 36];

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

export const LAYERS: Record<string, Layer> = {
  [terrainLayer.id]: terrainLayer,
  [wastedLayer.id]: wastedLayer,
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
