import { describe, expect, it } from 'vitest';
import { clampOffset, shouldOpenOnRelease, splitDrawerDragDelta } from './drawerDrag';

describe('clampOffset', () => {
  it('clamps to [0, height]', () => {
    expect(clampOffset(-40, 200)).toBe(0);
    expect(clampOffset(0, 200)).toBe(0);
    expect(clampOffset(120, 200)).toBe(120);
    expect(clampOffset(500, 200)).toBe(200);
  });

  it('returns 0 for a non-positive height', () => {
    expect(clampOffset(50, 0)).toBe(0);
    expect(clampOffset(50, -10)).toBe(0);
  });
});

describe('shouldOpenOnRelease', () => {
  const height = 200;
  const ratio = 0.3;
  const flick = 0.5;

  it('opens once the drag passes the distance threshold', () => {
    expect(shouldOpenOnRelease(59, height, 0, ratio, flick)).toBe(false);
    expect(shouldOpenOnRelease(60, height, 0, ratio, flick)).toBe(true);
    expect(shouldOpenOnRelease(200, height, 0, ratio, flick)).toBe(true);
  });

  it('stays closed short of the threshold with no flick', () => {
    expect(shouldOpenOnRelease(10, height, 0, ratio, flick)).toBe(false);
  });

  it('a fast opening flick opens even far short of the distance threshold', () => {
    expect(shouldOpenOnRelease(5, height, 0.8, ratio, flick)).toBe(true);
  });

  it('a fast closing flick closes even past the distance threshold', () => {
    expect(shouldOpenOnRelease(190, height, -0.8, ratio, flick)).toBe(false);
  });

  it('is always closed for a zero-height drawer', () => {
    expect(shouldOpenOnRelease(0, 0, 2, ratio, flick)).toBe(false);
  });
});

describe('splitDrawerDragDelta', () => {
  // Top-docked bar: `rawDelta` needs no sign flip (opening direction is
  // already "finger moves down, positive"), so these numbers match natural
  // screen-space scrolling directly — finger up (negative) scrolls the
  // content down (scrollTop rising) towards its end, finger down (positive)
  // scrolls it back up towards its start.
  describe('top-docked bar', () => {
    it('passes the whole delta through to the drag when content does not overflow', () => {
      // scrollHeight === clientHeight: nothing to scroll either way.
      expect(splitDrawerDragDelta(-20, 0, 300, 300, 'top')).toEqual({ scrollDelta: 0, dragDelta: -20 });
      expect(splitDrawerDragDelta(20, 0, 300, 300, 'top')).toEqual({ scrollDelta: 0, dragDelta: 20 });
    });

    it('a zero delta is a no-op', () => {
      expect(splitDrawerDragDelta(0, 40, 500, 300, 'top')).toEqual({ scrollDelta: 0, dragDelta: 0 });
    });

    it('finger-up (closing direction) scrolls toward the end (scrollTop rising), with headroom to spare', () => {
      // scrollHeight 500, clientHeight 300 => maxScrollTop 200; currently at 40.
      const result = splitDrawerDragDelta(-30, 40, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: 30, dragDelta: 0 });
    });

    it('finger-up at the scrolled-to-end edge passes straight through to the (closing) drag', () => {
      // Already at maxScrollTop (200) — no more room to scroll toward the end.
      const result = splitDrawerDragDelta(-30, 200, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: 0, dragDelta: -30 });
    });

    it('finger-up larger than the remaining scroll room splits across both', () => {
      // maxScrollTop 200, currently at 180 — only 20px of scroll room left.
      const result = splitDrawerDragDelta(-30, 180, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: 20, dragDelta: -10 });
    });

    it('finger-down (opening direction) scrolls toward the start (scrollTop falling), with headroom to spare', () => {
      const result = splitDrawerDragDelta(30, 40, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: -30, dragDelta: 0 });
    });

    it('finger-down at scrollTop 0 passes straight through (harmless once fully open)', () => {
      const result = splitDrawerDragDelta(30, 0, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: 0, dragDelta: 30 });
    });

    it('finger-down larger than the remaining scroll-up room splits across both', () => {
      // Only 10px of room to scroll toward the start (scrollTop already near 0).
      const result = splitDrawerDragDelta(30, 10, 500, 300, 'top');
      expect(result).toEqual({ scrollDelta: -10, dragDelta: 20 });
    });
  });

  // Bottom-docked bar: opening is dragging UP, so the sign flip inverts
  // which raw finger direction maps to "closing" vs "opening" in
  // useHudDrawer's own convention — but the *scroll* direction a given raw
  // finger delta produces is unchanged (natural scrolling never cares which
  // edge a bar docks to): finger down always scrolls toward the content's
  // start, finger up always scrolls toward its end. What differs from the
  // top-docked cases above is only which of those is "closing" — for a
  // bottom bar, finger DOWN closes (mirroring finger UP closing a top bar).
  describe('bottom-docked bar', () => {
    it('passes the whole delta through to the drag (sign-flipped) when content does not overflow', () => {
      expect(splitDrawerDragDelta(-20, 0, 300, 300, 'bottom')).toEqual({ scrollDelta: 0, dragDelta: 20 });
      expect(splitDrawerDragDelta(20, 0, 300, 300, 'bottom')).toEqual({ scrollDelta: 0, dragDelta: -20 });
    });

    it('finger-down (closing direction) scrolls toward the start (scrollTop falling), with headroom to spare', () => {
      const result = splitDrawerDragDelta(30, 50, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: -30, dragDelta: 0 });
    });

    it('finger-down at scrollTop 0 closes immediately — nothing left to scroll toward the start', () => {
      const result = splitDrawerDragDelta(30, 0, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: 0, dragDelta: -30 });
    });

    it('finger-down larger than the remaining scroll-to-start room splits across both', () => {
      // Only 20px of room left to fall to scrollTop 0.
      const result = splitDrawerDragDelta(30, 20, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: -20, dragDelta: -10 });
    });

    it('finger-up (opening direction) scrolls toward the end (scrollTop rising), with headroom to spare, and never closes', () => {
      const result = splitDrawerDragDelta(-30, 150, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: 30, dragDelta: 0 });
    });

    it('finger-up at the scrolled-to-end edge passes straight through to the (opening, harmless) drag', () => {
      // Already at maxScrollTop (200) — no more room to scroll toward the end.
      const result = splitDrawerDragDelta(-30, 200, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: 0, dragDelta: 30 });
    });

    it('finger-up larger than the remaining scroll-to-end room splits across both, and still never closes', () => {
      // maxScrollTop 200, currently at 180 — only 20px of scroll room left.
      const result = splitDrawerDragDelta(-30, 180, 500, 300, 'bottom');
      expect(result).toEqual({ scrollDelta: 20, dragDelta: 10 });
    });
  });
});
