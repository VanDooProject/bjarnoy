import { describe, expect, it } from 'vitest';
import { FogCoverage, type FogOverviewPixels } from './fogCoverage';
import { maskBounds, toTexel, type MaskBounds } from './fogMaskLayout';

const BOUNDS: MaskBounds = maskBounds(-10, -20, 11, 21);

/** A mask where every texel is fully unknown (R 255) except the given hexes, which get the given R. */
function maskWith(hexes: Array<{ q: number; r: number; R: number }>, bounds: MaskBounds = BOUNDS): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(bounds.width * bounds.height * 4).fill(255);
  for (const { q, r, R } of hexes) {
    const { u, v } = toTexel({ q, r });
    pixels[((v - bounds.minV) * bounds.width + (u - bounds.minU)) * 4] = R;
  }
  return pixels;
}

/** Every hex whose texel lies inside the bounds, as `{q, r}`. */
function allHexes(bounds: MaskBounds): Array<{ q: number; r: number }> {
  const out: Array<{ q: number; r: number }> = [];
  for (let q = bounds.minU; q < bounds.maxU; q++) {
    for (let r = -60; r <= 60; r++) {
      const { v } = toTexel({ q, r });
      if (v >= bounds.minV && v < bounds.maxV) out.push({ q, r });
    }
  }
  return out;
}

describe('FogCoverage', () => {
  it('reads explored only where the hex texel is inside the mask and R is 0', () => {
    const c = new FogCoverage(BOUNDS, maskWith([{ q: 2, r: 1, R: 0 }, { q: 3, r: 1, R: 1 }]));
    expect(c.isExplored(2, 1)).toBe(true);
    expect(c.isExplored(3, 1)).toBe(false);
    expect(c.isExplored(0, 0)).toBe(false);
    expect(c.isExplored(500, 0)).toBe(false);
  });

  it('treats everything outside the mask as opaque and unexplored', () => {
    const c = new FogCoverage(BOUNDS, maskWith([{ q: 0, r: 0, R: 0 }]));
    expect(c.isOpaque(500, 0)).toBe(true);
    expect(c.isOpaque(-500, 3)).toBe(true);
    expect(c.isExplored(0, 400)).toBe(false);
    expect(c.isOpaque(0, 400)).toBe(true);
    expect(c.rSpans(500)).toEqual([]);
  });

  it('is opaque on saturated ground and clear on a ramp below the opaque byte', () => {
    const c = new FogCoverage(BOUNDS, maskWith([{ q: 0, r: 0, R: 100 }]));
    expect(c.isOpaque(0, 0)).toBe(false);
    expect(c.isOpaque(5, 5)).toBe(true);
    // The opaque threshold itself: R at the byte is opaque, one below is not.
    const edge = Math.ceil(255 * 0.8);
    expect(new FogCoverage(BOUNDS, maskWith([{ q: 0, r: 0, R: edge }])).isOpaque(0, 0)).toBe(true);
    expect(new FogCoverage(BOUNDS, maskWith([{ q: 0, r: 0, R: edge - 1 }])).isOpaque(0, 0)).toBe(false);
  });

  it('dilates the clear set by exactly one hex', () => {
    const c = new FogCoverage(BOUNDS, maskWith([{ q: 0, r: 0, R: 0 }]));
    const neighbours = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    for (const [dq, dr] of neighbours) expect(c.isOpaque(dq, dr), `${dq},${dr}`).toBe(false);
    // Two hexes away is opaque again, and the dilation does not make neighbours explored.
    expect(c.isOpaque(2, 0)).toBe(true);
    expect(c.isOpaque(0, 2)).toBe(true);
    expect(c.isExplored(1, 0)).toBe(false);
  });

  it('keeps the dilation consistent with the odd and even column parity', () => {
    for (const q of [-3, -2, 0, 1, 4, 5]) {
      const c = new FogCoverage(BOUNDS, maskWith([{ q, r: 2, R: 0 }]));
      const clear = allHexes(BOUNDS).filter((h) => !c.isOpaque(h.q, h.r));
      expect(clear.length, `q=${q}`).toBe(7);
    }
  });

  it('does not treat a clear neighbour outside the mask as clear ground', () => {
    // A hex on the mask edge: the missing neighbours read as fully unknown, so nothing outside turns clear.
    const c = new FogCoverage(BOUNDS, maskWith([{ q: BOUNDS.minU, r: 0, R: 0 }]));
    expect(c.isOpaque(BOUNDS.minU - 1, 0)).toBe(true);
  });

  it('lists merged ascending r spans per column, matching isOpaque', () => {
    const c = new FogCoverage(
      BOUNDS,
      maskWith([
        { q: 4, r: 0, R: 0 },
        { q: 4, r: 1, R: 0 },
        { q: 4, r: 5, R: 0 },
      ]),
    );
    // Dilated: r -1..2 and r 4..6 in the column itself.
    expect(c.rSpans(4)).toEqual([-1, 2, 4, 6]);
    for (const h of allHexes(BOUNDS)) {
      const inSpan = (() => {
        const s = c.rSpans(h.q);
        for (let i = 0; i < s.length; i += 2) if (h.r >= s[i] && h.r <= s[i + 1]) return true;
        return false;
      })();
      expect(inSpan, `${h.q},${h.r}`).toBe(!c.isOpaque(h.q, h.r));
    }
  });

  it('answers anyClearIn for a column/row box through the spans', () => {
    const c = new FogCoverage(BOUNDS, maskWith([{ q: 4, r: 0, R: 0 }]));
    // Column 4 offset is 2, so r 0 sits on row 2.
    expect(c.anyClearIn(4, 4, 2, 2)).toBe(true);
    expect(c.anyClearIn(3, 5, 0, 10)).toBe(true);
    expect(c.anyClearIn(4, 4, 10, 20)).toBe(false);
    expect(c.anyClearIn(8, 9, -50, 50)).toBe(false);
    expect(c.anyClearIn(100, 200, -50, 50)).toBe(false);
  });

  it('changes its signature iff the clear set changes', () => {
    const a = new FogCoverage(BOUNDS, maskWith([{ q: 1, r: 1, R: 0 }]));
    const sameClear = new FogCoverage(BOUNDS, maskWith([{ q: 1, r: 1, R: 50 }]));
    const moved = new FogCoverage(BOUNDS, maskWith([{ q: 2, r: 1, R: 0 }]));
    const empty = new FogCoverage(BOUNDS, maskWith([]));
    expect(sameClear.signature).toBe(a.signature);
    expect(moved.signature).not.toBe(a.signature);
    expect(empty.signature).toBe('');
  });

  describe('with an overview past the window', () => {
    // 8 x 8 blocks of 16 x 16 texels over (-64, -64)..(64, 64); the window (-10..11, -20..21) sits inside it.
    const FACTOR = 16;
    const OV_BOUNDS: MaskBounds = maskBounds(-64, -64, 64, 64);

    function overviewWith(blocks: Array<{ col: number; row: number; R: number }>): FogOverviewPixels {
      const width = OV_BOUNDS.width / FACTOR;
      const height = OV_BOUNDS.height / FACTOR;
      const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
      for (const { col, row, R } of blocks) pixels[(row * width + col) * 4] = R;
      return { bounds: OV_BOUNDS, factor: FACTOR, width, height, pixels };
    }

    /** The hex (q, r) whose texel is the given block's first even-parity texel. */
    function hexInBlock(col: number, row: number): { q: number; r: number } {
      const u = OV_BOUNDS.minU + col * FACTOR;
      let v = OV_BOUNDS.minV + row * FACTOR;
      if ((v & 1) !== (u & 1)) v += 1;
      const parity = u & 1;
      return { q: u, r: (v - parity) / 2 - (u - parity) / 2 };
    }

    function spanSet(c: FogCoverage, q: number): boolean[] {
      const out: boolean[] = [];
      const s = c.rSpans(q);
      for (let r = -100; r <= 100; r++) {
        let hit = false;
        for (let i = 0; i < s.length; i += 2) if (r >= s[i] && r <= s[i + 1]) hit = true;
        out.push(hit);
      }
      return out;
    }

    it('answers outside the window from the hex block: opaque far from clear blocks, clear in and next to one', () => {
      const c = new FogCoverage(BOUNDS, maskWith([]), overviewWith([{ col: 6, row: 3, R: 100 }]));
      const inside = hexInBlock(6, 3);
      expect(c.isOpaque(inside.q, inside.r)).toBe(false);
      const beside = hexInBlock(7, 3);
      expect(c.isOpaque(beside.q, beside.r)).toBe(false);
      const diagonal = hexInBlock(5, 2);
      expect(c.isOpaque(diagonal.q, diagonal.r)).toBe(false);
      const far = hexInBlock(1, 6);
      expect(c.isOpaque(far.q, far.r)).toBe(true);
      const twoAway = hexInBlock(4, 3);
      expect(c.isOpaque(twoAway.q, twoAway.r)).toBe(true);
      // Past the overview too.
      expect(c.isOpaque(500, 0)).toBe(true);
    });

    it('is explored from the overview only for a block at R 0', () => {
      const c = new FogCoverage(BOUNDS, maskWith([]), overviewWith([
        { col: 6, row: 3, R: 0 },
        { col: 1, row: 6, R: 1 },
      ]));
      const explored = hexInBlock(6, 3);
      expect(c.isExplored(explored.q, explored.r)).toBe(true);
      const partial = hexInBlock(1, 6);
      expect(c.isExplored(partial.q, partial.r)).toBe(false);
      expect(c.isOpaque(partial.q, partial.r)).toBe(false);
      const unknown = hexInBlock(3, 6);
      expect(c.isExplored(unknown.q, unknown.r)).toBe(false);
    });

    it('keeps the window authoritative inside its bounds', () => {
      // The overview block behind the window is clear, but the window says opaque there.
      const c = new FogCoverage(BOUNDS, maskWith([]), overviewWith([{ col: 4, row: 3, R: 0 }]));
      expect(c.isOpaque(0, 0)).toBe(true);
      expect(c.isExplored(0, 0)).toBe(false);
    });

    it('merges window and overview rows in a window column, taking only out-of-window rows from the overview', () => {
      const c = new FogCoverage(
        BOUNDS,
        maskWith([{ q: 0, r: 0, R: 0 }]),
        overviewWith([{ col: 4, row: 3, R: 0 }, { col: 4, row: 5, R: 0 }]),
      );
      // Column 0 (offset 0): window rows are v -20..20 (r -10..10). Overview rows below it: v -32..-22 (r -16..-11); the
      // window's own clear hexes: r -1..1; overview rows above: v 22..46 (r 11..23).
      expect(Array.from(c.rSpans(0))).toEqual([-16, -11, -1, 1, 11, 23]);
      // Every column agrees with the per-hex answer, window and non-window columns alike.
      for (const q of [-12, -3, 0, 5, 10, 11, 17, 32]) {
        const s = c.rSpans(q);
        for (let r = -100; r <= 100; r++) {
          let hit = false;
          for (let i = 0; i < s.length; i += 2) if (r >= s[i] && r <= s[i + 1]) hit = true;
          expect(hit, `${q},${r}`).toBe(!c.isOpaque(q, r));
        }
      }
    });

    it('builds spans for a column outside the window from the overview alone, ascending and merged', () => {
      const c = new FogCoverage(BOUNDS, maskWith([]), overviewWith([{ col: 6, row: 3, R: 0 }, { col: 6, row: 4, R: 0 }]));
      const q = 40;
      const s = c.rSpans(q);
      expect(s.length).toBe(2);
      expect(s[0]).toBeLessThanOrEqual(s[1]);
      // Blocks 5..7 x 2..5 are clear: v -32..31, even parity at u 40 -> rows -16..15, offset 20.
      expect(Array.from(s)).toEqual([-16 - 20, 15 - 20]);
      expect(spanSet(c, q).some(Boolean)).toBe(true);
      expect(c.rSpans(-60)).toEqual([]);
    });

    it('finds overview-only clear hexes with anyClearIn', () => {
      const c = new FogCoverage(BOUNDS, maskWith([]), overviewWith([{ col: 6, row: 3, R: 0 }]));
      const h = hexInBlock(6, 3);
      const row = h.r + (h.q - (h.q & 1)) / 2;
      expect(c.anyClearIn(h.q, h.q, row, row)).toBe(true);
      expect(c.anyClearIn(h.q - 1, h.q + 1, row - 2, row + 2)).toBe(true);
      expect(c.anyClearIn(-60, -50, -50, 50)).toBe(false);
      expect(c.anyClearIn(0, 5, 100, 110)).toBe(false);
    });

    it('changes its signature when only the overview changes, and not for an overview with nothing clear', () => {
      const window = maskWith([{ q: 1, r: 1, R: 0 }]);
      const without = new FogCoverage(BOUNDS, window);
      const opaqueOverview = new FogCoverage(BOUNDS, window, overviewWith([]));
      const withBlock = new FogCoverage(BOUNDS, window, overviewWith([{ col: 6, row: 3, R: 100 }]));
      const movedBlock = new FogCoverage(BOUNDS, window, overviewWith([{ col: 1, row: 6, R: 100 }]));
      const sameClear = new FogCoverage(BOUNDS, window, overviewWith([{ col: 6, row: 3, R: 5 }]));
      expect(opaqueOverview.signature).toBe(without.signature);
      expect(withBlock.signature).not.toBe(without.signature);
      expect(movedBlock.signature).not.toBe(withBlock.signature);
      expect(sameClear.signature).toBe(withBlock.signature);
    });

    it('behaves exactly as before without an overview', () => {
      const window = maskWith([{ q: 3, r: -2, R: 0 }, { q: -4, r: 5, R: 120 }]);
      const plain = new FogCoverage(BOUNDS, window);
      const nulled = new FogCoverage(BOUNDS, window, null);
      expect(nulled.signature).toBe(plain.signature);
      for (const h of allHexes(BOUNDS)) {
        expect(nulled.isOpaque(h.q, h.r)).toBe(plain.isOpaque(h.q, h.r));
      }
      expect(plain.isOpaque(40, -24)).toBe(true);
      expect(plain.rSpans(40)).toEqual([]);
    });
  });
});
