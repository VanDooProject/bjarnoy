import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canDraw } from './font';
import { DEFAULT_GENERATION } from '../../src/frontend/src/lib/map/worldGenerator';
import { parseArgs } from './cli';
import { legendFor, LAYERS, TERRAIN_COLOURS } from './layers';
import { crc32, encodePng } from './png';
import { renderPreview } from './render';
import { drawMarker } from './marks';
import { CAMP_MARKERS, campsFor } from './camps';
import { CAMP_FAMILIES } from '../../src/frontend/src/lib/map/campPlacement';

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
    // (bog and lake are placed per island, so they are the bog layer's, not the terrain layer's.)
    for (const [terrain, colour] of Object.entries(TERRAIN_COLOURS).filter(([t]) => t !== 'bog' && t !== 'lake')) {
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

describe('rivers layer', () => {
  it('traces real rivers on an island window and reports no inland mouths', () => {
    const options = { seed: 11, radius: 1000, window: { q: -215, r: 600, size: 60 }, hexPixels: 4, layers: ['terrain', 'rivers'], legend: true, stats: false };
    const result = renderPreview(options);
    const line = result.statsLines.find((l) => l.startsWith('MERGES'));
    expect(line).toBeDefined();
    expect(line).toContain('INLAND MOUTHS 0');
    expect(result.statsLines.some((l) => l.startsWith('RIVERS'))).toBe(true);
  });
});

describe('bog layer', () => {
  const options = { seed: 11, radius: 1000, window: { q: -728, r: 204, size: 60 }, hexPixels: 6, layers: ['terrain', 'rivers', 'bog'], legend: true, stats: false };

  it('draws the lake, lists every bog kind in the legend and reports zero violations of every rule', () => {
    const plain = renderPreview({ ...options, layers: ['terrain', 'rivers'] });
    const withBog = renderPreview(options);
    expect(withBog.png.equals(plain.png)).toBe(false);
    expect(legendFor(['bog']).map((e) => e.label)).toEqual(
      expect.arrayContaining(['bog moss', 'bog lake', 'inlet (1 lake edge)', 'shore (2)', 'half shore (3)', 'creek', 'lake mouth', 'creek spring']),
    );
    const line = withBog.statsLines.find((l) => l.startsWith('RULE VIOLATIONS'))!;
    expect(line).toBeDefined();
    expect(line).toMatch(/TOTAL 0$/);
    for (const rule of ['R1', 'R2', 'R3', 'R4', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12']) expect(line).toMatch(new RegExp(`${rule} [^ ]*.* 0`));
    expect(withBog.statsLines.find((l) => l.startsWith('BOG ON'))).toMatch(/LAKES [1-9]/);
    // A river through the lake is not an inland mouth.
    expect(withBog.statsLines.find((l) => l.startsWith('MERGES'))).toContain('INLAND MOUTHS 0');
  });
});

describe('cli arguments', () => {
  it('parses the documented options', () => {
    const { options, out } = parseArgs(['--seed', '5', '--radius', '400', '--window', '1,-2,50', '--px', '3', '--layers', 'terrain,wasted', '--out', 'x.png', '--no-stats']);
    expect(options).toMatchObject({ seed: 5, radius: 400, window: { q: 1, r: -2, size: 50 }, hexPixels: 3, layers: ['terrain', 'wasted'], stats: false });
    expect(out).toBe('x.png');
  });
});

describe('camps layer', () => {
  const options = { seed: 11, radius: 1000, window: { q: 0, r: 0, size: 60 }, hexPixels: 6, layers: ['terrain', 'camps'], legend: true, stats: false };

  it('draws marker pixels in the strong / weak colours and prints camp stats', () => {
    const plain = renderPreview({ ...options, layers: ['terrain'] });
    const withCamps = renderPreview(options);
    expect(withCamps.statsLines.some((l) => l.startsWith('CAMPS '))).toBe(true);
    expect(withCamps.statsLines.some((l) => l.startsWith('CAMPS BY FAMILY'))).toBe(true);
    expect(decode(withCamps.png).pixels.equals(decode(plain.png).pixels)).toBe(false);
  });

  it('legend has a marker per placeable family and a ring per strength', () => {
    const labels = legendFor(['camps']).map((e) => e.label);
    for (const f of CAMP_FAMILIES.filter((f) => CAMP_MARKERS[f.family])) expect(labels).toContain(f.family.toUpperCase());
    expect(labels.filter((l) => l.includes('GUARD RANGE'.toLowerCase()) || l.includes('guard range'))).toHaveLength(2);
    // Bog camps are not placed yet, so they are not in the legend.
    expect(labels).not.toContain('MOOSEMIRE');
  });

  it('places camps by the backend island order: a whole small-radius world has camps on its islands', () => {
    let result = { islands: 0, perIsland: [] as number[], camps: [] as { family: string; wasted: boolean }[] };
    // A radius-300 world holds few islands at the default cell size: take the first seed that has one.
    for (let seed = 1; seed <= 20 && result.islands === 0; seed++) {
      result = campsFor({ world: { seed, generation: { ...DEFAULT_GENERATION, worldRadius: 300 } }, radius: 300, window: { q: 0, r: 0, size: 601 }, windowed: false });
    }
    expect(result.islands).toBeGreaterThan(0);
    expect(result.perIsland.some((n) => n >= 1)).toBe(true);
    expect(result.camps.every((c) => c.family !== 'fenrirbrood' || c.wasted)).toBe(true);
  });

  it('draws a marker with an outline and a ring of the wanted colour', () => {
    const rgb = new Uint8Array(21 * 21 * 3);
    drawMarker(rgb, 21, 21, 10, 10, 'disc', 4, [255, 64, 200]);
    const centre = (10 * 21 + 10) * 3;
    expect([...rgb.subarray(centre, centre + 3)]).toEqual([255, 64, 200]);
    const ring = new Uint8Array(21 * 21 * 3);
    drawMarker(ring, 21, 21, 10, 10, 'ring', 6, [64, 230, 255]);
    expect([...ring.subarray(centre, centre + 3)]).toEqual([0, 0, 0]);
    const edge = (10 * 21 + 16) * 3;
    expect([...ring.subarray(edge, edge + 3)]).toEqual([64, 230, 255]);
  });
});
