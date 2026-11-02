import { describe, expect, it } from 'vitest';
import {
  DRY_PIXEL_EPS,
  SAME_PIXEL_EPS,
  SOURCE_H,
  SOURCE_W,
  WATER_MATCH_MIN_RATIO,
  LAKE_FRAME_RE,
  LAKE_REFERENCE_FRAME_RE,
  bestReference,
  cellSourceRect,
  cropHalf,
  dryMaskHalf,
  isLakeWaterPixel,
  lakeWetMaskHalf,
  matchRatio,
  orientationOf,
  REFERENCE_FRAME_RE,
  type Canvas,
} from './dryMaskCore';

const HALF_W = SOURCE_W / 2;

/** A full source canvas filled with one opaque colour inside the rect (x, y, w, h), transparent elsewhere. */
function canvas(fill: [number, number, number], rect = { x: 0, y: 150, w: SOURCE_W, h: 150 }): Uint8Array {
  const c = new Uint8Array(SOURCE_W * SOURCE_H * 4);
  paint(c, rect, fill);
  return c;
}

function paint(c: Canvas, rect: { x: number; y: number; w: number; h: number }, [r, g, b]: [number, number, number], a = 255): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * SOURCE_W + x) * 4;
      c[i] = r;
      c[i + 1] = g;
      c[i + 2] = b;
      c[i + 3] = a;
    }
  }
}

/** Mask value at a source pixel. */
function maskAt(mask: Uint8Array, x: number, y: number): number {
  return mask[(y >> 1) * HALF_W + (x >> 1)];
}

const WATER: [number, number, number] = [30, 90, 140];

describe('dryMaskHalf', () => {
  it('marks nothing dry for art identical to the reference water', () => {
    const mask = dryMaskHalf(canvas(WATER), canvas(WATER));
    expect(mask.every((v) => v === 0)).toBe(true);
  });

  it('absorbs differences within the epsilon', () => {
    const art = canvas([WATER[0] + SAME_PIXEL_EPS, WATER[1] - SAME_PIXEL_EPS, WATER[2]]);
    expect(dryMaskHalf(art, canvas(WATER)).every((v) => v === 0)).toBe(true);
  });

  it('marks a grey rock patch dry, and only around the patch', () => {
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 40, h: 40 }, [120, 120, 120]);
    const mask = dryMaskHalf(art, canvas(WATER));
    expect(maskAt(mask, 80, 220)).toBe(255);
    expect(maskAt(mask, 10, 170)).toBe(0);
    expect(maskAt(mask, 150, 280)).toBe(0);
  });

  it('marks a blue patch dry when it differs from the water at that spot (colour-independent)', () => {
    // A blue sail on a blue sea: dry because it is not the reference pixel, not because of hue.
    const art = canvas(WATER);
    paint(art, { x: 40, y: 180, w: 20, h: 40 }, [WATER[0], WATER[1], WATER[2] + 40]);
    const mask = dryMaskHalf(art, canvas(WATER));
    expect(maskAt(mask, 50, 200)).toBe(255);
  });

  it('marks art that sticks out where the reference is transparent dry', () => {
    // A dock reaching above the water tile's own silhouette.
    const reference = canvas(WATER);
    const art = canvas(WATER);
    paint(art, { x: 90, y: 120, w: 20, h: 30 }, [150, 110, 70]);
    const mask = dryMaskHalf(art, reference);
    expect(maskAt(mask, 100, 130)).toBe(255);
  });

  it('leaves transparent art pixels alone even where the reference is opaque', () => {
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 10, h: 10 }, [0, 0, 0], 0);
    const mask = dryMaskHalf(art, canvas(WATER));
    expect(maskAt(mask, 65, 205)).toBe(0);
  });

  it('keeps the soft shadow an object casts on the water wet', () => {
    // Darker water around a rock, but within DRY_PIXEL_EPS: foam and caustics keep running over it.
    const art = canvas(WATER);
    paint(art, { x: 40, y: 180, w: 60, h: 60 }, [WATER[0] - DRY_PIXEL_EPS, WATER[1] - DRY_PIXEL_EPS, WATER[2] - DRY_PIXEL_EPS]);
    expect(dryMaskHalf(art, canvas(WATER)).every((v) => v === 0)).toBe(true);
  });

  it('fills a one-pixel hole inside an object', () => {
    // The render's dithering leaves the odd pixel inside a rock matching the water exactly; it must not let foam through.
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 40, h: 40 }, [120, 120, 120]);
    paint(art, { x: 80, y: 220, w: 1, h: 1 }, WATER);
    const mask = dryMaskHalf(art, canvas(WATER));
    expect(maskAt(mask, 80, 220)).toBe(255);
  });

  it('dilates by one source pixel and softens the edge with the 2x2 box filter', () => {
    const art = canvas(WATER);
    // One differing source pixel at (100, 200): dilated to 3x3 -> covers texel (50,100) with 1 px of 4... 
    paint(art, { x: 100, y: 200, w: 1, h: 1 }, [255, 0, 0]);
    const mask = dryMaskHalf(art, canvas(WATER));
    // 3x3 around (100,200) spans x 99..101, y 199..201: texel (50, 100) = px (100..101, 200..201) is fully inside (4/4),
    // texel (49, 100) = px (98..99, 200..201) holds x=99 (2/4), texel (50, 99) holds y=199 (2/4).
    expect(mask[100 * HALF_W + 50]).toBe(255);
    expect(mask[100 * HALF_W + 49]).toBe(128);
    expect(mask[99 * HALF_W + 50]).toBe(128);
    expect(mask[100 * HALF_W + 48]).toBe(0);
  });
});

describe('front-edge clip', () => {
  const tall = { x: 0, y: 100, w: SOURCE_W, h: 200 };

  it('clears a dry patch in the skirt below the top face and keeps one above the face', () => {
    const art = canvas(WATER, tall);
    paint(art, { x: 80, y: 256, w: 20, h: 8 }, [120, 120, 120]);
    paint(art, { x: 80, y: 116, w: 20, h: 8 }, [120, 120, 120]);
    const dry = dryMaskHalf(art, canvas(WATER, tall));
    expect(maskAt(dry, 90, 260)).toBe(0);
    expect(maskAt(dry, 90, 120)).toBe(255);
  });
});

describe('matchRatio / bestReference', () => {
  it('is 1 for identical art and 0 for art with no matching pixel', () => {
    expect(matchRatio(canvas(WATER), canvas(WATER))).toBe(1);
    expect(matchRatio(canvas([200, 200, 60]), canvas(WATER))).toBe(0);
  });

  it('counts the share of the reference that the art repeats', () => {
    const art = canvas(WATER);
    paint(art, { x: 0, y: 150, w: SOURCE_W, h: 75 }, [200, 50, 50]);
    expect(matchRatio(art, canvas(WATER))).toBeCloseTo(0.5, 6);
  });

  it('picks the reference variant the art is made from', () => {
    const plain = canvas(WATER);
    const withRock = canvas(WATER);
    paint(withRock, { x: 50, y: 200, w: 60, h: 60 }, [110, 110, 110]);
    // Art = water with a rock; the rock variant of the reference matches it fully.
    const best = bestReference(withRock, [plain, withRock]);
    expect(best).toEqual({ index: 1, ratio: 1 });
  });

  it('keeps water-based art above the threshold and rejects land art below it', () => {
    const reference = canvas(WATER);
    // A hut: mostly water with an object on it.
    const hut = canvas(WATER);
    paint(hut, { x: 40, y: 190, w: 100, h: 90 }, [130, 90, 60]);
    expect(matchRatio(hut, reference)).toBeGreaterThanOrEqual(WATER_MATCH_MIN_RATIO);
    // Grass: a different colour everywhere.
    expect(matchRatio(canvas([90, 160, 70]), reference)).toBeLessThan(WATER_MATCH_MIN_RATIO);
    expect(bestReference(canvas([90, 160, 70]), [])).toBeNull();
  });
});

describe('frame names', () => {
  it('recognises the plain water reference frames only', () => {
    for (const name of ['coastalwatertile_E_base', 'watertile_SW_base', 'taintedwater_NW_base', 'blacksandcoast_W_base', 'icecoast_NE_base']) {
      expect(REFERENCE_FRAME_RE.test(name)).toBe(true);
    }
    for (const name of ['coastalwatertile_E_variant001_base', 'fisherhut_E_level001_base', 'grasstile_E_base']) {
      expect(REFERENCE_FRAME_RE.test(name)).toBe(false);
    }
  });

  it('reads the orientation token', () => {
    expect(orientationOf('coastalwatertile_NE_variant001_base')).toBe('NE');
    expect(orientationOf('fisherhut_W_level001_base')).toBe('W');
    expect(orientationOf('hextile_rig')).toBeNull();
  });
});

describe('cell rect', () => {
  it('rounds a trim rect out to even source pixels, so a half-resolution cell maps onto it exactly', () => {
    expect(cellSourceRect({ x: 3, y: 139, w: 195, h: 161 })).toEqual({ sx: 2, sy: 138, sw: 196, sh: 162 });
    expect(cellSourceRect({ x: 0, y: 150, w: 200, h: 150 })).toEqual({ sx: 0, sy: 150, sw: 200, sh: 150 });
  });

  it('crops the half mask to the cell', () => {
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 40, h: 40 }, [120, 120, 120]);
    const half = dryMaskHalf(art, canvas(WATER));
    const rect = cellSourceRect({ x: 0, y: 150, w: SOURCE_W, h: 150 });
    const cell = cropHalf(half, rect);
    expect(cell).toHaveLength((rect.sw / 2) * (rect.sh / 2));
    // Source (80, 220) is texel (40, 110) of the canvas, (40, 35) of the cell starting at y = 150.
    expect(cell[35 * (rect.sw / 2) + 40]).toBe(255);
    expect(cell[0]).toBe(0);
  });
});

describe('lakeWetMaskHalf', () => {
  const LAKE: [number, number, number] = [20, 36, 64];
  const EARTH: [number, number, number] = [70, 52, 40];
  /** A lake tile: water on the top face (y 150..250), earth on the prism's side faces below it. */
  function lakeTile(): Uint8Array {
    const c = canvas(LAKE, { x: 0, y: 150, w: SOURCE_W, h: 100 });
    paint(c, { x: 0, y: 250, w: SOURCE_W, h: 50 }, EARTH);
    return c;
  }

  it('is wet on every water pixel of a tile identical to the plain lake, and not on its side faces', () => {
    const mask = lakeWetMaskHalf(lakeTile(), lakeTile());
    expect(maskAt(mask, 100, 200)).toBe(255);
    expect(maskAt(mask, 40, 170)).toBe(255);
    // The side faces repeat the reference but are not blue.
    expect(maskAt(mask, 100, 280)).toBe(0);
    // Transparent above the tile.
    expect(maskAt(mask, 100, 50)).toBe(0);
  });

  it('is not wet where the art is a bank (grass) instead of the reference water', () => {
    const art = lakeTile();
    paint(art, { x: 100, y: 150, w: 100, h: 100 }, [60, 120, 50]);
    const mask = lakeWetMaskHalf(art, lakeTile());
    expect(maskAt(mask, 40, 200)).toBe(255);
    expect(maskAt(mask, 150, 200)).toBe(0);
  });

  it('is not wet on a brighter creek patch', () => {
    const art = lakeTile();
    paint(art, { x: 60, y: 190, w: 40, h: 30 }, [60, 120, 170]);
    const mask = lakeWetMaskHalf(art, lakeTile());
    expect(maskAt(mask, 80, 205)).toBe(0);
    expect(maskAt(mask, 20, 205)).toBe(255);
  });

  it('keeps a pixel of margin off the bank: eroded, not grown', () => {
    const art = lakeTile();
    paint(art, { x: 100, y: 150, w: 100, h: 100 }, [60, 120, 50]);
    const mask = lakeWetMaskHalf(art, lakeTile());
    // The last water column next to the bank (x 98, 99) is already off.
    expect(maskAt(mask, 98, 200)).toBeLessThan(255);
    expect(maskAt(mask, 94, 200)).toBe(255);
  });

  it('counts only blue-dominant opaque reference pixels as lake water', () => {
    const ref = lakeTile();
    expect(isLakeWaterPixel(ref, (200 * SOURCE_W + 100) * 4)).toBe(true);
    expect(isLakeWaterPixel(ref, (280 * SOURCE_W + 100) * 4)).toBe(false);
    expect(isLakeWaterPixel(ref, (50 * SOURCE_W + 100) * 4)).toBe(false);
  });
});

describe('lake frame names', () => {
  it('matches the plain lake and the inlet, shore, half and mouth families, with variants', () => {
    for (const name of ['boglake_E_base', 'boglake_NW_variant003_base', 'boglake_inlet_SW_base', 'boglake_shore_W_variant002_base', 'boglake_half_NE_base', 'boglake_mouth_SE_variant001_base']) {
      expect(LAKE_FRAME_RE.test(name), name).toBe(true);
    }
    for (const name of ['boglake_E_top', 'watertile_E_base', 'boglake_inlet_E_top', 'bog_E_base']) {
      expect(LAKE_FRAME_RE.test(name), name).toBe(false);
    }
  });

  it('takes only the plain lake as reference', () => {
    expect(LAKE_REFERENCE_FRAME_RE.test('boglake_E_base')).toBe(true);
    expect(LAKE_REFERENCE_FRAME_RE.test('boglake_E_variant001_base')).toBe(false);
    expect(LAKE_REFERENCE_FRAME_RE.test('boglake_shore_E_base')).toBe(false);
  });
});
