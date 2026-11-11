import { describe, expect, it } from 'vitest';
import {
  COLUMN_CLEARANCE,
  DEFAULT_HUD_PANELS,
  DOCK_GUTTER,
  applyDrop,
  columnsOnSide,
  dropTarget,
  isHudPanelPref,
  railLeft,
  type ColumnGeom,
  type HudPanelId,
  type HudPanelPref,
} from './hudPanelDock';

const area = { left: 0, top: 0, width: 1000, height: 800 };
const panels = (patch: Partial<Record<HudPanelId, Partial<HudPanelPref>>> = {}) => {
  const out = {} as Record<HudPanelId, HudPanelPref>;
  for (const id of Object.keys(DEFAULT_HUD_PANELS) as HudPanelId[]) out[id] = { ...DEFAULT_HUD_PANELS[id], ...patch[id] };
  return out;
};

describe('isHudPanelPref', () => {
  it('accepts a full entry and rejects the old corner format and bad fields', () => {
    expect(isHudPanelPref(DEFAULT_HUD_PANELS.quests)).toBe(true);
    expect(isHudPanelPref({ open: true, corner: 'top-left' })).toBe(false);
    expect(isHudPanelPref({ ...DEFAULT_HUD_PANELS.quests, side: 'middle' })).toBe(false);
    expect(isHudPanelPref({ ...DEFAULT_HUD_PANELS.quests, align: 'centre' })).toBe(false);
    expect(isHudPanelPref({ ...DEFAULT_HUD_PANELS.quests, column: -1 })).toBe(false);
    expect(isHudPanelPref({ ...DEFAULT_HUD_PANELS.quests, order: 1.5 })).toBe(false);
    expect(isHudPanelPref({ ...DEFAULT_HUD_PANELS.quests, collapsed: 'no' })).toBe(false);
    expect(isHudPanelPref(null)).toBe(false);
  });
});

describe('columnsOnSide', () => {
  it('lists the default layout: construction top and quests bottom on the left', () => {
    expect(columnsOnSide(panels(), 'left')).toEqual([{ column: 0, top: ['construction'], bottom: ['quests'] }]);
    expect(columnsOnSide(panels(), 'right')).toEqual([{ column: 0, top: ['garrison'], bottom: ['armies'] }]);
  });

  it('sorts a group by order, ties in the fixed panel order, and lists columns ascending', () => {
    const p = panels({
      garrison: { side: 'left', column: 1, align: 'top', order: 1 },
      armies: { side: 'left', column: 1, align: 'top', order: 0 },
      quests: { side: 'left', column: 1, align: 'top', order: 0 },
    });
    expect(columnsOnSide(p, 'left')).toEqual([
      { column: 0, top: ['construction'], bottom: [] },
      { column: 1, top: ['armies', 'quests', 'garrison'], bottom: [] },
    ]);
  });

  it('keeps a column that only holds hidden panels but lists none of them', () => {
    expect(columnsOnSide(panels(), 'left', () => false)).toEqual([{ column: 0, top: [], bottom: [] }]);
  });
});

const col = (column: number, left: number, right: number, top: ColumnGeom['top'] = [], bottom: ColumnGeom['bottom'] = []): ColumnGeom => ({
  column,
  left,
  right,
  top,
  bottom,
});

describe('dropTarget', () => {
  const sides = {
    left: [col(0, 16, 296, [{ id: 'construction', centreY: 200 }], [{ id: 'quests', centreY: 700 }])],
    right: [col(0, 740, 984, [{ id: 'garrison', centreY: 200 }], [{ id: 'armies', centreY: 700 }])],
  };
  const drop = (x: number, y: number, over = sides, width = 240) => dropTarget({ centre: { x, y }, width, area, sides: over });

  it('takes side and align from the area quadrant', () => {
    expect(drop(100, 100)).toMatchObject({ side: 'left', align: 'top' });
    expect(drop(900, 700)).toMatchObject({ side: 'right', align: 'bottom' });
    expect(drop(499, 400)).toMatchObject({ side: 'left', align: 'bottom' });
    expect(drop(500, 399)).toMatchObject({ side: 'right', align: 'top' });
  });

  it('joins the column the centre lies in', () => {
    expect(drop(150, 100)).toMatchObject({ side: 'left', column: 0 });
  });

  it('picks the outermost column when the centre is between the edge and column 0', () => {
    expect(drop(5, 100)).toMatchObject({ side: 'left', column: 0 });
    expect(drop(995, 100)).toMatchObject({ side: 'right', column: 0 });
  });

  it('opens a new column past the innermost one when it fits', () => {
    expect(drop(400, 100)).toMatchObject({ side: 'left', column: 1, before: null });
    expect(drop(600, 100)).toMatchObject({ side: 'right', column: 1 });
  });

  it('falls back to the innermost column when a new one does not fit', () => {
    // Left space 304..732 (428) fits 240; with a 500 wide panel it does not.
    expect(drop(400, 100, sides, 500)).toMatchObject({ side: 'left', column: 0 });
    const crowded = { left: sides.left, right: [col(0, 380, 984)] };
    expect(drop(340, 100, crowded)).toMatchObject({ side: 'left', column: 0 });
  });

  it('uses column 0 for a side without columns, and the far edge as the limit', () => {
    const onlyRight = { left: [], right: sides.right };
    expect(drop(100, 100, onlyRight)).toMatchObject({ side: 'left', column: 0, before: null });
    const onlyLeft = { left: sides.left, right: [] };
    expect(drop(400, 100, onlyLeft)).toMatchObject({ side: 'left', column: 1 });
  });

  it('puts a top-group drop before the first sibling below the centre', () => {
    const two = { ...sides, left: [col(0, 16, 296, [{ id: 'construction', centreY: 100 }, { id: 'garrison', centreY: 300 }])] };
    expect(drop(100, 50, two)).toMatchObject({ align: 'top', before: 'construction' });
    expect(drop(100, 200, two)).toMatchObject({ align: 'top', before: 'garrison' });
    expect(drop(100, 390, two)).toMatchObject({ align: 'top', before: null });
  });

  it('puts a bottom-group drop before the first sibling (nearest the bottom first) above the centre', () => {
    const two = { ...sides, left: [col(0, 16, 296, [], [{ id: 'quests', centreY: 700 }, { id: 'armies', centreY: 500 }])] };
    expect(drop(100, 780, two)).toMatchObject({ align: 'bottom', before: 'quests' });
    expect(drop(100, 600, two)).toMatchObject({ align: 'bottom', before: 'armies' });
    expect(drop(100, 410, two)).toMatchObject({ align: 'bottom', before: null });
  });
});

describe('applyDrop', () => {
  it('moves a panel to the end of another group and renumbers both groups', () => {
    const p = panels({ garrison: { side: 'left', column: 0, align: 'top', order: 1 } });
    const next = applyDrop(p, 'construction', { side: 'right', column: 0, align: 'bottom', before: null });
    expect(next.construction).toMatchObject({ side: 'right', column: 0, align: 'bottom', order: 1 });
    expect(next.armies.order).toBe(0);
    // The group it left: garrison was after it and moves up.
    expect(next.garrison.order).toBe(0);
    // The input is untouched.
    expect(p.construction.side).toBe('left');
  });

  it('inserts before a sibling, hidden panels included in the numbering', () => {
    const p = panels({ garrison: { side: 'left', column: 0, align: 'top', order: 1 }, armies: { side: 'left', column: 0, align: 'top', order: 2 } });
    const next = applyDrop(p, 'quests', { side: 'left', column: 0, align: 'top', before: 'garrison' });
    expect(['construction', 'quests', 'garrison', 'armies'].map((id) => next[id as HudPanelId].order)).toEqual([0, 1, 2, 3]);
  });

  it('keeps open and collapsed', () => {
    const p = panels({ quests: { open: false, collapsed: true } });
    const next = applyDrop(p, 'quests', { side: 'right', column: 0, align: 'top', before: null });
    expect(next.quests).toMatchObject({ open: false, collapsed: true });
  });

  it('compacts the column numbers of a side when a column empties, and keeps a new column', () => {
    const p = panels({ armies: { side: 'left', column: 1, align: 'top', order: 0 } });
    const emptied = applyDrop(p, 'armies', { side: 'right', column: 0, align: 'top', before: null });
    expect(emptied.armies.side).toBe('right');
    expect(emptied.construction.column).toBe(0);
    const grown = applyDrop(panels(), 'quests', { side: 'left', column: 1, align: 'top', before: null });
    expect(grown.quests).toMatchObject({ side: 'left', column: 1 });
    // Moving the only panel of column 0 into a new column 1 leaves one column: 0.
    const solo = panels({ quests: { side: 'right', column: 0, align: 'bottom' } });
    const moved = applyDrop(solo, 'construction', { side: 'left', column: 1, align: 'top', before: null });
    expect(moved.construction.column).toBe(0);
  });
});

describe('railLeft', () => {
  const rail = { width: 40, top: 800 };
  it('stays at the gutter when no column reaches down to the rail', () => {
    expect(railLeft([{ left: 16, right: 256, contentBottom: 300 }], rail)).toBe(DOCK_GUTTER);
    expect(railLeft([], rail)).toBe(DOCK_GUTTER);
  });

  it('moves right of a column that reaches the rail', () => {
    expect(railLeft([{ left: 16, right: 296, contentBottom: 860 }], rail)).toBe(296 + COLUMN_CLEARANCE);
  });

  it('clears a column that ends within the clearance above the rail, not one that ends before it', () => {
    expect(railLeft([{ left: 16, right: 256, contentBottom: 790 }], rail)).toBe(256 + COLUMN_CLEARANCE);
    expect(railLeft([{ left: 16, right: 256, contentBottom: 788 }], rail)).toBe(DOCK_GUTTER);
  });

  it('ignores a column that does not overlap the rail horizontally after an earlier push, and chains pushes', () => {
    const cols = [
      { left: 16, right: 256, contentBottom: 860 },
      { left: 264, right: 504, contentBottom: 860 },
    ];
    expect(railLeft(cols, rail)).toBe(504 + COLUMN_CLEARANCE);
    // The second column starts right of the pushed rail: no overlap.
    expect(railLeft([cols[0], { left: 400, right: 640, contentBottom: 860 }], rail)).toBe(256 + COLUMN_CLEARANCE);
  });
});
