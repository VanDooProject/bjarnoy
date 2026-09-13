import { describe, expect, it } from 'vitest';
import {
  ARROW_TIP_GAP_PX,
  HEX_TARGET_RADIUS_PX,
  RING_BUBBLE_TARGET_RADIUS_PX,
  arrowTipOffset,
  rotatedTipVector,
  tipStandoffFor,
} from './guidanceArrowGeometry';

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
