// A 3x5 bitmap font — enough to label a legend and print a stats footer without a font
// dependency. Upper case only (lower case is folded); characters it lacks draw as a box.
const GLYPHS: Record<string, string> = {
  ' ': '000000000000000',
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101111011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '.': '000000000000010',
  ',': '000000000010100',
  ':': '000010000010000',
  ';': '000010000010100',
  '-': '000000111000000',
  '+': '000010111010000',
  '/': '001001010100100',
  '(': '010100100100010',
  ')': '010001001001010',
  '=': '000111000111000',
  '%': '101001010100101',
  _: '000000000000111',
  '<': '001010100010001',
  '>': '100010001010100',
  '#': '101111101111101',
  '*': '000101010101000',
  "'": '010010000000000',
};
const MISSING = '111101101101111';

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;

/** Whether the font can draw every character of `text` (upper-casing it first). */
export function canDraw(text: string): boolean {
  return [...text.toUpperCase()].every((ch) => ch in GLYPHS);
}

/** Pixel width of `text` at integer `scale` (one blank column between glyphs). */
export function textWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : (text.length * (GLYPH_WIDTH + 1) - 1) * scale;
}

/** Draws `text` into an RGB buffer with its top-left at (x, y); clipped to the image. */
export function drawText(
  rgb: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  text: string,
  colour: readonly [number, number, number],
  scale = 2,
): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const bits = GLYPHS[ch] ?? MISSING;
    for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
      for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
        if (bits[gy * GLYPH_WIDTH + gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + gx * scale + sx;
            const py = y + gy * scale + sy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            const o = (py * width + px) * 3;
            rgb[o] = colour[0];
            rgb[o + 1] = colour[1];
            rgb[o + 2] = colour[2];
          }
        }
      }
    }
    cx += (GLYPH_WIDTH + 1) * scale;
  }
}
