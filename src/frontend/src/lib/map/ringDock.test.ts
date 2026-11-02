import { describe, expect, it } from 'vitest';
import { boundsClearOfDock, DOCK_BOTTOM_H, DOCK_GAP, DOCK_SIDE_W, ringDockFor, tapArm } from './ringDock';

describe('ringDockFor', () => {
  it('keeps the floating card on the desktop layout', () => {
    expect(ringDockFor({ compact: false, width: 1440, height: 900, x: 700 })).toBeNull();
  });

  it('docks along the bottom in portrait', () => {
    expect(ringDockFor({ compact: true, width: 390, height: 844, x: 100 })).toBe('bottom');
    expect(ringDockFor({ compact: true, width: 390, height: 844, x: 350 })).toBe('bottom');
  });

  it('docks on the side away from the tapped hex in landscape', () => {
    expect(ringDockFor({ compact: true, width: 844, height: 390, x: 200 })).toBe('right');
    expect(ringDockFor({ compact: true, width: 844, height: 390, x: 650 })).toBe('left');
  });

  it('counts the left HUD rail against the left side’s room', () => {
    // Without the inset, x = 430 leaves 430 on the left vs 414 on the right.
    expect(ringDockFor({ compact: true, width: 844, height: 390, x: 430 })).toBe('left');
    expect(ringDockFor({ compact: true, width: 844, height: 390, x: 430, insetLeft: 80 })).toBe('right');
  });
});

describe('boundsClearOfDock', () => {
  const bounds = { left: 64, top: 76, right: 828, bottom: 374 };

  it('leaves the bounds alone without a dock', () => {
    expect(boundsClearOfDock(bounds, null, { width: 844, height: 390 })).toBe(bounds);
  });

  it('keeps the ring above the bottom strip', () => {
    const tall = { left: 64, top: 76, right: 374, bottom: 828 };
    expect(boundsClearOfDock(tall, 'bottom', { width: 390, height: 844, insetBottom: 0 }).bottom).toBe(844 - DOCK_BOTTOM_H - DOCK_GAP);
  });

  it('keeps the ring beside the side panel', () => {
    expect(boundsClearOfDock(bounds, 'right', { width: 844, height: 390 }).right).toBe(844 - DOCK_SIDE_W - 2 * DOCK_GAP);
    expect(boundsClearOfDock(bounds, 'left', { width: 844, height: 390, insetLeft: 60 }).left).toBe(60 + DOCK_SIDE_W + 2 * DOCK_GAP);
  });

  it('falls back to the original bounds when too little would be left', () => {
    const small = { left: 64, top: 76, right: 420, bottom: 374 };
    expect(boundsClearOfDock(small, 'right', { width: 440, height: 390 })).toBe(small);
  });
});

describe('tapArm', () => {
  it('arms on the first tap without committing', () => {
    expect(tapArm(null, 'farm')).toEqual({ armed: 'farm', commit: false });
  });

  it('commits on a second tap on the same bubble', () => {
    expect(tapArm('farm', 'farm')).toEqual({ armed: 'farm', commit: true });
  });

  it('moves the arm to another bubble without committing either', () => {
    expect(tapArm('farm', 'hut')).toEqual({ armed: 'hut', commit: false });
  });
});
