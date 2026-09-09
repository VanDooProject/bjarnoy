// How a building is named, categorised and pictured on the docs pages.
// Extracted from TechTreeView so the page's per-building sections and the
// dependency graph above them can't drift apart on any of the three.
import { buildingArt, terrainArt, type ArtRef } from '../map/buildingArt';

// The showcase atlas art HexMapRenderer/BuildingModal/RingMenu use — reused
// here rather than duplicated, so a doc-page thumbnail is never out of sync
// with what a building actually looks like in game. Each entry is the level
// this preview shows (an upgraded building looks more built-up, so pick a
// representative rung rather than always level 1); quarry has no building
// sprite of its own (the map renders it as its terrain, mountain, with no
// distinct prop), so it falls through to `terrainArt('mountain')` below.
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
  if (type === 'quarry') return terrainArt('mountain');
  return buildingArt(type, PREVIEW_LEVEL[type] ?? 1) ?? terrainArt('grass');
}

// Mirrors prototypes/MECHANICS.md's building categories (anchor / production
// / military / logistics) — the closest thing this codebase has to a
// canonical grouping — rather than inventing a new taxonomy for this page.
export const CATEGORY_ORDER = ['anchor', 'production', 'military', 'logistics'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  anchor: 'Anchor',
  production: 'Production',
  military: 'Military',
  logistics: 'Logistics',
};

const CATEGORY_OF: Record<string, Category> = {
  longhouse: 'anchor',
  farm: 'production',
  pumpkinfarm: 'production',
  lumberjack: 'production',
  quarry: 'production',
  fishinghut: 'production',
  magictower: 'production',
  fisherhut: 'production',
  sawmill: 'production',
  tower: 'military',
  archeryrange: 'military',
  barracks: 'military',
  storagehouse: 'logistics',
  greatstorehouse: 'logistics',
  dockyard: 'logistics',
};

export function categoryOf(type: string): Category {
  return CATEGORY_OF[type] ?? 'production';
}

/**
 * The graph's own legend splits the four page categories a little finer —
 * shrines and water buildings read as their own families on a dependency
 * map, and the ring menu (SettlementView's build ring) already groups them
 * that way. The page's section headings keep the coarser four.
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
  tower: 'military',
  archeryrange: 'military',
  barracks: 'military',
  storagehouse: 'logistics',
  greatstorehouse: 'logistics',
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
