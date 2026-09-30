// Draws a world preview from the REAL client generator (src/frontend/src/lib/map/worldGenerator.ts):
// every hex is sampled through the same functions the game runs, drawn in true flat-top hex
// geometry (odd-q: x = 1.5 * col, y = sqrt(3) * (row + 0.5 * (col & 1))), with the world radius
// outlined, a legend generated from the layers' own colour tables and a stats footer.
import { hexDistance } from '../../src/frontend/src/lib/hex/coords';
import { DEFAULT_GENERATION, type WorldGenerationConstants } from '../../src/frontend/src/lib/map/worldGenerator';
import { drawText, GLYPH_HEIGHT, textWidth } from './font';
import {
  legendFor,
  OUTSIDE_WORLD_TINT,
  RADIUS_OUTLINE,
  resolveLayers,
  TERRAIN_COLOURS,
  type Rgb,
} from './layers';
import { findLandmasses, sizeDistribution } from './landmasses';
import { encodePng } from './png';

const SQRT3 = Math.sqrt(3);
const FRAME_BACKGROUND: Rgb = [16, 18, 22];
const TEXT_COLOUR: Rgb = [232, 232, 232];
const TEXT_SCALE = 2;
const MIN_IMAGE_WIDTH = 720;

export interface PreviewOptions {
  seed: number;
  radius: number;
  /** Centre hex (axial q, r) and size in hexes across; default: the whole world. */
  window?: { q: number; r: number; size: number };
  /** Circumradius of a hex in pixels; default: the largest that keeps the map under `maxMapWidth`. */
  hexPixels?: number;
  maxMapWidth?: number;
  layers: string[];
  legend: boolean;
  stats: boolean;
  /** Overrides of the generation constants (island knobs, thresholds). */
  generation?: Partial<WorldGenerationConstants>;
}

export interface PreviewResult {
  png: Buffer;
  width: number;
  height: number;
  /** The footer lines (also drawn into the image). */
  statsLines: string[];
}

/** Rounds fractional axial coordinates to the hex they fall in (cube rounding). */
function hexAt(q: number, r: number): { q: number; r: number; fq: number; fr: number } {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz, fq: q, fr: r };
}

function fillRect(rgb: Uint8Array, width: number, x: number, y: number, w: number, h: number, colour: Rgb): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const o = (yy * width + xx) * 3;
      rgb[o] = colour[0];
      rgb[o + 1] = colour[1];
      rgb[o + 2] = colour[2];
    }
  }
}

export function renderPreview(options: PreviewOptions): PreviewResult {
  const generation: WorldGenerationConstants = { ...DEFAULT_GENERATION, ...options.generation, worldRadius: options.radius };
  const world = { seed: options.seed, generation };
  const layers = resolveLayers(options.layers);

  const win = options.window ?? { q: 0, r: 0, size: 2 * options.radius + 1 };
  const maxMapWidth = options.maxMapWidth ?? 1800;
  const s = options.hexPixels ?? Math.min(12, Math.max(0.05, maxMapWidth / (1.5 * win.size)));
  const mapW = Math.max(1, Math.ceil(1.5 * win.size * s));
  const mapH = Math.max(1, Math.ceil(SQRT3 * win.size * s));

  // Map centre in unit-circumradius space.
  const cx = 1.5 * win.q;
  const cy = SQRT3 * (win.r + win.q / 2);

  // ---- the map --------------------------------------------------------------------
  const sampleStart = performance.now();
  const map = new Uint8Array(mapW * mapH * 3);
  const cache = s >= 2 ? new Map<number, Rgb>() : null;
  const colourOf = (q: number, r: number): Rgb => {
    const cacheKey = cache ? q * 262144 + r : 0;
    const hit = cache?.get(cacheKey);
    if (hit) return hit;
    let colour: Rgb = TERRAIN_COLOURS.sea;
    for (const layer of layers) colour = layer.colourAt(q, r, world) ?? colour;
    if (hexDistance({ q: 0, r: 0 }, { q, r }) > options.radius) {
      colour = [
        Math.round(colour[0] * OUTSIDE_WORLD_TINT),
        Math.round(colour[1] * OUTSIDE_WORLD_TINT),
        Math.round(colour[2] * OUTSIDE_WORLD_TINT),
      ];
    }
    cache?.set(cacheKey, colour);
    return colour;
  };
  // A pixel counts as on the radius outline when its (fractional) hex distance is within a
  // band around the disc's edge, R + 0.5 steps out. One step is ~sqrt(3) * s pixels wide.
  const band = Math.max(0.3, 0.9 / s);
  for (let py = 0; py < mapH; py++) {
    for (let px = 0; px < mapW; px++) {
      const x = cx + (px - mapW / 2 + 0.5) / s;
      const y = cy + (py - mapH / 2 + 0.5) / s;
      const fq = (2 / 3) * x;
      const fr = (-x / 3 + (SQRT3 / 3) * y);
      const { q, r } = hexAt(fq, fr);
      let colour = colourOf(q, r);
      const fs = -fq - fr;
      const dist = Math.max(Math.abs(fq), Math.abs(fr), Math.abs(fs));
      if (Math.abs(dist - (options.radius + 0.5)) < band) colour = RADIUS_OUTLINE;
      const o = (py * mapW + px) * 3;
      map[o] = colour[0];
      map[o + 1] = colour[1];
      map[o + 2] = colour[2];
    }
  }
  const sampleMs = performance.now() - sampleStart;

  // ---- stats ----------------------------------------------------------------------
  const statsLines: string[] = [
    `SEED ${options.seed}  RADIUS ${options.radius}  WINDOW ${win.q},${win.r} SIZE ${win.size}  ${s.toFixed(2)} PX/HEX  LAYERS ${options.layers.join('+')}`,
  ];
  if (options.stats) {
    const scanStart = performance.now();
    const green = findLandmasses(world);
    const wasted = findLandmasses(world, true);
    const scanMs = performance.now() - scanStart;
    const minimum = 6; // WorldGenerationOptions.MinimumIslandTiles' default
    const kept = green.landmasses.filter((l) => l.tiles >= minimum);
    const classes = { small: 0, medium: 0, large: 0 };
    for (const shape of green.shapes) classes[shape.sizeClass]++;
    const land = green.landmasses.reduce((sum, l) => sum + l.tiles, 0);
    statsLines.push(
      `ISLANDS ${kept.length} (${green.landmasses.length - kept.length} SPECKS UNDER ${minimum} TILES)  WASTED ${wasted.landmasses.filter((l) => l.tiles >= minimum).length}  LAND HEXES ${land}`,
      `CLASSES  A(SMALL) ${classes.small}  B(MEDIUM) ${classes.medium}  C(LARGE) ${classes.large}  ISLAND CELLS ${green.shapes.length}`,
      `SIZES  ${sizeDistribution(kept)
        .map((b) => `${b.label}: ${b.count}`)
        .join('  ')}`,
      `MS  TERRAIN SAMPLING ${sampleMs.toFixed(0)}  LANDMASS SCAN ${scanMs.toFixed(0)}`,
    );
  } else {
    statsLines.push(`MS  TERRAIN SAMPLING ${sampleMs.toFixed(0)}  (STATS SKIPPED)`);
  }

  // ---- compose: map, legend strip, stats footer -------------------------------------
  const width = Math.max(mapW, MIN_IMAGE_WIDTH);
  const lineHeight = GLYPH_HEIGHT * TEXT_SCALE + 6;
  const swatch = GLYPH_HEIGHT * TEXT_SCALE + 2;

  const legendEntries = options.legend ? legendFor(options.layers) : [];
  // Lay the legend out first to know how tall the strip is.
  const legendPlacements: { x: number; y: number; label: string; colour: Rgb }[] = [];
  let lx = 10;
  let ly = 8;
  for (const entry of legendEntries) {
    const entryWidth = swatch + 6 + textWidth(entry.label, TEXT_SCALE) + 18;
    if (lx + entryWidth > width - 10) {
      lx = 10;
      ly += swatch + 6;
    }
    legendPlacements.push({ x: lx, y: ly, label: entry.label, colour: entry.colour });
    lx += entryWidth;
  }
  const legendHeight = options.legend ? ly + swatch + 8 : 0;
  const footerHeight = statsLines.length * lineHeight + 12;
  const height = mapH + legendHeight + footerHeight;

  const rgb = new Uint8Array(width * height * 3);
  fillRect(rgb, width, 0, 0, width, height, FRAME_BACKGROUND);
  const mapX = Math.floor((width - mapW) / 2);
  for (let y = 0; y < mapH; y++) rgb.set(map.subarray(y * mapW * 3, (y + 1) * mapW * 3), (y * width + mapX) * 3);

  for (const p of legendPlacements) {
    fillRect(rgb, width, p.x, mapH + p.y, swatch, swatch, p.colour);
    drawText(rgb, width, height, p.x + swatch + 6, mapH + p.y + 1, p.label, TEXT_COLOUR, TEXT_SCALE);
  }
  statsLines.forEach((line, i) => {
    drawText(rgb, width, height, 10, mapH + legendHeight + 8 + i * lineHeight, line, TEXT_COLOUR, TEXT_SCALE);
  });

  return { png: encodePng(width, height, rgb), width, height, statsLines };
}
