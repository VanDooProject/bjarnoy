// How a building is named, categorised and pictured on the docs pages.
// Extracted from TechTreeView so the page's per-building sections and the
// dependency graph above them can't drift apart on any of the three.
import { buildingArt, terrainArt, type ArtRef } from '../map/buildingArt';

// The showcase atlas art HexMapRenderer/BuildingModal/RingMenu use — reused
// here rather than duplicated, so a doc-page thumbnail is never out of sync
// with what a building actually looks like in game. Each entry is the level
// this preview shows (an upgraded building looks more built-up, so pick a
// representative rung rather than always level 1).
const PREVIEW_LEVEL: Record<string, number> = {
  longhouse: 4,
  storagehouse: 4,
  farm: 1,
  lumberjack: 2,
  tower: 0,
  pumpkinfarm: 1,
  shrineofthor: 2,
  shrineoffreyja: 2,
  shrineofullr: 2,
  shrineofnjord: 2,
  archeryrange: 2,
  dockyard: 7,
  greatstorehouse: 4,
  barracks: 2,
  fisherhut: 2,
  // Flat/inland family only — same simplification buildingArt.ts's preview
  // card makes, regardless of where the actual tile sits next to a river.
  sawmill: 2,
  // Corrie landform only — same simplification, regardless of which of the
  // two the actual tile was carved into (see the docs page's own variant
  // picker for the saddleback alternative).
  quarry: 2,
};

const TYPE_LABELS: Record<string, string> = {
  storagehouse: 'Storage house',
  fishinghut: 'Fishing hut',
  magictower: 'Magic tower',
  pumpkinfarm: 'Pumpkin farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  shrineofullr: 'Shrine of Ullr',
  shrineofnjord: 'Shrine of Njörd',
  archeryrange: 'Archery range',
  dockyard: 'Dockyard',
  greatstorehouse: 'Great storehouse',
  fisherhut: 'Fisher hut',
  townsquare: 'Town square',
  cropmill: 'Crop mill',
  druidhut: "Druid's hut",
  cartworkshop: 'Cart workshop',
  claybrickworks: 'Clay brickworks',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Short forms for prerequisite chips, which sit three-to-a-card in a 172px
 * box — "Storage house 10" would wrap or clip where "Storage 10" fits.
 */
const SHORT_LABELS: Record<string, string> = {
  longhouse: 'LH',
  lumberjack: 'Lumber',
  fishinghut: 'Fish hut',
  storagehouse: 'Storage',
  greatstorehouse: 'Great st.',
  pumpkinfarm: 'Pumpkin',
  shrineofthor: 'Thor',
  shrineoffreyja: 'Freyja',
  shrineofullr: 'Ullr',
  shrineofnjord: 'Njörd',
  archeryrange: 'Archery',
  magictower: 'Magic t.',
};

export function shortLabel(type: string): string {
  return SHORT_LABELS[type] ?? typeLabel(type);
}

export function art(type: string): ArtRef {
  return buildingArt(type, PREVIEW_LEVEL[type] ?? 1) ?? terrainArt('grass');
}

/**
 * The single categorisation both the dependency graph's legend and
 * TechTreeView's own page sections/table of contents draw from — mirrors
 * MapView.vue's BUILD_CATEGORIES (the ring menu's own grouping), with
 * shrines and water buildings split out as their own families the way the
 * ring menu already treats them, rather than folded into a generic
 * "production" bucket. One table, so a type added here shows up correctly
 * in both places instead of two hand-kept lists drifting apart.
 */
export const GRAPH_CATEGORY_ORDER = [
  'anchor',
  'production',
  'military',
  'logistics',
  'religion',
  'water',
] as const;
export type GraphCategory = (typeof GRAPH_CATEGORY_ORDER)[number];

const GRAPH_CATEGORY_OF: Record<string, GraphCategory> = {
  longhouse: 'anchor',
  lumberjack: 'production',
  farm: 'production',
  quarry: 'production',
  pumpkinfarm: 'production',
  sawmill: 'production',
  magictower: 'production',
  meadery: 'production',
  cropmill: 'production',
  claybrickworks: 'production',
  tower: 'military',
  archeryrange: 'military',
  barracks: 'military',
  smithy: 'military',
  storagehouse: 'logistics',
  greatstorehouse: 'logistics',
  cartworkshop: 'logistics',
  townsquare: 'logistics',
  druidhut: 'logistics',
  shrineofthor: 'religion',
  shrineoffreyja: 'religion',
  shrineofullr: 'religion',
  shrineofnjord: 'religion',
  fishinghut: 'water',
  fisherhut: 'water',
  dockyard: 'water',
};

export function graphCategoryOf(type: string): GraphCategory {
  return GRAPH_CATEGORY_OF[type] ?? 'production';
}

/** The colour token each graph category is drawn in — all already in style.css. */
export const GRAPH_CATEGORY_COLOR: Record<GraphCategory, string> = {
  anchor: 'var(--gold)',
  production: 'var(--food)',
  military: 'var(--iron)',
  logistics: 'var(--stone)',
  religion: 'var(--shrine)',
  water: 'var(--water)',
};

/**
 * The legend, in order. The anchor is left out deliberately: there is one
 * longhouse and it is obvious, so a swatch for it would be noise.
 */
export const GRAPH_LEGEND: ReadonlyArray<{ id: GraphCategory; label: string }> = [
  { id: 'production', label: 'Production' },
  { id: 'military', label: 'Military' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'religion', label: 'Shrines' },
  { id: 'water', label: 'Water' },
];
