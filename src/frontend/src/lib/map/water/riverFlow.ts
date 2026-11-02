// The river flow field (docs/design/water-shader.md §4.4d).
//
// Given a river frame's half-resolution water mask (riverMaskCore.ts) and the
// tile's upstream and downstream edges, this computes, per mask texel, which way
// the water runs. The direction is the negative gradient of a harmonic potential
// solved over the painted water (potential flow: 1 at the in edges, 0 at the out
// edge, no flux through the banks), so meanders, the 60-degree loop, islands and
// confluences are followed as painted, the flow crosses every in/out edge
// perpendicular to it (neighbouring hexes agree there) and, unlike a distance
// field, it has no cut locus. Pure: no Pixi, no DOM.
import { isoTopPoints, type Point } from '../../hex/geometry';
import { TILE_ART_NATIVE_W, TILE_ART_TOPFACE_H_FRAC, TILE_ART_TOPFACE_Y_FRAC } from '../textures';
import { groundSquash } from './waterMask';

/**
 * The art is isometric: the top face is drawn `GROUND_SQUASH` (about 0.53) as tall as the ground it lies on. Everything that
 * measures or solves on the ground (the potential's Laplacian, the flow direction, distances, the crossing direction of an edge)
 * does so in ground space, (x, y / GROUND_SQUASH). Lengths named "texels" below are ground texels: one texel along x.
 */
export const GROUND_SQUASH = groundSquash(TILE_ART_NATIVE_W, TILE_ART_NATIVE_W * TILE_ART_TOPFACE_H_FRAC);

/** A texel counts as water at this mask value. */
export const WATER_THRESHOLD = 128;
/**
 * Off the water a step costs this many times as much (the geodesic fade distance) and conducts this many times less (the
 * potential): lets the field cross a bridge deck or mill wheel that spans the whole channel, so the upstream half is not cut
 * off, without leaking across the grass neck of the 60-degree loop.
 */
export const NON_WATER_COST = 40;
/** Ground texels from the bank over which the flow intensity ramps from 0 to 1. */
export const BANK_FADE_TEXELS = 4;
/**
 * Texels from an edge segment within which water texels seed the potential (and the fade distance), counted from the water
 * closest to the edge: a frame's art can stop a few texels short of the edge it flows through (the river delta's trimmed
 * canvas), and then the water nearest the edge seeds.
 */
export const SEED_REACH = 2;
/**
 * A dry texel closer than this to an in/out edge segment is not a bank: the art's water stops a texel or two short of the top
 * face edge, and that dry rim must not fade the flow to nothing at every seam.
 */
export const EDGE_RIM_TEXELS = 3;
/** Red-black SOR over-relaxation factor, convergence tolerance (largest update of a sweep) and sweep cap. */
export const SOR_OMEGA = 1.9;
export const SOR_TOLERANCE = 1e-5;
export const SOR_MAX_SWEEPS = 6000;

/** A vertical link in screen texels conducts this much (ground space: `phi_xx + s^2 phi_yy = 0`). */
const VERTICAL_CONDUCTANCE = GROUND_SQUASH * GROUND_SQUASH;

export interface RiverFlowInput {
  /** The half-resolution mask cell, `cw * ch` bytes (255 = water). */
  mask: Uint8Array;
  cw: number;
  ch: number;
  /** The hex top face in cell texel coordinates, six points (see `topFacePolygonTexels`). */
  polygon: readonly Point[];
  /** Indices of the upstream edges (potential 1); empty for a spring, which is fed by a uniform source instead. */
  inEdges: readonly number[];
  /** Index of the downstream edge (potential 0): polygon edge `i` runs `polygon[i]..polygon[i+1]`. */
  outEdge: number;
  /**
   * Edge to fade the flow away from (the creek edge of a bog lake mouth): the intensity falls to 0 over half a hex width of
   * geodesic distance from it, so the lake stays still. Generic: "fade away from edge E". Only an intensity, not a direction.
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

/**
 * The direction (screen space, unit) in which water crosses polygon edge `edge`, out of the face: from the hex centre to the
 * edge's midpoint. On the ground that is the edge's normal; the isometric squash keeps "centre to midpoint" a straight line, so
 * its screen projection is just the screen vector. (The screen perpendicular of a slanted edge is about 30 degrees off.)
 */
function crossingDirection(polygon: readonly Point[], edge: number): Point {
  const a = polygon[edge]!;
  const b = polygon[(edge + 1) % polygon.length]!;
  const c = polygon.reduce((acc, p) => ({ x: acc.x + p.x / polygon.length, y: acc.y + p.y / polygon.length }), { x: 0, y: 0 });
  const dx = (a.x + b.x) / 2 - c.x;
  const dy = (a.y + b.y) / 2 - c.y;
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
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

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Texels past an in or out edge of the top face that still belong to the hex's cell. The art's own water stops 1-2 texels
 * short of the face edge, and what shows at a seam is the neighbouring hex's skirt under it; a cell clipped exactly to its
 * face leaves that strip without flow, a dark line along every seam. Only the edges the water crosses get the rim: past any
 * other edge lies a neighbour's land, which the river's own skirt water must not be drawn onto. The rims of two
 * neighbouring river cells overlap; the field crosses the shared edge at a right angle in both, so whichever is drawn last
 * makes no difference.
 */
export const FACE_PAD_TEXELS = 2;

/**
 * Which texels are inside the top face (centre in the polygon), `padded` (inside plus one texel all round: where edge seeds
 * are picked, so the rim does not move the seed band off the face), which are passable for the solver (padded plus the
 * rim along the in and out edges), and which the cell covers (inside plus that rim).
 */
function faceMasks(input: RiverFlowInput): { inside: Uint8Array; padded: Uint8Array; passable: Uint8Array; cover: Uint8Array } {
  const { cw, ch, polygon } = input;
  const inside = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) inside[y * cw + x] = 1;
    }
  }
  const flowEdges = [...input.inEdges, input.outEdge];
  const cover = inside.slice();
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (cover[p]) continue;
      for (const e of flowEdges) {
        if (distToSegment(x + 0.5, y + 0.5, polygon[e]!, polygon[(e + 1) % polygon.length]!) <= FACE_PAD_TEXELS) {
          cover[p] = 1;
          break;
        }
      }
    }
  }
  const padded = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      for (let dy = -1; dy <= 1 && !padded[y * cw + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < cw && yy >= 0 && yy < ch && inside[yy * cw + xx]) {
            padded[y * cw + x] = 1;
            break;
          }
        }
      }
    }
  }
  const passable = new Uint8Array(cw * ch);
  for (let p = 0; p < passable.length; p++) passable[p] = padded[p]! | cover[p]!;
  return { inside, padded, passable, cover };
}


/** The water texels that seed edge `edge`: those within `SEED_REACH` of the water closest to the edge segment. */
function edgeSeeds(input: RiverFlowInput, passable: Uint8Array, edge: number): number[] {
  const { mask, cw, ch, polygon } = input;
  const a = polygon[edge]!;
  const b = polygon[(edge + 1) % polygon.length]!;
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
  const seeds: number[] = [];
  if (!Number.isFinite(nearest)) return seeds;
  for (let p = 0; p < edgeDistance.length; p++) if (edgeDistance[p]! <= nearest + SEED_REACH) seeds.push(p);
  return seeds;
}

/**
 * Geodesic distance (texel units) from the water texels next to polygon edge `edge`, through the passable texels of the top
 * face. Off-water steps cost `NON_WATER_COST` times as much. Unreached texels are `Infinity`. Used for the lake fade only.
 */
function geodesic(input: RiverFlowInput, passable: Uint8Array, edge: number): Float64Array {
  const { mask, cw, ch } = input;
  const dist = new Float64Array(cw * ch).fill(Infinity);
  const heap = new Heap();
  for (const p of edgeSeeds(input, passable, edge)) {
    dist[p] = 0;
    heap.push(0, p);
  }
  // Fast marching (the heap-driven upwind eikonal solver): like Dijkstra, but the distance of a texel comes from both axis
  // neighbours, so it is a Euclidean-accurate front instead of the 8-way staircase of a plain grid walk.
  const done = new Uint8Array(cw * ch);
  const hy = 1 / GROUND_SQUASH; // one texel down is 1 / squash ground texels
  const solve = (x: number, y: number): number => {
    const cost = mask[y * cw + x]! >= WATER_THRESHOLD ? 1 : NON_WATER_COST;
    const axis = (x0: number, y0: number, x1: number, y1: number) => {
      const lo = x0 >= 0 && x0 < cw && y0 >= 0 && y0 < ch && done[y0 * cw + x0] ? dist[y0 * cw + x0]! : Infinity;
      const hi = x1 >= 0 && x1 < cw && y1 >= 0 && y1 < ch && done[y1 * cw + x1] ? dist[y1 * cw + x1]! : Infinity;
      return Math.min(lo, hi);
    };
    const tx = axis(x - 1, y, x + 1, y);
    const ty = axis(x, y - 1, x, y + 1);
    // Upwind eikonal on a grid whose spacing is 1 along x and hy along y: ((u - tx) / 1)^2 + ((u - ty) / hy)^2 = cost^2.
    const one = Math.min(tx + cost, ty + cost * hy);
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || one <= Math.max(tx, ty)) return one;
    const a = 1;
    const b = 1 / (hy * hy);
    const qa = a + b;
    const qb = -2 * (a * tx + b * ty);
    const qc = a * tx * tx + b * ty * ty - cost * cost;
    return (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
  };
  while (heap.size > 0) {
    const { cost, item } = heap.pop();
    if (done[item] || cost > dist[item]!) continue;
    done[item] = 1;
    const x = item % cw;
    const y = (item - x) / cw;
    for (const [dx, dy] of NEIGHBOURS) {
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
  return geodesic(input, passable, edge);
}

/**
 * The flow potential over the passable texels: 1 at the water next to each in edge, 0 next to the out edge, harmonic in
 * between (a spring, with no in edge, has `laplacian = -1` on the water instead). A link between two water texels conducts 1,
 * any link that touches a dry texel `1 / NON_WATER_COST`, so the banks are (nearly) no-flux walls and a bridge deck still
 * conducts. Texels outside the padded face are not part of the domain. Solved by red-black SOR.
 */
export function riverPotential(input: RiverFlowInput): { phi: Float64Array; sweeps: number; seedEdge: Int8Array } {
  const { mask, cw, ch, inEdges, outEdge } = input;
  const { padded, passable } = faceMasks(input);
  const n = cw * ch;
  const isWater = (p: number) => passable[p] === 1 && mask[p]! >= WATER_THRESHOLD;
  const fixed = new Uint8Array(n);
  const phi = new Float64Array(n);
  // Which edge's seed band a texel is in (-1: none).
  const seedEdge = new Int8Array(n).fill(-1);
  const hasIn = inEdges.some((e) => e !== outEdge);
  for (const e of inEdges) {
    if (e === outEdge) continue;
    for (const p of edgeSeeds(input, padded, e)) {
      fixed[p] = 1;
      phi[p] = 1;
      seedEdge[p] = e;
    }
  }
  for (const p of edgeSeeds(input, padded, outEdge)) {
    fixed[p] = 1;
    phi[p] = 0;
    seedEdge[p] = outEdge;
  }
  if (hasIn) for (let p = 0; p < n; p++) if (!fixed[p]) phi[p] = 0.5;

  // Link conductances to the right, left, down and up neighbours (0 where there is no domain neighbour).
  const cond = new Float64Array(n * 4);
  const sum = new Float64Array(n);
  const link = (p: number, q: number) => (isWater(p) && isWater(q) ? 1 : 1 / NON_WATER_COST);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!passable[p]) continue;
      if (x + 1 < cw && passable[p + 1]) cond[p * 4] = link(p, p + 1);
      if (x > 0 && passable[p - 1]) cond[p * 4 + 1] = link(p, p - 1);
      // Ground-space Laplacian phi_xx + s^2 phi_yy in screen texels: vertical links conduct s^2 as much.
      if (y + 1 < ch && passable[p + cw]) cond[p * 4 + 2] = link(p, p + cw) * VERTICAL_CONDUCTANCE;
      if (y > 0 && passable[p - cw]) cond[p * 4 + 3] = link(p, p - cw) * VERTICAL_CONDUCTANCE;
      sum[p] = cond[p * 4]! + cond[p * 4 + 1]! + cond[p * 4 + 2]! + cond[p * 4 + 3]!;
    }
  }

  let sweeps = 0;
  while (sweeps < SOR_MAX_SWEEPS) {
    let maxUpdate = 0;
    for (let colour = 0; colour < 2; colour++) {
      for (let y = 0; y < ch; y++) {
        for (let x = (y + colour) & 1; x < cw; x += 2) {
          const p = y * cw + x;
          if (!passable[p] || fixed[p]) continue;
          const c = p * 4;
          let acc = 0;
          if (cond[c]! > 0) acc += cond[c]! * phi[p + 1]!;
          if (cond[c + 1]! > 0) acc += cond[c + 1]! * phi[p - 1]!;
          if (cond[c + 2]! > 0) acc += cond[c + 2]! * phi[p + cw]!;
          if (cond[c + 3]! > 0) acc += cond[c + 3]! * phi[p - cw]!;
          const source = !hasIn && isWater(p) ? 1 : 0;
          const target = (acc + source) / sum[p]!;
          const update = SOR_OMEGA * (target - phi[p]!);
          phi[p] = phi[p]! + update;
          maxUpdate = Math.max(maxUpdate, Math.abs(update));
        }
      }
    }
    sweeps++;
    if (maxUpdate < SOR_TOLERANCE) break;
  }
  return { phi, sweeps, seedEdge };
}

/**
 * Chamfer distance (texels) from each water texel to the nearest bank: a dry texel of the padded face that is farther than
 * `EDGE_RIM_TEXELS` from every in/out edge segment. 0 off water.
 */
function distanceToBank(input: RiverFlowInput, passable: Uint8Array): Float32Array {
  const { mask, cw, ch, polygon, inEdges, outEdge } = input;
  const segments = [...new Set([...inEdges, outEdge])].map((e) => [polygon[e]!, polygon[(e + 1) % polygon.length]!] as const);
  const far = 1e6;
  const d = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (mask[p]! >= WATER_THRESHOLD || !passable[p]) {
        d[p] = far;
      } else {
        const nearEdge = segments.some(([a, b]) => distToSegment(x + 0.5, y + 0.5, a, b) <= EDGE_RIM_TEXELS);
        d[p] = nearEdge ? far : 0;
      }
    }
  }
  // Steps in ground texels: a vertical texel is 1 / squash long.
  const DOWN = 1 / GROUND_SQUASH;
  const DIAG = Math.hypot(1, DOWN);
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
      relax(x, y, 0, -1, DOWN);
      relax(x, y, -1, -1, DIAG);
      relax(x, y, 1, -1, DIAG);
    }
  }
  for (let y = ch - 1; y >= 0; y--) {
    for (let x = cw - 1; x >= 0; x--) {
      relax(x, y, 1, 0, 1);
      relax(x, y, 0, 1, DOWN);
      relax(x, y, 1, 1, DIAG);
      relax(x, y, -1, 1, DIAG);
    }
  }
  return d;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Edge `e` is nearest to the point, among the in and out edges the water crosses (-1 if there are none). */
function nearestFlowEdge(input: RiverFlowInput, px: number, py: number): number {
  const { polygon, outEdge } = input;
  let best = -1;
  let bestD = Infinity;
  for (const e of [...input.inEdges.filter((i) => i !== outEdge), outEdge]) {
    const d = distToSegment(px, py, polygon[e]!, polygon[(e + 1) % polygon.length]!);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Everything both flow textures read from one solve of a river frame: the face masks, the potential, the bank distance, the lake fade. */
function solveRiver(input: RiverFlowInput) {
  const { mask, cw, ch, fadeEdge } = input;
  const { inside, passable, cover } = faceMasks(input);
  const isWater = (x: number, y: number) => x >= 0 && x < cw && y >= 0 && y < ch && mask[y * cw + x]! >= WATER_THRESHOLD && passable[y * cw + x] === 1;
  const bank = distanceToBank(input, passable);
  const { phi, seedEdge } = riverPotential(input);

  const fade = fadeEdge === undefined ? null : geodesic(input, passable, fadeEdge);
  const fadeLength = (Math.max(...input.polygon.map((p) => p.x)) - Math.min(...input.polygon.map((p) => p.x))) / 2;
  /** Intensity of the water at texel `p`: the bank fade, and the lake fade where there is one. */
  const intensityAt = (p: number, fadeTexels = BANK_FADE_TEXELS): number => {
    let intensity = Math.min(1, Math.max(0, bank[p]! / fadeTexels));
    if (fade) intensity *= 1 - smoothstep(0, fadeLength, fade[p]!);
    return intensity;
  };
  return { inside, passable, cover, isWater, phi, seedEdge, intensityAt };
}

/**
 * The flow direction texture of one river frame cell: RGBA8, `cw * ch * 4` bytes, premultiplied.
 *
 * R, G = unit flow direction * 0.5 + 0.5 (art space, +y down). B = intensity: the distance to the bank
 * over `BANK_FADE_TEXELS`. A = 255 on the water texels with a direction inside the top face and its rim along the in and out edges
 * (`FACE_PAD_TEXELS`), all four 0 elsewhere. Not drawn any more (the ripple texture is); kept as the direction reference.
 */
export function computeRiverFlow(input: RiverFlowInput): Uint8Array {
  const { cw, ch, outEdge } = input;
  const { inside, cover, isWater, phi, seedEdge, intensityAt } = solveRiver(input);

  // Negative gradient of the potential over water neighbours: central differences, one-sided where only one side is water.
  const vx = new Float32Array(cw * ch);
  const vy = new Float32Array(cw * ch);
  const has = new Uint8Array(cw * ch);
  const normals = input.polygon.map((_, e) => crossingDirection(input.polygon, e));
  const axis = (lo: boolean, hi: boolean, here: number, pLo: number, pHi: number) => (lo && hi ? (pHi - pLo) / 2 : hi ? pHi - here : lo ? here - pLo : 0);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!isWater(x, y)) continue;
      const p = y * cw + x;
      const here = phi[p]!;
      const l = isWater(x - 1, y);
      const r = isWater(x + 1, y);
      const u = isWater(x, y - 1);
      const d = isWater(x, y + 1);
      const gx = axis(l, r, here, l ? phi[p - 1]! : 0, r ? phi[p + 1]! : 0);
      const gy = axis(u, d, here, u ? phi[p - cw]! : 0, d ? phi[p + cw]! : 0);
      // Inside a seed band the potential is constant, and the rim past the face is a dead end beyond it, flat up to solver
      // noise: neither has a gradient of its own. Both take the edge's crossing direction, which is what the potential
      // tends to there anyway, and the neighbouring hex sets the same direction on the same edge, so the seam matches
      // exactly. (Filled from their neighbours instead, the band's ends against a bank took the bank's direction and left
      // off-colour spots along every seam.)
      const edge = seedEdge[p]! >= 0 ? seedEdge[p]! : inside[p] ? -1 : nearestFlowEdge(input, x + 0.5, y + 0.5);
      if (edge >= 0) {
        const n = normals[edge]!;
        const sign = edge === outEdge ? 1 : -1;
        vx[p] = n.x * sign;
        vy[p] = n.y * sign;
        has[p] = 1;
        continue;
      }
      // Ground velocity (-phi_X, -phi_Y) = (-phi_x, -phi_y * s) mapped to the screen (x, y * s): (-phi_x, -s^2 phi_y).
      vx[p] = -gx;
      vy[p] = -VERTICAL_CONDUCTANCE * gy;
      has[p] = Math.hypot(gx, gy) > 1e-9 ? 1 : 0;
    }
  }
  // Fill the texels without a direction (exact stagnation points) from their nearest water neighbours that
  // have one, ring by ring, so the flow keeps crossing the edge perpendicular to it.
  for (let pass = 0; pass < 8; pass++) {
    const filled: number[] = [];
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = y * cw + x;
        if (!isWater(x, y) || has[p]) continue;
        let sx = 0;
        let sy = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!isWater(x + dx, y + dy)) continue;
            const q = (y + dy) * cw + x + dx;
            if (!has[q]) continue;
            const len = Math.hypot(vx[q]!, vy[q]!);
            sx += vx[q]! / len;
            sy += vy[q]! / len;
            count++;
          }
        }
        if (count > 0) {
          vx[p] = sx;
          vy[p] = sy;
          filled.push(p);
        }
      }
    }
    if (filled.length === 0) break;
    for (const p of filled) has[p] = 1;
  }

  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!cover[p]) continue;
      if (!isWater(x, y) || !has[p]) continue;
      const dx = vx[p]!;
      const dy = vy[p]!;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      // Opaque only where there is flow: a dry texel of this cell (the strip along its edge where the art's water stops
      // short) must not cover the neighbouring river cell's rim, which is the water actually seen there.
      const o = p * 4;
      out[o + 3] = 255;
      const intensity = intensityAt(p);
      out[o] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(intensity * 255);
    }
  }
  return out;
}

/**
 * Ground texels from the bank at which the ripple texture's B reaches 1 (the middle of the channel). B is the distance to the bank over
 * this, not over `BANK_FADE_TEXELS`: the shader both fades the ripples out at the bank (over the first `BANK_FADE_TEXELS` of it)
 * and lags the crests there, so they bow into arcs and none runs straight along a hex seam.
 */
export const RIVER_CENTRE_TEXELS = 16;

/**
 * Target ripple wavelength in texels of the half-resolution cell (one tile width is about 100 texels): a cell gets
 * `round(channel length / this)` whole ripple periods between its in and out edges.
 */
export const RIPPLE_WAVELENGTH_TEXELS = 12;

/**
 * The ripple texture of one river frame cell: RGBA8, `cw * ch * 4` bytes, premultiplied, and the number of periods `n` it holds.
 *
 * The phase is `theta = 2 pi n phi` with the flow potential `phi` (1 at the in edges, 0 at the out edge; a cell without an in
 * edge has `phi` normalised by its maximum over the water first), so its contour lines cross the channel and `theta` is
 * a multiple of 2 pi on every in and out edge: neighbouring hexes and the arms of a confluence agree there. `n` is
 * `max(1, round(L / RIPPLE_WAVELENGTH_TEXELS))`, `L` the mean geodesic distance (no bank penalty) from the out edge to the in edge
 * seeds (the maximum over the water for a cell without an in edge). In the seed bands and the rim, where the potential is flat, the
 * phase continues linearly at the cell's mean rate `2 pi n / L` per texel from the edge line (0 mod 2 pi on it), so a crest is not a flat strip.
 *
 * R, G = cos, sin of `theta` * 0.5 + 0.5 (filtering-safe, unlike a wrapped phase). B = distance to the bank over
 * `RIVER_CENTRE_TEXELS` (0 at the bank, 1 in the middle; the dry rim along an in or out edge is no bank; a lake mouth's fade multiplies it).
 * A = 255 on the water of the face and its rim along the in and out edges, all four 0 elsewhere.
 */
export function computeRiverRipple(input: RiverFlowInput): { data: Uint8Array; periods: number } {
  const { mask, cw, ch, outEdge } = input;
  const { inside, passable, cover, isWater, phi, seedEdge, intensityAt } = solveRiver(input);
  const hasIn = input.inEdges.some((e) => e !== outEdge);

  const dist = geodesic(input, passable, outEdge);
  let length = 0;
  let count = 0;
  let maxDist = 0;
  let maxPhi = 0;
  for (let p = 0; p < cw * ch; p++) {
    if (!passable[p] || mask[p]! < WATER_THRESHOLD) continue;
    if (Number.isFinite(dist[p]!)) maxDist = Math.max(maxDist, dist[p]!);
    maxPhi = Math.max(maxPhi, phi[p]!);
    if (hasIn && seedEdge[p]! >= 0 && seedEdge[p] !== outEdge && Number.isFinite(dist[p]!)) {
      length += dist[p]!;
      count++;
    }
  }
  const channelLength = hasIn && count > 0 ? length / count : maxDist;
  const periods = Math.max(1, Math.round(channelLength / RIPPLE_WAVELENGTH_TEXELS));
  const scale = hasIn || maxPhi <= 0 ? 1 : 1 / maxPhi;
  const rate = channelLength > 0 ? (2 * Math.PI * periods) / channelLength : 0;
  const normals = input.polygon.map((_, e) => crossingDirection(input.polygon, e));

  // How far past its edge line (into the face) each edge's seed band reaches: the potential starts there, not on the line.
  // (measured on the ground: the crossing direction and the offsets are unsquashed first.)
  const depthOf = (edge: number, x: number, y: number) => {
    const a = input.polygon[edge]!;
    const n = normals[edge]!;
    const gy = 1 / GROUND_SQUASH;
    const len = Math.hypot(n.x, n.y * gy);
    return -((x + 0.5 - a.x) * n.x + ((y + 0.5 - a.y) * gy) * (n.y * gy)) / len;
  };
  const bandDepth = new Float64Array(input.polygon.length);
  for (let p = 0; p < cw * ch; p++) {
    const e = seedEdge[p]!;
    if (e >= 0) bandDepth[e] = Math.max(bandDepth[e]!, depthOf(e, p % cw, Math.floor(p / cw)));
  }
  const inEdges = input.inEdges.filter((e) => e !== outEdge);
  const outDepth = bandDepth[outEdge]!;
  const inDepth = inEdges.length > 0 ? inEdges.reduce((s, e) => s + bandDepth[e]!, 0) / inEdges.length : 0;

  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (!cover[p] || !isWater(x, y)) continue;
      // The seed bands and the rim past an edge have a constant potential, which would draw a crest as a wide flat strip along
      // every seam. There the phase runs on past the edge line at the cell's mean rate instead (`2 pi n / L` per texel), so it
      // is still 0 mod 2 pi on the edge line itself and the two hexes of a seam continue each other's phase through it. The
      // potential proper starts at the inner side of the bands, so its phase is shifted there by what the bands have used up
      // (linearly in the potential), which keeps the phase continuous where band and interior meet.
      const edge = seedEdge[p]! >= 0 ? seedEdge[p]! : inside[p] ? -1 : nearestFlowEdge(input, x + 0.5, y + 0.5);
      let theta: number;
      if (edge >= 0) {
        theta = (edge === outEdge ? 1 : -1) * rate * depthOf(edge, x, y);
      } else {
        const phase = Math.min(1, phi[p]! * scale);
        theta = 2 * Math.PI * periods * phase + (1 - phase) * rate * outDepth - phase * rate * inDepth;
      }
      const o = p * 4;
      out[o] = Math.round((Math.cos(theta) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((Math.sin(theta) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(intensityAt(p, RIVER_CENTRE_TEXELS) * 255);
      out[o + 3] = 255;
    }
  }
  return { data: out, periods };
}
