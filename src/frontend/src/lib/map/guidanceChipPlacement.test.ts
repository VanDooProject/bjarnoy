import { describe, expect, it } from 'vitest';
import { placeChip, type Box } from './guidanceChipPlacement';

const CHIP = { width: 100, height: 30 };

// A generous safe area, roomy on every side of the arrow — used whenever a
// test only cares about the "does the preferred side fit" branch.
const ROOMY_SAFE: Box = { left: 0, top: 0, right: 1000, bottom: 1000 };

describe('placeChip', () => {
  it('prefers "above" and uses it when it fits', () => {
    const arrow: Box = { left: 400, top: 400, right: 460, bottom: 460 };
    const result = placeChip(arrow, CHIP, ROOMY_SAFE, 'above', 4);
    expect(result.side).toBe('above');
    expect(result.y).toBe(400 - 4 - CHIP.height);
    expect(result.x).toBe((400 + 460) / 2 - CHIP.width / 2);
  });

  it('falls back off the top edge to left or right when "above" would overflow', () => {
    // Arrow near the top of the safe area: "above" has nowhere to go.
    const safe: Box = { left: 0, top: 0, right: 1000, bottom: 1000 };
    const arrow: Box = { left: 400, top: 10, right: 460, bottom: 70 };
    const result = placeChip(arrow, CHIP, safe, 'above', 4);
    expect(['left', 'right']).toContain(result.side);
    // Whichever side won, it must fit entirely inside safe.
    expect(result.x).toBeGreaterThanOrEqual(safe.left);
    expect(result.x + CHIP.width).toBeLessThanOrEqual(safe.right);
    expect(result.y).toBeGreaterThanOrEqual(safe.top);
    expect(result.y + CHIP.height).toBeLessThanOrEqual(safe.bottom);
  });

  it('shifts/clamps the chip inside the safe area near the right edge', () => {
    // Arrow hugging the right edge of a narrow safe area (like a 320px phone
    // viewport) — "right" placement would run off, so it must end up
    // clamped fully inside `safe` regardless of which side is chosen.
    const safe: Box = { left: 8, top: 8, right: 312, bottom: 560 };
    const arrow: Box = { left: 280, top: 300, right: 300, bottom: 320 };
    const result = placeChip(arrow, CHIP, safe, 'right', 4);
    expect(result.x).toBeGreaterThanOrEqual(safe.left);
    expect(result.x + CHIP.width).toBeLessThanOrEqual(safe.right);
    expect(result.y).toBeGreaterThanOrEqual(safe.top);
    expect(result.y + CHIP.height).toBeLessThanOrEqual(safe.bottom);
  });

  it('picks the least-overflowing candidate, clamped inside, when nothing fits', () => {
    // A tiny safe area (smaller than the chip in both dimensions) around an
    // arrow near its centre — every candidate overflows somewhere, so the
    // result must still land fully clamped inside `safe`.
    const safe: Box = { left: 0, top: 0, right: 60, bottom: 20 };
    const arrow: Box = { left: 20, top: 5, right: 40, bottom: 15 };
    const result = placeChip(arrow, CHIP, safe, 'above', 4);
    expect(result.x).toBeGreaterThanOrEqual(safe.left);
    expect(result.y).toBeGreaterThanOrEqual(safe.top);
    // The safe box is narrower/shorter than the chip, so the clamp-to-fit
    // branch can't apply; the chip is aligned to the safe box's near edge.
    expect(result.x).toBe(safe.left);
    expect(result.y).toBe(safe.top);
  });

  it('aligns to the safe box left edge when the chip is wider than the safe box', () => {
    const wideChip = { width: 2000, height: 30 };
    const safe: Box = { left: 8, top: 8, right: 312, bottom: 560 };
    const arrow: Box = { left: 100, top: 300, right: 120, bottom: 320 };
    const result = placeChip(arrow, wideChip, safe, 'above', 4);
    expect(result.x).toBe(safe.left);
  });

  it('slides a side placement along its free axis instead of dropping to a worse side (844x390 ring step)', () => {
    // Measured: the arrow box starts under the 64px HUD bar, so "left" at the
    // arrow's vertical centre sits 13px too high. It should slide down, not
    // fall through to "below" (onto the ring the arrow points at).
    const placement = placeChip(
      { left: 432, top: 1, right: 582, bottom: 151 },
      { width: 225, height: 34 },
      { left: 8, top: 72, right: 836, bottom: 382 },
      'left',
    );
    expect(placement).toEqual({ x: 432 - 4 - 225, y: 72, side: 'left' });
  });

  it('keeps "above" near the right edge by sliding it horizontally', () => {
    const placement = placeChip(
      { left: 150, top: 160, right: 300, bottom: 310 },
      { width: 176, height: 26 },
      { left: 8, top: 72, right: 312, bottom: 560 },
      'above',
    );
    expect(placement).toEqual({ x: 312 - 176, y: 160 - 4 - 26, side: 'above' });
  });
});
