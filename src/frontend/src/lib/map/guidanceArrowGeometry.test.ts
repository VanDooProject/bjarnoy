import { describe, expect, it } from 'vitest';
import {
  ARROW_TIP_GAP_PX,
  HEX_TARGET_RADIUS_PX,
  RING_BUBBLE_TARGET_RADIUS_PX,
  arrowTipOffset,
  arrowTipPoint,
  ARROW_BOB_PX,
  RING_TIP_GAP_PX,
  arrowPieces,
  bubbleLabelRect,
  convexPolygonsOverlap,
  polygonCirclePenetration,
  ringBubbleAim,
  rotatedTipVector,
  tipStandoffFor,
} from './guidanceArrowGeometry';
import { BUB1, BUB2, HUB, layoutRing, type Rect } from './ringLayout';

/**
 * landing-page-defects.md L2: without `arrowTipOffset`, the arrow's tip lands
 * rotated out to one side of its target instead of on it. The contract this
 * asserts is exactly the one the doc names: for a given anchor point,
 * `anchor + arrowTipOffset(angle) + rotatedTipVector(angle)` — the tip's
 * final screen position once both the fix and the rotation are applied —
 * must land the intended standoff away from the anchor, for every angle the
 * app actually uses.
 */
describe('arrowTipOffset', () => {
  const anglesInUse = [30, 38, 52];

  /** Where the tip actually ends up relative to the anchor, given the applied offset. */
  const tipRelativeToAnchor = (angle: number, targetRadius: number) => {
    const offset = arrowTipOffset(angle, targetRadius);
    const tip = rotatedTipVector(angle);
    return { x: offset.x + tip.x, y: offset.y + tip.y };
  };

  const tipDistanceFromAnchor = (angle: number, targetRadius: number) => {
    const { x, y } = tipRelativeToAnchor(angle, targetRadius);
    return Math.hypot(x, y);
  };

  /**
   * How far the tip sits along the direction the arrow points, measured from
   * the anchor. Negative means it stops short of the target (correct);
   * positive means it overshot and is indicating a spot *past* the thing it
   * is supposed to single out.
   *
   * This is the regression that hid behind the original flat 9px standoff:
   * the offset was subtracted rather than added, so the tip always landed on
   * the far side of its target. Too small to see against a hex, obvious once
   * the standoff grew to clear a ring bubble.
   */
  const tipOvershoot = (angle: number, targetRadius: number) => {
    const rad = (angle * Math.PI) / 180;
    const pointing = { x: -Math.sin(rad), y: Math.cos(rad) };
    const { x, y } = tipRelativeToAnchor(angle, targetRadius);
    return x * pointing.x + y * pointing.y;
  };

  it.each(anglesInUse)('lands the tip a hex gap from the anchor at %d°', (angle) => {
    expect(tipDistanceFromAnchor(angle, HEX_TARGET_RADIUS_PX)).toBeCloseTo(ARROW_TIP_GAP_PX, 5);
  });

  /**
   * The ring-menu regression. A bubble is `ringLayout.BUB1` (52px) across, so
   * stopping the tip a flat `ARROW_TIP_GAP_PX` from its *centre* buried the
   * arrowhead 17px inside the bubble and the shaft covered it completely —
   * the arrow hid the very label it was singling out. Asserted as "outside
   * the bubble's edge" rather than against a magic number, so the intent
   * survives a change to either constant.
   */
  it.each(anglesInUse)('stops the tip clear of a ring bubble at %d°', (angle) => {
    const distance = tipDistanceFromAnchor(angle, RING_BUBBLE_TARGET_RADIUS_PX);
    expect(distance).toBeGreaterThan(RING_BUBBLE_TARGET_RADIUS_PX);
    expect(distance).toBeCloseTo(RING_BUBBLE_TARGET_RADIUS_PX + ARROW_TIP_GAP_PX, 5);
  });

  it.each([
    ['hex', HEX_TARGET_RADIUS_PX],
    ['ring bubble', RING_BUBBLE_TARGET_RADIUS_PX],
  ] as const)('stops the tip short of the %s rather than past it', (_name, targetRadius) => {
    for (const angle of anglesInUse) {
      // Strictly negative: the tip is on the side the arrow approaches from.
      expect(tipOvershoot(angle, targetRadius)).toBeLessThan(0);
      expect(tipOvershoot(angle, targetRadius)).toBeCloseTo(-tipStandoffFor(targetRadius), 5);
    }
  });

  it('clears a bigger target by more than a smaller one', () => {
    expect(tipDistanceFromAnchor(30, RING_BUBBLE_TARGET_RADIUS_PX)).toBeGreaterThan(
      tipDistanceFromAnchor(30, HEX_TARGET_RADIUS_PX),
    );
  });

  it('defaults to the hex (point) target when no radius is given', () => {
    expect(arrowTipOffset(38)).toEqual(arrowTipOffset(38, HEX_TARGET_RADIUS_PX));
  });

  it('produces a non-zero shift (the tip actually moves, not a no-op)', () => {
    const offset = arrowTipOffset(38);
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(20);
  });

  it.each([HEX_TARGET_RADIUS_PX, RING_BUBBLE_TARGET_RADIUS_PX])(
    'always shifts by the same magnitude regardless of angle at radius %d (moves along the shaft, not sideways)',
    (targetRadius) => {
      const magnitudes = anglesInUse.map((angle) => {
        const { x, y } = arrowTipOffset(angle, targetRadius);
        return Math.hypot(x, y);
      });
      for (const m of magnitudes) {
        expect(m).toBeCloseTo(magnitudes[0], 5);
      }
    },
  );
});

describe('tipStandoffFor', () => {
  it('is the target radius plus the gap', () => {
    expect(tipStandoffFor(0)).toBe(ARROW_TIP_GAP_PX);
    expect(tipStandoffFor(RING_BUBBLE_TARGET_RADIUS_PX)).toBe(
      RING_BUBBLE_TARGET_RADIUS_PX + ARROW_TIP_GAP_PX,
    );
  });
});

// The pointer at a ring bubble must single that bubble out: the tip just outside its rim (never over its label), the
// whole arrow on screen through its bob, and nothing of it over another bubble. Real ring layouts, three screens.
describe('ringBubbleAim on real ring layouts', () => {
  interface Screen {
    name: string;
    hub: { x: number; y: number };
    area: Rect;
  }
  const SCREENS: Screen[] = [
    // Phones, card docked to the bottom strip (ringDock.ts): the ring keeps clear of it.
    { name: '320x568', hub: { x: 105, y: 267 }, area: { left: 16, top: 12, right: 304, bottom: 568 - 236 - 8 } },
    { name: '390x844', hub: { x: 140, y: 405 }, area: { left: 16, top: 12, right: 374, bottom: 844 - 236 - 8 } },
    { name: '1280x800', hub: { x: 555, y: 375 }, area: { left: 16, top: 76, right: 1264, bottom: 784 } },
  ];
  // Grass hex: root (just Build), categories (5 + back), and the Resource category's 4 buildings.
  const STEPS = [
    { name: 'Build hub', lane1: 1, lane2: 0, target: { lane: 1 as const, index: 0 } },
    { name: 'a category', lane1: 6, lane2: 0, target: { lane: 1 as const, index: 0 } },
    { name: 'a building', lane1: 6, lane2: 4, target: { lane: 2 as const, index: 0 } },
    { name: 'a later building', lane1: 6, lane2: 4, target: { lane: 2 as const, index: 3 } },
  ];

  for (const screen of SCREENS) {
    for (const step of STEPS) {
      it(`${screen.name}: the arrow points at the edge of ${step.name} and clears everything else`, () => {
        const layout = layoutRing({
          x: screen.hub.x,
          y: screen.hub.y,
          area: screen.area,
          cardArea: screen.area,
          lane1Count: step.lane1,
          lane2Count: step.lane2,
          parentIndex: step.lane2 > 0 ? 0 : -1,
          cardAnchor: null,
        });
        const r1 = BUB1 / 2;
        const circles = [
          { id: 'hub', x: screen.hub.x, y: screen.hub.y, r: HUB / 2 },
          ...layout.lane1.map((spot, i) => ({ id: `l1-${i}`, x: spot.x, y: spot.y, r: r1 })),
          ...layout.lane2.slice(0, step.lane2).map((spot, i) => ({ id: `l2-${i}`, x: spot.x, y: spot.y, r: BUB2 / 2 })),
        ];
        const targetId = `l${step.target.lane}-${step.target.index}`;
        const target = circles.find((c) => c.id === targetId)!;
        const others = circles.filter((c) => c !== target);
        const aim = ringBubbleAim(screen.hub, target, others, screen.area);
        // A lone Build bubble can sit on the hub itself (a cramped phone ring): the two are one thing to point at.
        const stacked = others.filter((c) => Math.hypot(target.x - c.x, target.y - c.y) < 1);
        const clear = others.filter((c) => !stacked.includes(c));
        const rim = { ...target, r: aim.targetRadius };
        const tip = arrowTipPoint(target, aim.angle, aim.targetRadius, aim.gap, aim.scale);
        const rad = (aim.angle * Math.PI) / 180;
        const tail = { x: Math.sin(rad), y: -Math.cos(rad) };

        // Tip: just outside the rim at the bob's nearest point, never inside it at the farthest.
        const near = Math.hypot(tip.x - target.x, tip.y - target.y);
        expect(near).toBeGreaterThanOrEqual(rim.r);
        expect(near).toBeLessThanOrEqual(rim.r + RING_TIP_GAP_PX + 0.001);
        const far = { x: tip.x + tail.x * ARROW_BOB_PX * aim.scale, y: tip.y + tail.y * ARROW_BOB_PX * aim.scale };
        expect(Math.hypot(far.x - target.x, far.y - target.y)).toBeGreaterThanOrEqual(rim.r - 1);

        for (const back of [0, ARROW_BOB_PX / 2, ARROW_BOB_PX]) {
          const pieces = arrowPieces({ x: tip.x + tail.x * back * aim.scale, y: tip.y + tail.y * back * aim.scale }, tail, aim.scale);
          for (const poly of pieces) {
            for (const v of poly) {
              expect(v.x, 'arrow inside the area (left)').toBeGreaterThanOrEqual(screen.area.left - 0.001);
              expect(v.x, 'arrow inside the area (right)').toBeLessThanOrEqual(screen.area.right + 0.001);
              expect(v.y, 'arrow inside the area (top)').toBeGreaterThanOrEqual(screen.area.top - 0.001);
              expect(v.y, 'arrow inside the area (bottom)').toBeLessThanOrEqual(screen.area.bottom + 0.001);
            }
            for (const other of clear) {
              expect(polygonCirclePenetration(poly, other), `arrow clear of ${other.id}`).toBe(0);
            }
            expect(polygonCirclePenetration(poly, rim), 'arrow clear of the target bubble').toBe(0);
            expect(convexPolygonsOverlap(poly, bubbleLabelRect(target)), 'arrow clear of the target label').toBe(false);
          }
        }
      });
    }
  }

  it('approaches radially, away from the hub, when there is room', () => {
    const aim = ringBubbleAim({ x: 500, y: 400 }, { x: 600, y: 400, r: 26 }, [], { left: 0, top: 0, right: 1000, bottom: 800 });
    // Target due east of the hub: the tail points east (sin 90deg), the tip west.
    expect(aim.angle).toBeCloseTo(90, 5);
    expect(aim.targetRadius).toBe(26);
    expect(aim.gap).toBe(RING_TIP_GAP_PX);
  });

  it('swings round the bubble, nearest angle first, when the radial approach would leave the screen', () => {
    const bounds = { left: 0, top: 0, right: 400, bottom: 800 };
    const swung = ringBubbleAim({ x: 300, y: 400 }, { x: 340, y: 400, r: 26 }, [], bounds);
    const free = ringBubbleAim({ x: 100, y: 400 }, { x: 140, y: 400, r: 26 }, [], bounds);
    expect(free.angle).toBeCloseTo(90, 5);
    // Tail east would run off the right edge: the aim turns, and the whole arrow then fits.
    expect(swung.angle).not.toBeCloseTo(90, 0);
    expect(Math.abs(swung.angle - 90)).toBeLessThan(100);
    const rad = (swung.angle * Math.PI) / 180;
    const tail = { x: Math.sin(rad), y: -Math.cos(rad) };
    const tip = { x: 340 + tail.x * 30, y: 400 + tail.y * 30 };
    for (const poly of arrowPieces(tip, tail)) {
      for (const v of poly) expect(v.x).toBeLessThanOrEqual(400.001);
    }
  });
});
