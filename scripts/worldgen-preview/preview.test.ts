import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canDraw } from './font';
import { parseArgs } from './cli';
import { legendFor, LAYERS, TERRAIN_COLOURS } from './layers';
import { crc32, encodePng } from './png';
import { renderPreview } from './render';

/** Minimal PNG reader: chunk list with verified CRCs, header, and the unfiltered pixels. */
function decode(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const chunks: Record<string, Buffer> = {};
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    expect(png.readUInt32BE(o + 8 + len)).toBe(crc32(png.subarray(o + 4, o + 8 + len)));
    chunks[type] = data;
    o += 12 + len;
  }
  const width = chunks.IHDR.readUInt32BE(0);
  const height = chunks.IHDR.readUInt32BE(4);
  const raw = inflateSync(chunks.IDAT);
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 3 + 1)]).toBe(0);
    raw.copy(pixels, y * width * 3, y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1));
  }
  return { width, height, pixels, chunks };
}

describe('png encoder', () => {
  it('matches the CRC-32 check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips pixels', () => {
    const rgb = new Uint8Array(3 * 2 * 3);
    rgb.forEach((_, i) => (rgb[i] = (i * 37) % 256));
    const { width, height, pixels, chunks } = decode(encodePng(3, 2, rgb));
    expect([width, height]).toEqual([3, 2]);
    expect(chunks.IEND).toBeDefined();
    expect([...pixels]).toEqual([...rgb]);
  });

  it('rejects a buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(5))).toThrow();
  });
});

describe('legend', () => {
  it('is built from the same colour table the terrain layer paints with', () => {
    const entries = legendFor(['terrain']);
    for (const [terrain, colour] of Object.entries(TERRAIN_COLOURS)) {
      expect(entries.find((e) => e.label === terrain)?.colour).toEqual(colour);
    }
    expect(entries.some((e) => e.label === 'world radius')).toBe(true);
  });

  it('only uses characters the bitmap font can draw', () => {
    for (const id of Object.keys(LAYERS)) for (const e of legendFor([id])) expect(canDraw(e.label)).toBe(true);
  });
});

describe('renderPreview', () => {
  it('draws a small window with a legend and a footer, deterministically', () => {
    const options = { seed: 11, radius: 1000, window: { q: 0, r: 0, size: 40 }, hexPixels: 4, layers: ['terrain'], legend: true, stats: false };
    const a = renderPreview(options);
    const b = renderPreview(options);
    const { width, height, pixels } = decode(a.png);
    // The footer prints timings, so compare the map area only.
    const mapRows = Math.ceil(Math.sqrt(3) * 40 * 4);
    expect(decode(b.png).pixels.subarray(0, mapRows * width * 3).equals(pixels.subarray(0, mapRows * width * 3))).toBe(true);
    expect(width).toBeGreaterThanOrEqual(240);
    expect(height).toBeGreaterThan(Math.ceil(Math.sqrt(3) * 40 * 4)); // map + legend + footer
    expect(a.statsLines[0]).toContain('SEED 11');
  });
});

describe('cli arguments', () => {
  it('parses the documented options', () => {
    const { options, out } = parseArgs(['--seed', '5', '--radius', '400', '--window', '1,-2,50', '--px', '3', '--layers', 'terrain,wasted', '--out', 'x.png', '--no-stats']);
    expect(options).toMatchObject({ seed: 5, radius: 400, window: { q: 1, r: -2, size: 50 }, hexPixels: 3, layers: ['terrain', 'wasted'], stats: false });
    expect(out).toBe('x.png');
  });
});
