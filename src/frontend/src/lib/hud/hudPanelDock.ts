// Desktop settlement view: the four HUD panels (Construction, Garrison, Armies, Quests) dock into full-height columns on
// the left and right of the map area. A panel sits in a (side, column, align) group: `column` 0 is the column at that
// side's outer screen edge, higher numbers lie further toward the centre; `align` top-stacks from the column's top, bottom
// stacks from its bottom; `order` is the position inside the group. The defaults, the validation of stored prefs, the
// column lists, the drop target of a dragged panel and the icon rail's offset live here as plain numbers and pure
// functions; components/hud/HudPanelDock.vue, HudPanelColumn.vue and stores/hudPrefs.ts read them.

export const HUD_PANEL_IDS = ['construction', 'garrison', 'armies', 'quests'] as const;
export type HudPanelId = (typeof HUD_PANEL_IDS)[number];

/** The i18n key of each panel's name (its header title); shared by the icon rail and the dock's collapse buttons. */
export const HUD_PANEL_LABEL_KEYS: Record<HudPanelId, string> = {
  construction: 'hud.buildQueue.title',
  garrison: 'hud.trainingQueue.garrison',
  armies: 'hud.armyPanel.title',
  quests: 'quests.title',
};

export type DockSide = 'left' | 'right';
export type DockAlign = 'top' | 'bottom';

export interface HudPanelPref {
  open: boolean;
  collapsed: boolean;
  side: DockSide;
  column: number;
  align: DockAlign;
  order: number;
}

/** The first spots: queue top left, garrison top right, armies bottom right, quests bottom left; all open and expanded. */
export const DEFAULT_HUD_PANELS: Readonly<Record<HudPanelId, HudPanelPref>> = {
  construction: { open: true, collapsed: false, side: 'left', column: 0, align: 'top', order: 0 },
  garrison: { open: true, collapsed: false, side: 'right', column: 0, align: 'top', order: 0 },
  armies: { open: true, collapsed: false, side: 'right', column: 0, align: 'bottom', order: 0 },
  quests: { open: true, collapsed: false, side: 'left', column: 0, align: 'bottom', order: 0 },
};

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** A fully valid stored entry; anything else (an old `{ open, corner }` entry included) is not one. */
export function isHudPanelPref(v: unknown): v is HudPanelPref {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.open === 'boolean' &&
    typeof e.collapsed === 'boolean' &&
    (e.side === 'left' || e.side === 'right') &&
    (e.align === 'top' || e.align === 'bottom') &&
    isCount(e.column) &&
    isCount(e.order)
  );
}

/** Gutter from the map area's left, right and bottom edges (the 16px HUD gutter of ui-guidelines section 4). */
export const DOCK_GUTTER = 16;
/** Columns start under the 64px header bar plus 12px. */
export const DOCK_TOP = 76;
/** Between two panels stacked in one column. */
export const DOCK_STACK_GAP = 8;
/** Between two neighbouring columns of one side. */
export const DOCK_COLUMN_GAP = 8;
/** The icon rail at the bottom left (HudPanelColumn.vue): button size, and the clear space a left column keeps from it. */
export const COLUMN_BUTTON_SIZE = 40;
export const COLUMN_BUTTON_GAP = 8;
export const COLUMN_CLEARANCE = 12;

export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Panels = Readonly<Record<HudPanelId, HudPanelPref>>;

const byOrder = (panels: Panels) => (a: HudPanelId, b: HudPanelId) =>
  panels[a].order - panels[b].order || HUD_PANEL_IDS.indexOf(a) - HUD_PANEL_IDS.indexOf(b);

export interface DockColumn {
  column: number;
  top: HudPanelId[];
  bottom: HudPanelId[];
}

/**
 * Every stored column of `side` that holds any panel (shown or not), ascending (outermost first). `top` / `bottom` list
 * only the shown panels, sorted by `order` (ties in the fixed panel order).
 */
export function columnsOnSide(panels: Panels, side: DockSide, shown: (id: HudPanelId) => boolean = () => true): DockColumn[] {
  const onSide = HUD_PANEL_IDS.filter((id) => panels[id].side === side);
  const numbers = [...new Set(onSide.map((id) => panels[id].column))].sort((a, b) => a - b);
  const cmp = byOrder(panels);
  return numbers.map((column) => {
    const inColumn = onSide.filter((id) => panels[id].column === column && shown(id));
    return {
      column,
      top: inColumn.filter((id) => panels[id].align === 'top').sort(cmp),
      bottom: inColumn.filter((id) => panels[id].align === 'bottom').sort(cmp),
    };
  });
}

export interface ColumnGeom {
  column: number;
  left: number;
  right: number;
  top: { id: HudPanelId; centreY: number }[];
  bottom: { id: HudPanelId; centreY: number }[];
}

export interface DropTarget {
  side: DockSide;
  column: number;
  align: DockAlign;
  /** The sibling the panel goes in front of (in its group's order), or null for the end of the group. */
  before: HudPanelId | null;
}

/**
 * Where a dragged panel whose centre is at `centre` (and which is `width` wide) lands. `sides` holds the columns that show
 * a panel, outer to inner, in the same coordinates as `area`, with the dragged panel left out of their panel lists (a
 * column holding only it keeps its x-range).
 */
export function dropTarget(input: { centre: { x: number; y: number }; width: number; area: Area; sides: Record<DockSide, ColumnGeom[]> }): DropTarget {
  const { centre, width, area, sides } = input;
  const side: DockSide = centre.x < area.left + area.width / 2 ? 'left' : 'right';
  const align: DockAlign = centre.y < area.top + area.height / 2 ? 'top' : 'bottom';
  const columns = sides[side];
  let chosen: ColumnGeom | null = null;
  let column = 0;
  if (columns.length > 0) {
    const inner = columns[columns.length - 1];
    chosen = columns.find((c) => centre.x >= c.left && centre.x <= c.right) ?? null;
    if (!chosen) {
      const beyond = side === 'left' ? centre.x > inner.right : centre.x < inner.left;
      if (beyond && newColumnFits(side, sides, area, width)) {
        column = inner.column + 1;
      } else {
        chosen = beyond ? inner : nearest(columns, centre.x);
      }
    }
    if (chosen) column = chosen.column;
  }
  let before: HudPanelId | null = null;
  if (chosen) {
    if (align === 'top') before = chosen.top.find((p) => p.centreY > centre.y)?.id ?? null;
    else before = chosen.bottom.find((p) => p.centreY < centre.y)?.id ?? null;
  }
  return { side, column, align, before };
}

/** The column whose x-range is closest to `x` (the outermost one for a point between it and the screen edge). */
function nearest(columns: ColumnGeom[], x: number): ColumnGeom {
  const gap = (c: ColumnGeom) => Math.max(c.left - x, x - c.right, 0);
  return columns.reduce((best, c) => (gap(c) < gap(best) ? c : best));
}

/** Whether a new column of `width` fits between the innermost column of `side` and the other side's (or the far edge). */
function newColumnFits(side: DockSide, sides: Record<DockSide, ColumnGeom[]>, area: Area, width: number): boolean {
  const mine = sides[side];
  const other = sides[side === 'left' ? 'right' : 'left'];
  const inner = mine[mine.length - 1];
  const otherInner = other[other.length - 1];
  if (side === 'left') {
    const limit = otherInner ? otherInner.left : area.left + area.width - DOCK_GUTTER;
    return limit - DOCK_COLUMN_GAP - (inner.right + DOCK_COLUMN_GAP) >= width;
  }
  const limit = otherInner ? otherInner.right : area.left + DOCK_GUTTER;
  return inner.left - DOCK_COLUMN_GAP - (limit + DOCK_COLUMN_GAP) >= width;
}

/**
 * The prefs after `id` is dropped on `target`: moved to (side, column, align) in front of `target.before` (hidden panels
 * count) or at the end, the `order` of the group it left and of the group it joined renumbered, and the column numbers of
 * each side compacted to 0..k-1 over all panels. open / collapsed stay.
 */
export function applyDrop(panels: Panels, id: HudPanelId, target: DropTarget): Record<HudPanelId, HudPanelPref> {
  const next = {} as Record<HudPanelId, HudPanelPref>;
  for (const pid of HUD_PANEL_IDS) next[pid] = { ...panels[pid] };
  const from = { side: panels[id].side, column: panels[id].column, align: panels[id].align };
  const cmp = byOrder(panels);
  const group = (side: DockSide, column: number, align: DockAlign) =>
    HUD_PANEL_IDS.filter((p) => p !== id && panels[p].side === side && panels[p].column === column && panels[p].align === align).sort(cmp);

  const joined = group(target.side, target.column, target.align);
  const at = target.before ? joined.indexOf(target.before) : -1;
  joined.splice(at < 0 ? joined.length : at, 0, id);
  const left = group(from.side, from.column, from.align);

  next[id].side = target.side;
  next[id].column = target.column;
  next[id].align = target.align;
  joined.forEach((p, i) => (next[p].order = i));
  left.forEach((p, i) => (next[p].order = i));

  for (const side of ['left', 'right'] as const) {
    const numbers = [...new Set(HUD_PANEL_IDS.filter((p) => next[p].side === side).map((p) => next[p].column))].sort((a, b) => a - b);
    for (const p of HUD_PANEL_IDS) if (next[p].side === side) next[p].column = numbers.indexOf(next[p].column);
  }
  return next;
}

/**
 * The x of the icon rail (area-relative px): the gutter, pushed right of every left column that would overlap it. `columns`
 * are the left side's rendered columns, outer to inner; `contentBottom` is the bottom of a column's lowest shown panel.
 */
export function railLeft(columns: { left: number; right: number; contentBottom: number }[], rail: { width: number; top: number }): number {
  let x = DOCK_GUTTER;
  for (const c of columns) {
    if (c.left < x + rail.width && c.right > x && c.contentBottom > rail.top - COLUMN_CLEARANCE) x = c.right + COLUMN_CLEARANCE;
  }
  return x;
}
