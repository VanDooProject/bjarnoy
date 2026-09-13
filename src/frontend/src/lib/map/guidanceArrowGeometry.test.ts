import { describe, expect, it } from 'vitest';
import { ARROW_TIP_STANDOFF_PX, arrowTipOffset, rotatedTipVector } from './guidanceArrowGeometry';

/**
 * landing-page-defects.md L2: without `arrowTipOffset`, the arrow's tip lands
 * rotated out to one side of its target instead of on it. The contract this
 * asserts is exactly the one the doc names: for a given anchor point,
 * `anchor + arrowTipOffset(angle) + rotatedTipVector(angle)` — the tip's
 * final screen position once both the fix and the rotation are applied —
 * must land within `ARROW_TIP_STANDOFF_PX` of the anchor (the deliberate
 * standoff, not floating-point slop), for every angle the app actually uses.
 */
describe('arrowTipOffset', () => {
  const anglesInUse = [30, 38, 52];

  it.each(anglesInUse)('lands the tip within the standoff of the anchor at %d°', (angle) => {
    const offset = arrowTipOffset(angle);
    const tip = rotatedTipVector(angle);
    const finalX = offset.x + tip.x;
    const finalY = offset.y + tip.y;
    const distanceFromAnchor = Math.hypot(finalX, finalY);
    expect(distanceFromAnchor).toBeLessThanOrEqual(ARROW_TIP_STANDOFF_PX + 0.01);
  });

  it('produces a non-zero shift (the tip actually moves, not a no-op)', () => {
    const offset = arrowTipOffset(38);
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(20);
  });

  it('always shifts by the same magnitude regardless of angle (moves along the shaft, not sideways)', () => {
    const magnitudes = anglesInUse.map((angle) => {
      const { x, y } = arrowTipOffset(angle);
      return Math.hypot(x, y);
    });
    for (const m of magnitudes) {
      expect(m).toBeCloseTo(magnitudes[0], 5);
    }
  });
});
