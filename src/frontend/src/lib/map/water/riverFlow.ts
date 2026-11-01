// The river flow field (docs/design/water-shader.md §4.4d).
//
// Given a river frame's half-resolution water mask (riverMaskCore.ts) and the
// tile's downstream edge, this computes, per mask texel, which way the water
// runs. The direction is the negative gradient of the geodesic distance to
// the out edge through the painted water, so meanders, the 60-degree loop,
// islands and confluences are followed as painted. Pure: no Pixi, no DOM.
import { isoTopPoints, type Point } from '../../hex/geometry';
import { TILE_ART_NATIVE_W, TILE_ART_TOPFACE_H_FRAC, TILE_ART_TOPFACE_Y_FRAC } from '../textures';

/** A texel counts as water at this mask value. */
export const WATER_THRESHOLD = 128;
/** Cost multiplier for a step off the water: lets the field cross a bridge deck or mill wheel without cutting across the grass neck of a loop. */
export const NON_WATER_COST = 40;
/** Texels from the bank over which the flow intensity ramps from 0 to 1. */
export const BANK_FADE_TEXELS = 4;
/**
 * Texels from the out edge segment within which water texels seed the distance field, counted from the water closest to the
 * edge: a frame's art can stop a few texels short of the edge it flows out of (the river delta's trimmed canvas), and then the
 * water nearest the edge seeds.
 */
export const SEED_REACH = 2;
/**
 * Extra cost of travelling along the bank: the cost of a water texel is `1 + BANK_PENALTY * max(0, 1 - bankDistance / BANK_PENALTY_REACH)`.
 * Plain shortest paths cut the inside corner of a bend and run along its bank; a dearer bank keeps the field (and the streaks
 * drawn along it) in the middle of the channel.
 */
export const BANK_PENALTY = 4;
export const BANK_PENALTY_REACH = 8;
/** Box-blur passes over the direction vectors. */
export const BLUR_PASSES = 2;

export interface RiverFlowInput {
  /** The half-resolution mask cell, `cw * ch` bytes (255 = water). */
  mask: Uint8Array;
  cw: number;
  ch: number;
  /** The hex top face in cell texel coordinates, six points (see `topFacePolygonTexels`). */
  polygon: readonly Point[];
  /** Index of the downstream edge: polygon edge `i` runs `polygon[i]..polygon[i+1]`. */
  outEdge: number;
  /**
   * Edge to fade the flow away from (the creek edge of a bog lake mouth): the intensity falls to 0 over half a hex width of
   * geodesic distance from it, so the lake stays still. Generic: "fade away from edge E".
   */
  fadeEdge?: number;
}

/**
 * The hex top face (`isoTopPoints` of the art's top-face size, shifted down to where the art draws it) in the texel
 * coordinates of the mask cell whose source rect starts at (sx, sy): two source px per texel.
 */
export function topFacePolygonTexels(sx: number, sy: number): Point[] {
  const w = TILE_ART_NATIVE_W;
  const offsetY = w * TILE_ART_TOPFACE_Y_FRAC;
  return isoTopPoints(w, w * TILE_ART_TOPFACE_H_FRAC).map((p) => ({ x: (p.x - sx) / 2, y: (p.y + offsetY - sy) / 2 }));
}

function pointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Min-heap of (cost, index) pairs, for Dijkstra. */
class Heap {
  private costs: number[] = [];
  private items: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(cost: number, item: number): void {
    let i = this.items.length;
    this.costs.push(cost);
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent]! <= cost) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): { cost: number; item: number } {
    const top = { cost: this.costs[0]!, item: this.items[0]! };
    const lastCost = this.costs.pop()!;
    const lastItem = this.items.pop()!;
    if (this.items.length > 0) {
      this.costs[0] = lastCost;
      this.items[0] = lastItem;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.costs[l]! < this.costs[m]!) m = l;
        if (r < this.items.length && this.costs[r]! < this.costs[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.costs[a], this.costs[b]] = [this.costs[b]!, this.costs[a]!];
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
  }
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Which texels are inside the top face (centre in the polygon), and which are passable (inside, padded by one texel). */
function faceMasks(input: RiverFlowInput): { inside: Uint8Array; passable: Uint8Array } {
  const { cw, ch, polygon } = input;
  const inside = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) inside[y * cw + x] = 1;
    }
  }
  const passable = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      for (let dy = -1; dy <= 1 && !passable[y * cw + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < cw && yy >= 0 && yy < ch && inside[yy * cw + xx]) {
            passable[y * cw + x] = 1;
            break;
          }
        }
      }
    }
  }
  return { inside, passable };
}

/**
 * Geodesic distance (texel units) from the water texels next to polygon edge `edge`, through the passable texels of the top
 * face. Off-water steps cost `NON_WATER_COST` times as much. Unreached texels are `Infinity`.
 */
function geodesic(input: RiverFlowInput, passable: Uint8Array, bank: Float32Array, edge: number): Float64Array {
  const { mask, cw, ch, polygon } = input;
  const a = polygon[edge]!;
  const b = polygon[(edge + 1) % polygon.length]!;
  const dist = new Float64Array(cw * ch).fill(Infinity);
  const heap = new Heap();
  const edgeDistance = new Float64Array(cw * ch).fill(Infinity);
  let nearest = Infinity;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!passable[p] || mask[p]! < WATER_THRESHOLD) continue;
      edgeDistance[p] = distToSegment(x + 0.5, y + 0.5, a, b);
      nearest = Math.min(nearest, edgeDistance[p]!);
    }
  }
  for (let p = 0; p < edgeDistance.length; p++) {
    if (edgeDistance[p]! <= nearest + SEED_REACH) {
      dist[p] = 0;
      heap.push(0, p);
    }
  }
  // Fast marching (the heap-driven upwind eikonal solver): like Dijkstra, but the distance of a texel comes from both axis
  // neighbours, so it is a Euclidean-accurate front instead of the 8-way staircase of a plain grid walk, and its gradient
  // does not lean towards the grid diagonals.
  const done = new Uint8Array(cw * ch);
  const solve = (x: number, y: number): number => {
    const cost = mask[y * cw + x]! >= WATER_THRESHOLD ? 1 + BANK_PENALTY * Math.max(0, 1 - bank[y * cw + x]! / BANK_PENALTY_REACH) : NON_WATER_COST;
    const axis = (x0: number, y0: number, x1: number, y1: number) => {
      const lo = x0 >= 0 && x0 < cw && y0 >= 0 && y0 < ch && done[y0 * cw + x0] ? dist[y0 * cw + x0]! : Infinity;
      const hi = x1 >= 0 && x1 < cw && y1 >= 0 && y1 < ch && done[y1 * cw + x1] ? dist[y1 * cw + x1]! : Infinity;
      return Math.min(lo, hi);
    };
    const tx = axis(x - 1, y, x + 1, y);
    const ty = axis(x, y - 1, x, y + 1);
    const lo = Math.min(tx, ty);
    const hi = Math.max(tx, ty);
    if (hi - lo >= cost) return lo + cost;
    return (lo + hi + Math.sqrt(2 * cost * cost - (hi - lo) * (hi - lo))) / 2;
  };
  while (heap.size > 0) {
    const { cost, item } = heap.pop();
    if (done[item] || cost > dist[item]!) continue;
    done[item] = 1;
    const x = item % cw;
    const y = (item - x) / cw;
    for (const [dx, dy] of NEIGHBOURS.slice(0, 4)) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= cw || yy < 0 || yy >= ch) continue;
      const q = yy * cw + xx;
      if (!passable[q] || done[q]) continue;
      const next = solve(xx, yy);
      if (next < dist[q]!) {
        dist[q] = next;
        heap.push(next, q);
      }
    }
  }
  return dist;
}

/** The geodesic distance field to `edge`, exposed for tests and tooling. */
export function riverGeodesicDistance(input: RiverFlowInput, edge: number): Float64Array {
  const { passable } = faceMasks(input);
  return geodesic(input, passable, distanceToBank(input, passable), edge);
}

/** Two-pass chamfer distance (texels) from each water texel to the nearest non-water texel of the padded face; 0 off water. */
function distanceToBank(input: RiverFlowInput, passable: Uint8Array): Float32Array {
  const { mask, cw, ch } = input;
  const far = 1e6;
  const d = new Float32Array(cw * ch);
  for (let p = 0; p < d.length; p++) d[p] = mask[p]! >= WATER_THRESHOLD || !passable[p] ? far : 0;
  const relax = (x: number, y: number, dx: number, dy: number, step: number) => {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || xx >= cw || yy < 0 || yy >= ch) return;
    const v = d[yy * cw + xx]! + step;
    if (v < d[y * cw + x]!) d[y * cw + x] = v;
  };
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      relax(x, y, -1, 0, 1);
      relax(x, y, 0, -1, 1);
      relax(x, y, -1, -1, Math.SQRT2);
      relax(x, y, 1, -1, Math.SQRT2);
    }
  }
  for (let y = ch - 1; y >= 0; y--) {
    for (let x = cw - 1; x >= 0; x--) {
      relax(x, y, 1, 0, 1);
      relax(x, y, 0, 1, 1);
      relax(x, y, 1, 1, Math.SQRT2);
      relax(x, y, -1, 1, Math.SQRT2);
    }
  }
  return d;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The flow texture of one river frame cell: RGBA8, `cw * ch * 4` bytes, premultiplied.
 *
 * R, G = unit flow direction * 0.5 + 0.5 (art space, +y down; 0.5 where not water). B = intensity: the distance to the bank
 * over `BANK_FADE_TEXELS`, 0 off water. A = 255 inside the top face, 0 outside. Top faces tessellate exactly, so cells of
 * neighbouring hexes that overlap outside their own face never draw over each other.
 */
export function computeRiverFlow(input: RiverFlowInput): Uint8Array {
  const { mask, cw, ch, outEdge, fadeEdge } = input;
  const { inside, passable } = faceMasks(input);
  const isWater = (x: number, y: number) => x >= 0 && x < cw && y >= 0 && y < ch && mask[y * cw + x]! >= WATER_THRESHOLD && passable[y * cw + x] === 1;
  const bank = distanceToBank(input, passable);
  const dist = geodesic(input, passable, bank, outEdge);

  // Negative gradient of the distance over water neighbours: central differences, one-sided where only one side is water.
  const vx = new Float32Array(cw * ch);
  const vy = new Float32Array(cw * ch);
  const reach = (x: number, y: number) => isWater(x, y) && Number.isFinite(dist[y * cw + x]!);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!reach(x, y)) continue;
      const here = dist[p]!;
      const axis = (lo: boolean, hi: boolean, dLo: number, dHi: number) => (lo && hi ? (dHi - dLo) / 2 : hi ? dHi - here : lo ? here - dLo : 0);
      const gx = axis(reach(x - 1, y), reach(x + 1, y), reach(x - 1, y) ? dist[p - 1]! : 0, reach(x + 1, y) ? dist[p + 1]! : 0);
      const gy = axis(reach(x, y - 1), reach(x, y + 1), reach(x, y - 1) ? dist[p - cw]! : 0, reach(x, y + 1) ? dist[p + cw]! : 0);
      vx[p] = -gx;
      vy[p] = -gy;
    }
  }
  const raw = { x: vx.slice(), y: vy.slice() };

  // Blur restricted to water texels, then normalise.
  let bx = vx;
  let by = vy;
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    const nx = new Float32Array(cw * ch);
    const ny = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!reach(x, y)) continue;
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!reach(x + dx, y + dy)) continue;
            sx += bx[(y + dy) * cw + x + dx]!;
            sy += by[(y + dy) * cw + x + dx]!;
            n++;
          }
        }
        nx[y * cw + x] = sx / n;
        ny[y * cw + x] = sy / n;
      }
    }
    bx = nx;
    by = ny;
  }

  const fade = fadeEdge === undefined ? null : geodesic(input, passable, bank, fadeEdge);
  const fadeLength = (Math.max(...input.polygon.map((p) => p.x)) - Math.min(...input.polygon.map((p) => p.x))) / 2;

  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!inside[p]) continue;
      const o = p * 4;
      out[o] = 128;
      out[o + 1] = 128;
      out[o + 3] = 255;
      if (!reach(x, y)) continue;
      let dx = bx[p]!;
      let dy = by[p]!;
      let len = Math.hypot(dx, dy);
      if (len < 1e-6) {
        dx = raw.x[p]!;
        dy = raw.y[p]!;
        len = Math.hypot(dx, dy);
      }
      if (len < 1e-6) continue;
      let intensity = Math.min(1, Math.max(0, bank[p]! / BANK_FADE_TEXELS));
      if (fade) intensity *= 1 - smoothstep(0, fadeLength, fade[p]!);
      out[o] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(intensity * 255);
    }
  }
  return out;
}
