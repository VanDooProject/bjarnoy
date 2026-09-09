// Where each building sits on the dependency graph, and the geometry the
// links are routed through. This is presentation, not game data: the
// prerequisites themselves come from the building catalogue (the backend's
// BuildingCatalogue table), and this file only decides where to draw them.

/** Card box. */
export const CARD_W = 172;
export const CARD_H = 100;

/** Grid pitch. The gap between two columns (COL_PITCH - CARD_W) is the gutter every vertical link runs in. */
export const COL_PITCH = 240;
export const ROW_PITCH = 114;

/** Gutter width — 68px, wide enough for four lanes at LANE_STEP apart. */
export const GUTTER = COL_PITCH - CARD_W;

/** First lane sits this far into the gutter; each further lane this much again beyond it. */
export const LANE_OFFSET = 12;
export const LANE_STEP = 13;

/**
 * The building every root hangs off. Nothing in the catalogue names the
 * longhouse as a prerequisite — it gates through `requiredLonghouseLevel`
 * instead — but on a dependency map a settlement's anchor is where every
 * chain visibly starts, so the graph draws that edge.
 */
export const ANCHOR = 'longhouse';

/**
 * Slated for removal from the game and already gone from the art pipeline,
 * so the docs stop advertising them. They are still in the catalogue (a
 * building type can't simply be dropped from a persisted enum), so this is a
 * docs-only omission — delete the entry to bring one back.
 */
export const HIDDEN_FROM_DOCS: readonly string[] = ['magictower', 'fisherhut'];

export const COLUMN_TITLES: readonly string[] = ['Anchor', 'First works', 'Refining', 'Advanced', 'Capstone'];

export type Slot = readonly [col: number, row: number];

/**
 * Column is dependency depth; row is chosen so that most links are a single
 * horizontal run, one row per chain — sources sit level with everything they
 * feed: lumberjack with sawmill, storage house with great storehouse,
 * fishing hut with dockyard, and tower with barracks and archery range.
 *
 * The two multi-parent capstones (Shrine of Freyja needs Farm *and* Pumpkin
 * Farm; Shrine of Thor needs Barracks *and* Archery Range) each get a row of
 * their own instead — every other building in their row would otherwise sit
 * directly between one of their two sources and their own card, which a
 * flat same-row link can't route through without crossing it. A vertical
 * jump into a fresh row for both parents sidesteps that instead of leaning
 * on a deliberately-left-empty cell the way a single-parent skip would.
 */
export const TECH_TREE_LAYOUT: Readonly<Record<string, Slot>> = {
  longhouse: [0, 3],

  lumberjack: [1, 0],
  farm: [1, 1],
  quarry: [1, 2],
  storagehouse: [1, 3],
  fishinghut: [1, 4],
  tower: [1, 5],

  sawmill: [2, 0],
  pumpkinfarm: [2, 1],
  greatstorehouse: [2, 3],
  dockyard: [2, 4],
  barracks: [2, 5],

  archeryrange: [3, 5],

  shrineoffreyja: [3, 6],
  shrineofthor: [4, 7],
};

export const COLUMNS = COLUMN_TITLES.length;
export const ROWS = 1 + Math.max(...Object.values(TECH_TREE_LAYOUT).map(([, row]) => row));

/** Drawing area, sized to the laid-out cards. */
export const GRID_W = (COLUMNS - 1) * COL_PITCH + CARD_W;
export const GRID_H = (ROWS - 1) * ROW_PITCH + CARD_H;

/**
 * A reserved horizontal lane below every card, for the rare link whose target
 * sits behind another card and so cannot be reached at either end's height.
 * No edge needs it with the current prerequisites; it exists so the
 * "no line ever crosses a card" invariant survives a change to them.
 */
export const BYPASS_Y = GRID_H + 24;

/** Left edge of a column's cards. */
export const columnX = (col: number): number => col * COL_PITCH;

/** Top edge of a row's cards. */
export const rowY = (row: number): number => row * ROW_PITCH;

/** Vertical centre of a row's cards — where links enter and leave. */
export const rowMid = (row: number): number => rowY(row) + CARD_H / 2;
