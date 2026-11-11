import { describe, expect, it } from 'vitest';
import {
  COLUMN_BUTTON_SIZE,
  DEFAULT_HUD_PANELS,
  DOCK_BOTTOM_LEFT,
  cornerStyle,
  isDockCorner,
  nearestCorner,
  panelsInCorner,
  type HudPanelId,
  type HudPanelPref,
} from './hudPanelDock';

const area = { left: 100, top: 50, width: 1000, height: 600 };

describe('nearestCorner', () => {
  it('picks the quadrant of the area that holds the centre', () => {
    expect(nearestCorner({ x: 200, y: 100 }, area)).toBe('top-left');
    expect(nearestCorner({ x: 1000, y: 100 }, area)).toBe('top-right');
    expect(nearestCorner({ x: 200, y: 600 }, area)).toBe('bottom-left');
    expect(nearestCorner({ x: 1000, y: 600 }, area)).toBe('bottom-right');
  });

  it('measures against the area\'s own centre, not the viewport\'s', () => {
    // The area's centre is (600, 350): x 590 is left of it although it is right of the area's left edge by a lot.
    expect(nearestCorner({ x: 590, y: 340 }, area)).toBe('top-left');
    expect(nearestCorner({ x: 610, y: 360 }, area)).toBe('bottom-right');
  });

  it('puts a centre exactly on a midline into the right / bottom half', () => {
    expect(nearestCorner({ x: 600, y: 350 }, area)).toBe('bottom-right');
  });
});

describe('cornerStyle', () => {
  it('puts the top corners under the header bar and the bottom corners on the bottom gutter', () => {
    expect(cornerStyle('top-left')).toMatchObject({ left: '16px', top: '76px' });
    expect(cornerStyle('top-right')).toMatchObject({ right: '16px', top: '76px' });
    expect(cornerStyle('bottom-right')).toMatchObject({ right: '16px', bottom: 'calc(16px + var(--hud-inset-bottom, 0px))' });
  });

  it('keeps the bottom-left corner clear of the icon column', () => {
    expect(DOCK_BOTTOM_LEFT).toBe(16 + COLUMN_BUTTON_SIZE + 12);
    expect(cornerStyle('bottom-left')).toMatchObject({ left: '68px' });
  });

  it('stops every corner before the vertical midline', () => {
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      expect(cornerStyle(corner).maxHeight).toMatch(/^calc\(50% - /);
    }
  });
});

describe('panelsInCorner', () => {
  const panels = (patch: Partial<Record<HudPanelId, HudPanelPref>> = {}) => ({ ...DEFAULT_HUD_PANELS, ...patch });

  it('lists the default layout: one panel per corner', () => {
    expect(panelsInCorner(panels(), 'top-left')).toEqual(['construction']);
    expect(panelsInCorner(panels(), 'top-right')).toEqual(['garrison']);
    expect(panelsInCorner(panels(), 'bottom-right')).toEqual(['armies']);
    expect(panelsInCorner(panels(), 'bottom-left')).toEqual(['quests']);
  });

  it('stacks several panels of one corner in the fixed order, whatever order they moved there', () => {
    const moved = panels({
      quests: { open: true, corner: 'top-right' },
      armies: { open: true, corner: 'top-right' },
    });
    expect(panelsInCorner(moved, 'top-right')).toEqual(['garrison', 'armies', 'quests']);
    expect(panelsInCorner(moved, 'bottom-left')).toEqual([]);
  });

  it('leaves out panels the filter rejects (collapsed or empty)', () => {
    expect(panelsInCorner(panels(), 'top-right', (id) => id !== 'garrison')).toEqual([]);
  });
});

describe('isDockCorner', () => {
  it('accepts the four corners only', () => {
    expect(isDockCorner('top-left')).toBe(true);
    expect(isDockCorner('center')).toBe(false);
    expect(isDockCorner(3)).toBe(false);
  });
});
