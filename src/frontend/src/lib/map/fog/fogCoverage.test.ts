import { describe, expect, it } from 'vitest';
import { FogCoverage } from './fogCoverage';
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
});
