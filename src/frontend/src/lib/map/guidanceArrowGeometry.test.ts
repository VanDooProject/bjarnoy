import { describe, expect, it } from 'vitest';
import {
  ARROW_TIP_GAP_PX,
  HEX_TARGET_RADIUS_PX,
  RING_BUBBLE_TARGET_RADIUS_PX,
  arrowTipOffset,
  arrowTipPoint,
  ARROW_BOB_PX,
  ringBubbleAim,
  rotatedTipVector,
  tipStandoffFor,
} from './guidanceArrowGeometry';
import { BUB1, BUB2, HUB, layoutRing } from './ringLayout';

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

// The pointer at a ring bubble must single that bubble out: the tip inside its circle, the arrow arriving from outside
// the ring, and never inside a neighbour. Real ring layouts for the two screens the onboarding is checked on.
describe('ringBubbleAim on real ring layouts', () => {
  interface Screen {
    name: string;
    hub: { x: number; y: number };
    area: { left: number; top: number; right: number; bottom: number };
    card: { left: number; top: number; right: number; bottom: number };
  }
  const SCREENS: Screen[] = [
    // 390x844 phone, card docked to the bottom strip (ringDock.ts): the ring keeps clear of it.
    { name: '390x844', hub: { x: 140, y: 405 }, area: { left: 16, top: 12, right: 374, bottom: 844 - 236 - 8 }, card: { left: 16, top: 12, right: 374, bottom: 828 } },
    { name: '1280x800', hub: { x: 555, y: 375 }, area: { left: 16, top: 76, right: 1264, bottom: 784 }, card: { left: 16, top: 76, right: 1264, bottom: 784 } },
  ];
  // Grass hex: root (just Build), categories (5 + back), and the Resource category's 4 buildings.
  const STEPS = [
    { name: 'Build hub', lane1: 1, lane2: 0, target: { lane: 1 as const, index: 0 } },
    { name: 'a category', lane1: 6, lane2: 0, target: { lane: 1 as const, index: 0 } },
    { name: 'a building', lane1: 6, lane2: 4, target: { lane: 2 as const, index: 0 } },
    { name: 'a later building', lane1: 6, lane2: 4, target: { lane: 2 as const, index: 3 } },
  ];

  const inside = (p: { x: number; y: number }, c: { x: number; y: number; r: number }) => Math.hypot(p.x - c.x, p.y - c.y) < c.r;

  for (const screen of SCREENS) {
    for (const step of STEPS) {
      it(`${screen.name}: the tip lands inside ${step.name} and inside no other bubble`, () => {
        const layout = layoutRing({
          x: screen.hub.x,
          y: screen.hub.y,
          area: screen.area,
          cardArea: screen.card,
          lane1Count: step.lane1,
          lane2Count: step.lane2,
          parentIndex: step.lane2 > 0 ? 0 : -1,
          cardAnchor: null,
        });
        const r1 = (layout.collapsed ? 7 : BUB1 / 2);
        const circles = [
          { id: 'hub', x: screen.hub.x, y: screen.hub.y, r: HUB / 2 },
          ...layout.lane1.map((spot, i) => ({ id: `l1-${i}`, ...spot, r: r1 })),
          ...layout.lane2.slice(0, step.lane2).map((spot, i) => ({ id: `l2-${i}`, ...spot, r: BUB2 / 2 })),
        ];
        const targetId = `l${step.target.lane}-${step.target.index}`;
        const target = circles.find((c) => c.id === targetId)!;
        // A lone Build bubble can sit on the hub itself (a cramped phone ring): then there is no separate hub to hit.
        if (Math.hypot(target.x - screen.hub.x, target.y - screen.hub.y) < 1) circles.shift();
        const aim = ringBubbleAim(screen.hub, target);
        const tip = arrowTipPoint(target, aim.angle, aim.targetRadius);
        expect(inside(tip, target), 'tip inside the target bubble').toBe(true);
        // ...and still inside at the top of the arrow's bob, when it has slid back along the shaft.
        const rad = (aim.angle * Math.PI) / 180;
        const bobbed = { x: tip.x + Math.sin(rad) * ARROW_BOB_PX, y: tip.y - Math.cos(rad) * ARROW_BOB_PX };
        expect(inside(bobbed, target), 'tip inside the target bubble at the top of the bob').toBe(true);
        for (const other of circles.filter((c) => c.id !== targetId)) {
          expect(inside(tip, other), `tip not inside ${other.id}`).toBe(false);
        }
        // The arrow's tail runs away from the ring's hub: the hub side of the target stays clear.
        const tail = { x: target.x + Math.sin((aim.angle * Math.PI) / 180) * 40, y: target.y - Math.cos((aim.angle * Math.PI) / 180) * 40 };
        for (const other of circles.filter((c) => c.id !== targetId)) {
          expect(inside(tail, other), `arrow body not over ${other.id}`).toBe(false);
        }
      });
    }
  }
});
