// Terrain shape lab (investigation only, not wired into the game): renders islands with alternative
// mountain / forest fields side by side and measures them (mountain share, ranges, cut-off land, bog count).
//   cd src/frontend && npx tsx ../../scripts/worldgen-preview/lab/terrainLab.ts --seeds 1-2 --out <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { axialToOddQ, neighbors } from '../../../src/frontend/src/lib/hex/coords';
import {
  DEFAULT_GENERATION,
  hash2,
  islandDepthAt,
  terrainAt,
  valueNoise,
  enumerateIslandShapes,
  type IslandShape,
  type WorldSeed,
} from '../../../src/frontend/src/lib/map/worldGenerator';
import { generateRiversWithBogs, emptyRiverStats } from '../../../src/frontend/src/lib/map/riverGenerator';
import { checkBogRules, totalViolations } from '../../../src/frontend/src/lib/map/bogRules';
import type { Terrain } from '../../../src/frontend/src/lib/map/types';
import { findLandmasses } from '../landmasses';
import { encodePng } from '../png';
import { drawText } from '../font';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1]! : d;
};
const [from, to] = opt('seeds', '1-2').split('-').map(Number) as [number, number];
const radius = Number(opt('radius', '1000'));
const outDir = opt('out', '.');
const only = opt('variants', '');
const panels = Number(opt('panels', '3'));
const doBogs = !args.includes('--no-bogs');
const px = Number(opt('px', '2.2'));
mkdirSync(outDir, { recursive: true });

// ---------- helpers ----------
const SQ3 = Math.sqrt(3);
/** Cartesian position of a hex centre (flat-top, unit circumradius): no axial shear. */
const cart = (q: number, r: number) => ({ x: 1.5 * q, y: SQ3 * (r + q / 2) });
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Value noise sampled in cartesian space with a two-axis domain warp (rounder, unsheared blobs). */
function warpedNoise(q: number, r: number, seed: number, cell: number, warp: number): number {
  const { x, y } = cart(q, r);
  const wx = x + (valueNoise(x, y, seed + 1, cell * 1.7) - 0.5) * 2 * warp;
  const wy = y + (valueNoise(x, y, seed + 2, cell * 1.7) - 0.5) * 2 * warp;
  // two lattices rotated against each other hide the square lattice
  const c = Math.cos(0.6);
  const s = Math.sin(0.6);
  const a = valueNoise(wx, wy, seed + 3, cell);
  const b = valueNoise(wx * c - wy * s, wx * s + wy * c, seed + 4, cell);
  return (a + b) / 2;
}
/** Jittered-grid features: nearest feature points around (x, y), cell size `cell`. */
function features(x: number, y: number, seed: number, cell: number, cb: (fx: number, fy: number, h: number, d: number) => void) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      const gx = cx + i;
      const gy = cy + j;
      const fx = (gx + 0.1 + 0.8 * hash2(gx, gy, seed)) * cell;
      const fy = (gy + 0.1 + 0.8 * hash2(gx, gy, seed + 1)) * cell;
      cb(fx, fy, hash2(gx, gy, seed + 2), Math.hypot(x - fx, y - fy));
    }
}

/** Where a hex sits relative to its island's spine (offset space, before the coast warp). */
interface Spine {
  /** arc length along the spine (hexes) */
  s: number;
  /** signed distance from the spine (hexes) */
  d: number;
  /** half-width of the island there */
  w: number;
  /** total spine length */
  len: number;
  /** a per-island roll */
  id: number;
}
type MountainFn = (q: number, r: number, t: number, seed: number, sp: Spine | null) => boolean;

function spineOf(shapes: IslandShape[], q: number, r: number): Spine | null {
  const { col, row } = axialToOddQ({ q, r });
  let best: Spine | null = null;
  let bestV = Infinity;
  for (const is of shapes) {
    if (col < is.minCol || col > is.maxCol || row < is.minRow || row > is.maxRow) continue;
    const qx = col - is.cx;
    const qy = row - is.cy;
    let acc = 0;
    let len = 0;
    for (let k = 0; k < is.sx.length - 1; k++) len += Math.hypot(is.sx[k + 1]! - is.sx[k]!, is.sy[k + 1]! - is.sy[k]!);
    for (let k = 0; k < is.sx.length - 1; k++) {
      const x0 = is.sx[k]!;
      const y0 = is.sy[k]!;
      const dx = is.sx[k + 1]! - x0;
      const dy = is.sy[k + 1]! - y0;
      const l2 = dx * dx + dy * dy;
      const l = Math.sqrt(l2);
      let t = l2 > 0 ? ((qx - x0) * dx + (qy - y0) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - (x0 + t * dx);
      const ey = qy - (y0 + t * dy);
      const w = is.w[k]! + (is.w[k + 1]! - is.w[k]!) * t;
      const dist = Math.hypot(ex, ey);
      const v = dist / w;
      if (v < bestV) {
        bestV = v;
        const side = dx * ey - dy * ex >= 0 ? 1 : -1;
        best = { s: acc + t * l, d: side * dist, w, len, id: hash2(is.cellCol, is.cellRow, 977) };
      }
      acc += l;
    }
  }
  return best;
}
type ForestFn = (q: number, r: number, seed: number) => boolean;

// ---------- mountain variants ----------
const gen = DEFAULT_GENERATION;
const M: Record<string, { label: string; fn: MountainFn }> = {
  M0: {
    label: 'M0 current: ridged value noise (axial, scale 10)',
    fn: (q, r, t, seed) => {
      if (t >= gen.mountainThreshold) return false;
      const n = valueNoise(q, r, seed + 5, 10);
      const ridge = 1 - Math.abs(2 * n - 1);
      const fine = valueNoise(q, r, seed + 7, 2.5);
      return 0.88 * ridge + 0.12 * fine > gen.mountainRockiness;
    },
  },
  M1: {
    label: 'M1 ridged noise, cartesian+warp, region mask, pass gaps',
    fn: (q, r, t, seed) => {
      if (t >= 0.45) return false;
      const { x, y } = cart(q, r);
      const wx = x + (valueNoise(x, y, seed + 11, 30) - 0.5) * 16;
      const wy = y + (valueNoise(x, y, seed + 12, 30) - 0.5) * 16;
      const n = valueNoise(wx, wy, seed + 5, 22);
      const ridge = 1 - Math.abs(2 * n - 1);
      const mask = smoothstep(0.35, 0.6, valueNoise(x, y, seed + 13, 60)); // whole regions without ranges
      const gap = valueNoise(x, y, seed + 14, 7); // breaks the crest into segments (passes)
      const fine = valueNoise(x, y, seed + 7, 4);
      const v = ridge * mask * (0.55 + 0.45 * smoothstep(0.3, 0.55, gap)) + 0.1 * (fine - 0.5);
      return v > 0.78;
    },
  },
  M2: {
    label: 'M2 spine chain: main range along the spine (+ a 2nd on wide islands), passes from 1D noise',
    fn: (q, r, t, seed, sp) => chain(q, r, t, seed, sp, false),
  },
  M3: {
    label: 'M3 = M2 + side spurs (ridged noise only beside a massif)',
    fn: (q, r, t, seed, sp) => chain(q, r, t, seed, sp, true),
  },
  M2r: {
    label: 'M2r = M2 with a rougher rim and a livelier width profile',
    fn: (q, r, t, seed, sp) => chainR(q, r, t, seed, sp, 'none'),
  },
  M4: {
    label: 'M4 = M2r + tapered spur arms off the massifs',
    fn: (q, r, t, seed, sp) => chainR(q, r, t, seed, sp, 'arms'),
  },
  M5: {
    label: 'M5 = M2r + foothills (small hills beside the massifs)',
    fn: (q, r, t, seed, sp) => chainR(q, r, t, seed, sp, 'hills'),
  },
  M6: {
    label: 'M6 = M2r + short arms + a few foothills',
    fn: (q, r, t, seed, sp) => chainR(q, r, t, seed, sp, 'both'),
  },
};

/** M2r crest: width profile from two octaves along the spine, rim roughened by two fine octaves. */
function crestR(sp: Spine, seed: number, salt: number, offFrac: number, passBelow: number, maxHalf: number, sAt = sp.s) {
  const off = (offFrac + (valueNoise(sAt, sp.id * 1000 + salt, seed + 51, 45) - 0.5) * 0.7) * sp.w;
  const prof = 0.7 * valueNoise(sAt, sp.id * 1000 + salt, seed + 52, 13) + 0.3 * valueNoise(sAt, sp.id * 1000 + salt, seed + 53, 5);
  const k = (prof - passBelow) / (1 - passBelow);
  const half = k <= 0 ? 0 : 1.3 + maxHalf * Math.sqrt(k);
  const endFade = smoothstep(0, 0.1, Math.min(sAt, sp.len - sAt) / Math.max(1, sp.len));
  const scale = Math.min(1, sp.w / 22);
  return { off, half: half * endFade * scale };
}
function chainR(q: number, r: number, t: number, seed: number, sp: Spine | null, extra: 'none' | 'arms' | 'hills' | 'both'): boolean {
  if (!sp || t > 0.8) return false;
  const { x, y } = cart(q, r);
  const fine = 0.8 * (valueNoise(x, y, seed + 7, 3.5) - 0.5) + 0.2 * (valueNoise(x, y, seed + 8, 2.2) - 0.5);
  const defs: [number, number, number, number][] = [[0, 0, 0.36, 6.5]];
  if (sp.w > 26) defs.push([1, sp.id < 0.5 ? 0.55 : -0.55, 0.5, 4.5]);
  for (const [salt, offFrac, pass, maxHalf] of defs) {
    const c = crestR(sp, seed, salt, offFrac, pass, maxHalf);
    const dd = Math.abs(sp.d - c.off);
    if (dd < c.half * (1 + 0.8 * fine)) return true;
    if (extra === 'arms' || extra === 'both') {
      // spur arms: rooted every ~9 hexes along the crest at a massif, tapering away from it at an angle
      const step = 9;
      const k0 = Math.floor(sp.s / step);
      for (let kk = k0 - 2; kk <= k0 + 2; kk++) {
        const h = hash2(kk, salt, seed + 61 + Math.floor(sp.id * 1e5));
        if (h < (extra === 'both' ? 0.45 : 0.25)) continue;
        const s0 = (kk + 0.2 + 0.6 * hash2(kk, salt, seed + 62)) * step;
        const root = crestR(sp, seed, salt, offFrac, pass, maxHalf, s0);
        if (root.half < 2.5) continue; // arms only off a massif, never off a pass
        const side = hash2(kk, salt, seed + 63) < 0.5 ? -1 : 1;
        const tilt = (hash2(kk, salt, seed + 64) - 0.5) * 1.6; // -0.8..0.8 rad from the crest normal
        const len = (extra === 'both' ? 3 : 4) + (extra === 'both' ? 5 : 8) * hash2(kk, salt, seed + 65);
        const ax = s0;
        const ay = root.off + side * root.half * 0.6;
        const bx = ax + Math.sin(tilt) * (len + root.half * 0.4);
        const by = ay + side * Math.cos(tilt) * (len + root.half * 0.4);
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        let u = ((sp.s - ax) * dx + (sp.d - ay) * dy) / l2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dist = Math.hypot(sp.s - (ax + u * dx), sp.d - (ay + u * dy));
        const w = (0.55 * root.half) * (1 - u) + 0.7 * u;
        if (dist < w * (1 + 0.8 * fine)) return true;
      }
    }
    if ((extra === 'hills' || extra === 'both') && dd > c.half && dd < c.half + 9) {
      let hit = false;
      features(x, y, seed + 71 + salt, 7, (_fx, _fy, h, d) => {
        if (hit || h < (extra === 'both' ? 0.8 : 0.66)) return;
        if (d < (1.7 + 3.5 * (h - 0.66)) * (1 + 0.35 * fine)) hit = true;
      });
      if (hit && c.half > 1.5) return true;
    }
  }
  return false;
}

/** One crest: mountain if within the crest's half-width (0 at a pass). Returns the distance and half-width. */
function crest(sp: Spine, seed: number, salt: number, offFrac: number, passBelow: number, maxHalf: number) {
  const off = (offFrac + (valueNoise(sp.s, sp.id * 1000 + salt, seed + 51, 45) - 0.5) * 0.7) * sp.w;
  const prof = valueNoise(sp.s, sp.id * 1000 + salt, seed + 52, 13);
  const k = (prof - passBelow) / (1 - passBelow);
  const half = k <= 0 ? 0 : 1.5 + maxHalf * Math.sqrt(k);
  const endFade = smoothstep(0, 0.1, Math.min(sp.s, sp.len - sp.s) / Math.max(1, sp.len));
  const scale = Math.min(1, sp.w / 22);
  return { dd: Math.abs(sp.d - off), half: half * endFade * scale };
}
function chain(q: number, r: number, t: number, seed: number, sp: Spine | null, spurs: boolean): boolean {
  if (!sp || t > 0.8) return false;
  const { x, y } = cart(q, r);
  const fine = valueNoise(x, y, seed + 7, 3.5) - 0.5;
  const crests = [crest(sp, seed, 0, 0, 0.36, 6.5)];
  if (sp.w > 26) crests.push(crest(sp, seed, 1, sp.id < 0.5 ? 0.55 : -0.55, 0.5, 4.5));
  for (const c of crests) {
    if (c.dd < c.half * (1 + 0.45 * fine)) return true;
    if (spurs && c.half > 3 && c.dd < c.half + 8) {
      const n = valueNoise(x, y, seed + 24, 11);
      const ridge = 1 - Math.abs(2 * n - 1);
      if (ridge + 0.08 * fine > 0.86 + 0.012 * (c.dd - c.half)) return true;
    }
  }
  return false;
}

// ---------- forest variants ----------
const F: Record<string, { label: string; fn: ForestFn }> = {
  F0: {
    label: 'F0 current: value noise (axial, scale 6) > 0.52',
    fn: (q, r, seed) => valueNoise(q, r, seed + 2, 6) > gen.forestRockiness,
  },
  F1: {
    label: 'F1 same noise, cartesian + warp + rotated lattice',
    fn: (q, r, seed) => warpedNoise(q, r, seed + 2, 9, 2.5) > 0.525,
  },
  F2: {
    label: 'F2 groves: round woods on a jittered grid, noisy rim',
    fn: (q, r, seed) => {
      const { x, y } = cart(q, r);
      const fine = valueNoise(x, y, seed + 41, 3) - 0.5;
      let hit = false;
      features(x, y, seed + 43, 9.5, (_fx, _fy, h, d) => {
        if (hit) return;
        if (h < 0.32) return;
        const rad = 1.8 + 5.2 * h * h;
        if (d < rad * (1 + 0.45 * fine)) hit = true;
      });
      return hit;
    },
  },
  F5: {
    label: 'F5 = F2 groves + the densest F1 woods',
    fn: (q, r, seed) => F.F2!.fn(q, r, seed) || warpedNoise(q, r, seed + 2, 9, 2.5) > 0.74,
  },
  F6: {
    label: 'F6 groves clustered by F1: bigger and denser where F1 is high, sparse where low',
    fn: (q, r, seed) => {
      const { x, y } = cart(q, r);
      const fine = valueNoise(x, y, seed + 41, 3) - 0.5;
      const n = warpedNoise(q, r, seed + 2, 14, 3); // the F1 field, wider
      let hit = false;
      features(x, y, seed + 43, 8.5, (fx, fy, h, d) => {
        if (hit) return;
        const nf = warpedNoise(fx / 1.5, fy / Math.sqrt(3) - fx / 3, seed + 2, 14, 3);
        if (h < 1.2 - 1.3 * nf) return; // fewer groves in the meadow regions
        const rad = (1.6 + 4.2 * h * h) * (0.75 + 0.9 * nf);
        if (d < rad * (1 + 0.45 * fine)) hit = true;
      });
      return hit || n > 0.74;
    },
  },
  F7: {
    label: 'F7 smooth blend: 0.65 grove field + 0.35 F1 noise',
    fn: (q, r, seed) => {
      const { x, y } = cart(q, r);
      const fine = valueNoise(x, y, seed + 41, 3) - 0.5;
      let g = 0;
      features(x, y, seed + 43, 9.5, (_fx, _fy, h, d) => {
        if (h < 0.32) return;
        const rad = 1.8 + 5.2 * h * h;
        g = Math.max(g, 1 - d / (rad * 1.6));
      });
      const n = warpedNoise(q, r, seed + 2, 9, 2.5);
      return 0.65 * g + 0.35 * n + 0.12 * fine > 0.43;
    },
  },
};

// ---------- terrain from a variant ----------
interface Variant {
  id: string;
  label: string;
  m: MountainFn;
  f: ForestFn;
}
function makeTerrain(world: WorldSeed, v: Variant) {
  const shapes = enumerateIslandShapes(world);
  const cache = new Map<number, Terrain>();
  return (q: number, r: number): Terrain => {
    const k = q * 100003 + r;
    const hit = cache.get(k);
    if (hit) return hit;
    const base = terrainAt(q, r, world);
    let out: Terrain = base;
    if (base !== 'sea' && base !== 'sand') {
      const t = islandDepthAt(q, r, world)!;
      out = v.m(q, r, t, world.seed, spineOf(shapes, q, r)) ? 'mountain' : v.f(q, r, world.seed) ? 'forest' : 'grass';
    }
    cache.set(k, out);
    return out;
  };
}

const variants: Variant[] = [
  { id: 'M0F0', label: `${M.M0.label} | ${F.F0.label}`, m: M.M0.fn, f: F.F0.fn },
  { id: 'M1F0', label: M.M1.label, m: M.M1.fn, f: F.F0.fn },
  { id: 'M2F0', label: M.M2.label, m: M.M2.fn, f: F.F0.fn },
  { id: 'M3F0', label: M.M3.label, m: M.M3.fn, f: F.F0.fn },
  { id: 'M0F1', label: F.F1.label, m: M.M0.fn, f: F.F1.fn },
  { id: 'M0F2', label: F.F2.label, m: M.M0.fn, f: F.F2.fn },
  { id: 'M3F1', label: 'M3 + F1 (combined proposal)', m: M.M3.fn, f: F.F1.fn },
  { id: 'M3F2', label: 'M3 + F2', m: M.M3.fn, f: F.F2.fn },
].filter((v) => !only || only.split(',').includes(v.id));
if (only) {
  for (const id of only.split(',')) {
    if (variants.some((v) => v.id === id)) continue;
    const m = /^(M\w+?)(F\d+)$/.exec(id);
    if (!m || !M[m[1]!] || !F[m[2]!]) throw new Error(`unknown variant ${id}`);
    variants.push({ id, label: `${M[m[1]!]!.label} | ${F[m[2]!]!.label}`, m: M[m[1]!]!.fn, f: F[m[2]!]!.fn });
  }
  variants.sort((a, b) => only.split(',').indexOf(a.id) - only.split(',').indexOf(b.id));
}

// ---------- metrics ----------
const k = (q: number, r: number) => `${q},${r}`;
function islandMetrics(tiles: { q: number; r: number }[], ter: (q: number, r: number) => Terrain) {
  const set = new Set(tiles.map((t) => k(t.q, t.r)));
  let mountain = 0;
  let forest = 0;
  for (const t of tiles) {
    const v = ter(t.q, t.r);
    if (v === 'mountain') mountain++;
    else if (v === 'forest') forest++;
  }
  // mountain ranges (connected components) and forest patches
  const comps = (want: Terrain) => {
    const seen = new Set<string>();
    const sizes: number[] = [];
    let perimeter = 0;
    for (const t of tiles) {
      if (ter(t.q, t.r) !== want || seen.has(k(t.q, t.r))) continue;
      let n = 0;
      const stack = [t];
      seen.add(k(t.q, t.r));
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        for (const nb of neighbors(c)) {
          const kk = k(nb.q, nb.r);
          if (!set.has(kk) || ter(nb.q, nb.r) !== want) {
            perimeter++;
            continue;
          }
          if (seen.has(kk)) continue;
          seen.add(kk);
          stack.push(nb);
        }
      }
      sizes.push(n);
    }
    return { sizes, perimeter };
  };
  const mc = comps('mountain');
  const fc = comps('forest');
  // cut-off walkable land: flood from tiles touching the sea through non-mountain land
  const reached = new Set<string>();
  const stack: { q: number; r: number }[] = [];
  for (const t of tiles) {
    if (ter(t.q, t.r) === 'mountain') continue;
    if (neighbors(t).some((nb) => !set.has(k(nb.q, nb.r)))) {
      reached.add(k(t.q, t.r));
      stack.push(t);
    }
  }
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of neighbors(c)) {
      const kk = k(nb.q, nb.r);
      if (!set.has(kk) || reached.has(kk) || ter(nb.q, nb.r) === 'mountain') continue;
      reached.add(kk);
      stack.push(nb);
    }
  }
  const walkable = tiles.length - mountain;
  return {
    land: tiles.length,
    mountain,
    forest,
    ranges: mc.sizes.filter((s) => s >= 4).length,
    largestRange: Math.max(0, ...mc.sizes),
    mountainEdge: mc.perimeter,
    forestPatches: fc.sizes.filter((s) => s >= 3).length,
    forestEdge: fc.perimeter,
    cutOff: walkable - reached.size,
  };
}

// ---------- rendering ----------
const COL: Record<string, [number, number, number]> = {
  sea: [29, 52, 76],
  sand: [222, 205, 150],
  grass: [104, 156, 74],
  forest: [43, 94, 52],
  mountain: [140, 128, 118],
  bog: [120, 120, 60],
  lake: [30, 40, 110],
  cut: [200, 70, 60],
};
function hexRound(q: number, r: number) {
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
  return { q: rx, r: rz };
}
function renderPanel(
  tiles: { q: number; r: number }[],
  ter: (q: number, r: number) => Terrain,
  overlay: Map<string, [number, number, number]>,
) {
  const pad = 6;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of tiles) {
    const c = cart(t.q, t.r);
    x0 = Math.min(x0, c.x - pad); x1 = Math.max(x1, c.x + pad); y0 = Math.min(y0, c.y - pad); y1 = Math.max(y1, c.y + pad);
  }
  // trim y to the land actually there: compute from tiles is done by caller bounds; keep simple
  const w = Math.ceil((x1 - x0) * px);
  const h = Math.ceil((y1 - y0) * px);
  const rgb = new Uint8Array(w * h * 3);
  for (let py = 0; py < h; py++)
    for (let pxl = 0; pxl < w; pxl++) {
      const x = x0 + pxl / px;
      const y = y0 + py / px;
      const fq = x / 1.5;
      const fr = y / SQ3 - fq / 2;
      const { q, r } = hexRound(fq, fr);
      const c = overlay.get(k(q, r)) ?? COL[ter(q, r)]!;
      const i = (py * w + pxl) * 3;
      rgb[i] = c[0];
      rgb[i + 1] = c[1];
      rgb[i + 2] = c[2];
    }
  return { w, h, rgb };
}
function compose(rows: { w: number; h: number; rgb: Uint8Array; title: string }[][]) {
  const titleH = 14;
  const gapPx = 6;
  const colW: number[] = [];
  for (const row of rows) row.forEach((p, i) => (colW[i] = Math.max(colW[i] ?? 0, p.w)));
  const W = colW.reduce((a, b) => a + b + gapPx, gapPx);
  const rowH = rows.map((row) => Math.max(...row.map((p) => p.h)) + titleH);
  const H = rowH.reduce((a, b) => a + b + gapPx, gapPx);
  const rgb = new Uint8Array(W * H * 3).fill(16);
  let oy = gapPx;
  rows.forEach((row, ri) => {
    let ox = gapPx;
    row.forEach((p, ci) => {
      drawText(rgb, W, H, ox, oy + 2, p.title.toUpperCase(), [230, 230, 230]);
      for (let y = 0; y < p.h; y++) rgb.set(p.rgb.subarray(y * p.w * 3, (y + 1) * p.w * 3), ((oy + titleH + y) * W + ox) * 3);
      ox += colW[ci]! + gapPx;
    });
    oy += rowH[ri]! + gapPx;
  });
  return encodePng(W, H, rgb);
}

// ---------- run ----------
type Acc = Record<string, number>;
const totals: Record<string, Acc> = {};
for (let seed = from; seed <= to; seed++) {
  const world: WorldSeed = { seed, generation: { ...DEFAULT_GENERATION, worldRadius: radius } };
  const { landmasses } = findLandmasses(world, false, true);
  const kept = landmasses.filter((l) => l.tiles >= 6);
  const showcase = [...kept].sort((a, b) => b.tiles - a.tiles).slice(0, panels);
  const rows: { w: number; h: number; rgb: Uint8Array; title: string }[][] = showcase.map(() => []);
  for (const v of variants) {
    const ter = makeTerrain(world, v);
    const acc = (totals[v.id] ??= {});
    const add = (key: string, n: number) => (acc[key] = (acc[key] ?? 0) + n);
    const overlays = new Map<number, Map<string, [number, number, number]>>();
    kept.forEach((island, index) => {
      const tiles = island.tileList!;
      const m = islandMetrics(tiles, ter);
      for (const [kk, n] of Object.entries(m)) if (kk !== 'largestRange') add(kk, n);
      if (tiles.length >= 3000) add('bigLargestShare', m.largestRange / Math.max(1, m.mountain));
      add('islands', 1);
      if (tiles.length >= 3000) add('bigIslands', 1);
      const ov = new Map<string, [number, number, number]>();
      if (doBogs) {
        const stats = emptyRiverStats();
        const { bogs, rivers } = generateRiversWithBogs(
          tiles,
          (c) => ter(c.q, c.r),
          (c) => islandDepthAt(c.q, c.r, world),
          (c) => terrainAt(c.q, c.r, world) !== 'sea',
          world.seed,
          index,
          false,
          true,
          stats,
        );
        add('bogTiles', bogs.length);
        add('bogSites', stats.sites + stats.pocketsFilled + stats.guaranteeThrough + stats.guaranteeSpawns);
        add('spawnBogs', stats.spawns + stats.guaranteeSpawns);
        add('sinkBogs', stats.sinks);
        if (bogs.length > 0) add('islandsWithBog', 1);
        add('violations', totalViolations(checkBogRules(bogs, rivers, (c) => ter(c.q, c.r))));
        if (tiles.length >= 3000) {
          // coverage: land within BOG_REACH (12) of a bog tile; and the 90th percentile distance to bog
          const set = new Set(tiles.map((t) => k(t.q, t.r)));
          const dist = new Map<string, number>();
          let frontier = bogs.map((b) => ({ q: b.q, r: b.r }));
          for (const b of frontier) dist.set(k(b.q, b.r), 0);
          for (let d = 1; frontier.length && d <= 60; d++) {
            const next: { q: number; r: number }[] = [];
            for (const c of frontier)
              for (const nb of neighbors(c)) {
                const kk = k(nb.q, nb.r);
                if (!set.has(kk) || dist.has(kk)) continue;
                dist.set(kk, d);
                next.push(nb);
              }
            frontier = next;
          }
          const ds = tiles.map((t) => dist.get(k(t.q, t.r)) ?? 61).sort((a, b) => a - b);
          add('cov12', ds.filter((d) => d <= 12).length);
          add('cov8', ds.filter((d) => d <= 8).length);
          add('p99', ds[Math.floor(ds.length * 0.99)]!);
          add('bigLand', tiles.length);
          add('p90', ds[Math.floor(ds.length * 0.9)]!);
          add('bigBogs', stats.sites + stats.pocketsFilled + stats.guaranteeThrough + stats.guaranteeSpawns);
        }
        if (tiles.length >= 3000) {
          if (bogs.length > 0) add('bigWithBog', 1);
        }
        if (process.env.LAB_DRAW_RIVERS) for (const rt of rivers) ov.set(k(rt.q, rt.r), [120, 190, 235]);
        for (const b of bogs) ov.set(k(b.q, b.r), b.kind === 'lake' || String(b.kind).startsWith('lake') ? COL.lake! : COL.bog!);
      }
      overlays.set(index, ov);
    });
    showcase.forEach((island, i) => {
      const index = kept.indexOf(island);
      const p = renderPanel(island.tileList!, ter, overlays.get(index)!);
      writeFileSync(join(outDir, `s${seed}-i${i}-${v.id}.png`), encodePng(p.w, p.h, p.rgb));
      const m = islandMetrics(island.tileList!, ter);
      rows[i]!.push({
        ...p,
        title: `${v.id} seed ${seed} isl ${index}: mtn ${((100 * m.mountain) / m.land).toFixed(0)}% ranges ${m.ranges} max ${m.largestRange} cut ${m.cutOff} forest ${((100 * m.forest) / m.land).toFixed(0)}%`,
      });
    });
    console.log(`seed ${seed} ${v.id} done`);
  }
  writeFileSync(join(outDir, `lab-seed${seed}.png`), compose(rows));
}

console.log('\nvariant | mountain% | ranges/10k land | largest range share of mtn (3000+ isl) | mtn edge/tile | cut-off walkable% | forest% | forest patches/10k | forest edge/tile | bog tiles% | bogs | islands w/ bog | 3000+ islands w/ bog | 3000+: land within 12 of bog | 3000+: bogs per 10k | 3000+: mean p90 dist to bog | rule violations | 3000+: land within 8 | 3000+: mean p99 dist | spawn+sink share');
for (const v of variants) {
  const a = totals[v.id]!;
  console.log(
    [
      v.id,
      ((100 * a.mountain) / a.land).toFixed(1),
      ((1e4 * a.ranges) / a.land).toFixed(1),
      ((100 * (a.bigLargestShare ?? 0)) / Math.max(1, a.bigIslands ?? 1)).toFixed(0) + '%',
      (a.mountainEdge / Math.max(1, a.mountain)).toFixed(2),
      ((100 * a.cutOff) / (a.land - a.mountain)).toFixed(2),
      ((100 * a.forest) / a.land).toFixed(1),
      ((1e4 * a.forestPatches) / a.land).toFixed(1),
      (a.forestEdge / Math.max(1, a.forest)).toFixed(2),
      (((a.bogTiles ?? 0) * 100) / a.land).toFixed(2),
      a.bogSites ?? '-',
      `${a.islandsWithBog ?? 0}/${a.islands}`,
      `${a.bigWithBog ?? 0}/${a.bigIslands ?? 0}`,
      a.bigLand ? ((100 * a.cov12) / a.bigLand).toFixed(1) + '%' : '-',
      a.bigLand ? ((1e4 * a.bigBogs) / a.bigLand).toFixed(2) : '-',
      a.bigLand ? (a.p90 / a.bigIslands).toFixed(1) : '-',
      a.violations ?? '-',
      a.bigLand ? ((100 * a.cov8) / a.bigLand).toFixed(1) + '%' : '-',
      a.bigLand ? (a.p99 / a.bigIslands).toFixed(1) : '-',
      a.bogSites ? ((100 * ((a.spawnBogs ?? 0) + (a.sinkBogs ?? 0))) / (a.bogSites - 0)).toFixed(1) + '%' : '-',
    ].join(' | '),
  );
}
