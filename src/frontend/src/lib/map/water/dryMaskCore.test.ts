import { describe, expect, it } from 'vitest';
import {
  DRY_PIXEL_EPS,
  SAME_PIXEL_EPS,
  SOURCE_H,
  SOURCE_W,
  WATER_MATCH_MIN_RATIO,
  bestReference,
  cellSourceRect,
  cropHalf,
  artMasksHalf,
  SHADOW_FULL_DARKENING,
  TOP_FACE_Y,
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

describe('artMasksHalf (dry)', () => {
  it('marks nothing dry for art identical to the reference water', () => {
    const mask = artMasksHalf(canvas(WATER), canvas(WATER)).dry;
    expect(mask.every((v) => v === 0)).toBe(true);
  });

  it('absorbs differences within the epsilon', () => {
    const art = canvas([WATER[0] + SAME_PIXEL_EPS, WATER[1] - SAME_PIXEL_EPS, WATER[2]]);
    expect(artMasksHalf(art, canvas(WATER)).dry.every((v) => v === 0)).toBe(true);
  });

  it('marks a grey rock patch dry, and only around the patch', () => {
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 40, h: 40 }, [120, 120, 120]);
    const mask = artMasksHalf(art, canvas(WATER)).dry;
    expect(maskAt(mask, 80, 220)).toBe(255);
    expect(maskAt(mask, 10, 170)).toBe(0);
    expect(maskAt(mask, 150, 280)).toBe(0);
  });

  it('marks a blue patch dry when it differs from the water at that spot (colour-independent)', () => {
    // A blue sail on a blue sea: dry because it is not the reference pixel, not because of hue.
    const art = canvas(WATER);
    paint(art, { x: 40, y: 180, w: 20, h: 40 }, [WATER[0], WATER[1], WATER[2] + 40]);
    const mask = artMasksHalf(art, canvas(WATER)).dry;
    expect(maskAt(mask, 50, 200)).toBe(255);
  });

  it('marks art that sticks out where the reference is transparent dry', () => {
    // A dock reaching above the water tile's own silhouette.
    const reference = canvas(WATER);
    const art = canvas(WATER);
    paint(art, { x: 90, y: 120, w: 20, h: 30 }, [150, 110, 70]);
    const mask = artMasksHalf(art, reference).dry;
    expect(maskAt(mask, 100, 130)).toBe(255);
  });

  it('leaves transparent art pixels alone even where the reference is opaque', () => {
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 10, h: 10 }, [0, 0, 0], 0);
    const mask = artMasksHalf(art, canvas(WATER)).dry;
    expect(maskAt(mask, 65, 205)).toBe(0);
  });

  it('keeps the soft shadow an object casts on the water wet', () => {
    // Darker water around a rock, but within DRY_PIXEL_EPS: foam and caustics keep running over it.
    const art = canvas(WATER);
    paint(art, { x: 40, y: 180, w: 60, h: 60 }, [WATER[0] - DRY_PIXEL_EPS, WATER[1] - DRY_PIXEL_EPS, WATER[2] - DRY_PIXEL_EPS]);
    expect(artMasksHalf(art, canvas(WATER)).dry.every((v) => v === 0)).toBe(true);
  });

  it('fills a one-pixel hole inside an object', () => {
    // The render's dithering leaves the odd pixel inside a rock matching the water exactly; it must not let foam through.
    const art = canvas(WATER);
    paint(art, { x: 60, y: 200, w: 40, h: 40 }, [120, 120, 120]);
    paint(art, { x: 80, y: 220, w: 1, h: 1 }, WATER);
    const mask = artMasksHalf(art, canvas(WATER)).dry;
    expect(maskAt(mask, 80, 220)).toBe(255);
  });

  it('dilates by one source pixel and softens the edge with the 2x2 box filter', () => {
    const art = canvas(WATER);
    // One differing source pixel at (100, 200): dilated to 3x3 -> covers texel (50,100) with 1 px of 4... 
    paint(art, { x: 100, y: 200, w: 1, h: 1 }, [255, 0, 0]);
    const mask = artMasksHalf(art, canvas(WATER)).dry;
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
    const { dry } = artMasksHalf(art, canvas(WATER, tall));
    expect(maskAt(dry, 90, 260)).toBe(0);
    expect(maskAt(dry, 90, 120)).toBe(255);
  });

  it('clears shadow in the skirt too, and keeps it on the face', () => {
    const art = canvas(WATER, tall);
    const dark: [number, number, number] = [WATER[0] * 0.9, WATER[1] * 0.9, WATER[2] * 0.9];
    paint(art, { x: 70, y: 252, w: 60, h: 16 }, dark);
    paint(art, { x: 70, y: 160, w: 60, h: 16 }, dark);
    const { shadow } = artMasksHalf(art, canvas(WATER, tall));
    expect(maskAt(shadow, 100, 260)).toBe(0);
    expect(maskAt(shadow, 100, 168)).toBeGreaterThan(0);
  });
});

describe('artMasksHalf (shadow)', () => {
  // A big patch on the top face, so the blur leaves its middle untouched.
  const patch = { x: 60, y: TOP_FACE_Y + 20, w: 80, h: 40 };
  const centre = { x: 100, y: TOP_FACE_Y + 40 };
  const shadowOf = (colour: [number, number, number]) => {
    const art = canvas(WATER);
    paint(art, patch, colour);
    return maskAt(artMasksHalf(art, canvas(WATER)).shadow, centre.x, centre.y);
  };

  it('is 0 for art identical to the water', () => {
    expect(artMasksHalf(canvas(WATER), canvas(WATER)).shadow.every((v) => v === 0)).toBe(true);
  });

  it('is positive for a darker patch within the dry epsilon, and proportional to the darkening', () => {
    const slight = shadowOf([WATER[0] - 6, WATER[1] - 6, WATER[2] - 6]);
    const more = shadowOf([WATER[0] - 12, WATER[1] - 12, WATER[2] - 12]);
    expect(slight).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(slight);
    expect(more).toBeLessThan(255);
  });

  it('is full at SHADOW_FULL_DARKENING darker or more', () => {
    // A dark sea (luma 60) lets a patch be 25%+ darker and still within DRY_PIXEL_EPS: 19 levels is 31.7% darker.
    const sea: [number, number, number] = [60, 60, 60];
    const level = 60 - DRY_PIXEL_EPS + 1;
    expect((DRY_PIXEL_EPS - 1) / 60).toBeGreaterThanOrEqual(SHADOW_FULL_DARKENING);
    const art = canvas(sea);
    paint(art, patch, [level, level, level]);
    const { dry, shadow } = artMasksHalf(art, canvas(sea));
    expect(maskAt(dry, centre.x, centre.y)).toBe(0);
    expect(maskAt(shadow, centre.x, centre.y)).toBe(255);
  });

  it('is 0 for brighter pixels', () => {
    expect(shadowOf([WATER[0] + 10, WATER[1] + 10, WATER[2] + 10])).toBe(0);
  });

  it('is 0 on dry pixels', () => {
    expect(shadowOf([10, 10, 10])).toBe(0);
    expect(maskAt(artMasksHalf(canvas(WATER), canvas(WATER)).dry, centre.x, centre.y)).toBe(0);
  });

  it('is 0 where the art is transparent', () => {
    const art = canvas(WATER);
    paint(art, patch, [0, 0, 0], 0);
    expect(maskAt(artMasksHalf(art, canvas(WATER)).shadow, centre.x, centre.y)).toBe(0);
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
    const half = artMasksHalf(art, canvas(WATER)).dry;
    const rect = cellSourceRect({ x: 0, y: 150, w: SOURCE_W, h: 150 });
    const cell = cropHalf(half, rect);
    expect(cell).toHaveLength((rect.sw / 2) * (rect.sh / 2));
    // Source (80, 220) is texel (40, 110) of the canvas, (40, 35) of the cell starting at y = 150.
    expect(cell[35 * (rect.sw / 2) + 40]).toBe(255);
    expect(cell[0]).toBe(0);
  });
});
