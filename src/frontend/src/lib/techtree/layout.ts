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
 * Buildings still in the catalogue that the docs should not advertise — a
 * docs-only omission, add an entry to hide one. Currently none: the Magic
 * Tower and the Fisher Hut (merged into the Fishing Hut) are gone from the
 * catalogue altogether.
 */
export const HIDDEN_FROM_DOCS: readonly string[] = [];

export const COLUMN_TITLES: readonly string[] = ['Anchor', 'First works', 'Refining', 'Advanced', 'Capstone'];

export type Slot = readonly [col: number, row: number];

/**
 * Column is dependency depth; row is the unlock ladder (docs/design/economy.md
 * section 5), read top to bottom: rows are ordered by the Longhouse level their
 * first card unlocks at, so scrolling down the page walks the game's own
 * progression — Lumberjack, Reindeer Herder, Quarry, Clay Brickworks and
 * Storage House (LH 1), Fishing Hut (LH 2), Tower (LH 3), Bog-ore works and
 * Town Square (LH 6). Each row is one chain: a source sits level with what it feeds, so
 * most links are a single horizontal run — Lumberjack -> Sawmill -> Shrine of
 * Ullr, Reindeer Herder -> Farm -> Crop Mill -> Shrine of Freyja, Storage House -> Great
 * Storehouse, Fishing Hut -> Dockyard -> Shrine of Njörd, Tower -> Barracks ->
 * Archery Range.
 *
 * Every building has at most one feeder now, so every link joins two adjacent
 * columns and nothing needs the same-row chain reuse or the bypass lane. A
 * source with a second target (Farm -> Meadery, Barracks -> Weaponsmith, Town
 * Square -> Druid Hut) drops it one row down, below its own row's chain, and
 * its trunk runs down the gutter beside it. The Weaponsmith (Smithy) has the
 * Shrine of Thor as its own capstone in the last column, and the Druid Hut the
 * Odin Statue.
 *
 * Farm and Pumpkin Farm are two building types (their soil rules differ) but
 * one card: only `farm` has a slot here, and `MERGED_CARDS` (nodes.ts) names
 * the card "Farm / Pumpkin Farm (by soil)". Likewise only `palisade` has a slot
 * for the Palisade and its Gate: "Palisade / Gate".
 */
export const TECH_TREE_LAYOUT: Readonly<Record<string, Slot>> = {
  longhouse: [0, 3],

  // Row 0 — Lumberjack (LH 1) -> Sawmill (LH 20) -> Shrine of Ullr (LH 25).
  // Every shrine sits in the Capstone column, so the gods line up.
  lumberjack: [1, 0],
  sawmill: [2, 0],
  shrineofullr: [4, 0],

  // Row 1 — Reindeer Herder (LH 1) -> Farm / Pumpkin Farm (LH 4) -> Crop Mill
  // (LH 20) -> Shrine of Freyja (LH 25).
  reindeerherder: [1, 1],
  farm: [2, 1],
  cropmill: [3, 1],
  shrineoffreyja: [4, 1],
  // Row 2 — Quarry (LH 1), and Farm's second target, the Meadery (LH 11),
  // one row below the Farm chain.
  quarry: [1, 2],
  meadery: [3, 2],

  // Row 3 — Clay Brickworks (LH 1), a plain root with nothing behind it.
  claybrickworks: [1, 3],

  // Row 4 — Storage House (LH 1) -> Great Storehouse (LH 15).
  storagehouse: [1, 4],
  greatstorehouse: [2, 4],

  // Row 5 — Fishing Hut (LH 2) -> Dockyard (LH 8) -> Shrine of Njörd (LH 25).
  fishinghut: [1, 5],
  dockyard: [2, 5],
  shrineofnjord: [4, 5],

  // Row 6 — Tower (LH 3) -> Barracks (LH 5) -> Archery Range (LH 9).
  tower: [1, 6],
  barracks: [2, 6],
  archeryrange: [3, 6],
  // Row 7 — Tower's second target, the Palisade / Gate (LH 7, behind a level-5 Tower), one row below the Barracks chain.
  palisade: [2, 7],
  // Barracks' second target, the Weaponsmith (Smithy, LH 15), with
  // the Shrine of Thor (LH 25) behind it.
  smithy: [3, 7],
  shrineofthor: [4, 7],

  // Row 8 — Bog-ore works (LH 6) -> Hammerschmiede (LH 20): the iron chain.
  bogoreworks: [1, 8],
  hammerschmiede: [2, 8],

  // Row 9 — Town Square (LH 6) -> Cart Workshop (LH 10); its second target,
  // the Druid Hut (LH 12), one row below.
  townsquare: [1, 9],
  cartworkshop: [2, 9],
  druidhut: [2, 10],
  // Row 10 — the Druid Hut (LH 12) -> Odin Statue (LH 25), in the Capstone column.
  odinstatue: [4, 10],
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
