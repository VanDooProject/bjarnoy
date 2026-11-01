import { describe, expect, it } from 'vitest';
import { computeRiverFlow, riverGeodesicDistance, SEED_REACH, topFacePolygonTexels, WATER_THRESHOLD, type RiverFlowInput } from './riverFlow';
import { riverFrameInput, vendoredArt } from './riverArtFixture';

const CW = 100;
const CH = 48;
// Top face spans y 0..46 in cell texels; edge 1 is its top side, edge 4 its bottom side.
const POLYGON = topFacePolygonTexels(0, 140);
const TOP = 1;
const BOTTOM = 4;

function channel(nonWater?: { y0: number; y1: number }): Uint8Array {
  const mask = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++) {
    if (nonWater && y >= nonWater.y0 && y < nonWater.y1) continue;
    for (let x = 40; x < 60; x++) mask[y * CW + x] = 255;
  }
  return mask;
}

function input(mask: Uint8Array, outEdge: number, fadeEdge?: number): RiverFlowInput {
  return { mask, cw: CW, ch: CH, polygon: POLYGON, outEdge, fadeEdge };
}

/** Flow direction (-1..1) at a texel. */
function dirAt(flow: Uint8Array, x: number, y: number, cw = CW): { x: number; y: number; b: number; a: number } {
  const o = (y * cw + x) * 4;
  return { x: (flow[o]! / 255) * 2 - 1, y: (flow[o + 1]! / 255) * 2 - 1, b: flow[o + 2]! / 255, a: flow[o + 3]! };
}

describe('computeRiverFlow on a synthetic straight channel', () => {
  it('flows from the in edge to the out edge everywhere along the channel', () => {
    const flow = computeRiverFlow(input(channel(), BOTTOM));
    for (const y of [4, 12, 22, 32, 40]) {
      const d = dirAt(flow, 50, y);
      expect(d.y, `y=${y}`).toBeGreaterThan(0.9);
      expect(Math.abs(d.x), `y=${y}`).toBeLessThan(0.3);
    }
  });

  it('flips when the out edge flips', () => {
    const flow = computeRiverFlow(input(channel(), TOP));
    for (const y of [6, 14, 22, 32, 40]) expect(dirAt(flow, 50, y).y, `y=${y}`).toBeLessThan(-0.9);
  });

  it('is intensity 0 at the bank and off water, rising towards the middle', () => {
    const flow = computeRiverFlow(input(channel(), BOTTOM));
    expect(dirAt(flow, 40, 22).b).toBeLessThan(0.3);
    expect(dirAt(flow, 50, 22).b).toBe(1);
    expect(dirAt(flow, 20, 22).b).toBe(0);
  });

  it('is transparent outside the top face and opaque inside', () => {
    const flow = computeRiverFlow(input(channel(), BOTTOM));
    expect(dirAt(flow, 50, 22).a).toBe(255);
    expect(dirAt(flow, 2, 2).a).toBe(0);
    expect(dirAt(flow, 50, 47).a).toBe(0);
  });

  it('still flows upstream of a full-width non-water bridge, with the right sign', () => {
    const flow = computeRiverFlow(input(channel({ y0: 20, y1: 26 }), BOTTOM));
    for (const y of [6, 12, 17]) {
      const d = dirAt(flow, 50, y);
      expect(d.y, `y=${y}`).toBeGreaterThan(0.9);
      expect(d.b, `y=${y}`).toBeGreaterThan(0);
    }
    for (const y of [32, 40]) expect(dirAt(flow, 50, y).y, `y=${y}`).toBeGreaterThan(0.9);
  });

  it('fades to a still lake away from the fade edge', () => {
    const flow = computeRiverFlow(input(channel(), TOP, BOTTOM));
    // Next to the creek edge (bottom) the flow is strong, a half hex width away (top) it has all but died out.
    expect(dirAt(flow, 50, 40).b).toBeGreaterThan(0.5);
    expect(dirAt(flow, 50, 2).b).toBeLessThan(0.15);
  });
});

// --- real art ---------------------------------------------------------------------------------------------------------

/** Polygon edges the water of a frame touches (enough seed texels). */
function touchedEdges(f: Omit<RiverFlowInput, 'outEdge'>): number[] {
  const edges: number[] = [];
  for (let e = 0; e < 6; e++) {
    const dist = riverGeodesicDistance({ ...f, outEdge: e }, e);
    let seeds = 0;
    for (const d of dist) if (d === 0) seeds++;
    if (seeds >= 8) edges.push(e);
  }
  return edges;
}

/** The water texel next to polygon edge `e` that lies deepest in the channel (furthest from the bank); ties go to the one closest to the edge midpoint. */
function startNear(f: Omit<RiverFlowInput, 'outEdge'>, e: number): { x: number; y: number } {
  const a = f.polygon[e]!;
  const b = f.polygon[(e + 1) % 6]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const depth = computeRiverFlow({ ...f, outEdge: e });
  let best = { x: 0, y: 0 };
  let bestScore = -Infinity;
  for (let y = 0; y < f.ch; y++) {
    for (let x = 0; x < f.cw; x++) {
      if (f.mask[y * f.cw + x]! < WATER_THRESHOLD || distToEdge(f, e, x + 0.5, y + 0.5) > SEED_REACH + 3) continue;
      const score = depth[(y * f.cw + x) * 4 + 2]! - Math.hypot(x + 0.5 - mx, y + 0.5 - my) / 1000;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function distToEdge(f: Omit<RiverFlowInput, 'outEdge'>, e: number, x: number, y: number): number {
  const a = f.polygon[e]!;
  const b = f.polygon[(e + 1) % 6]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

/** Follows the flow in 1-texel steps from `start`; reports whether it reached `outEdge` and how it got there. */
function streamline(f: Omit<RiverFlowInput, 'outEdge'>, outEdge: number, start: { x: number; y: number }) {
  const flow = computeRiverFlow({ ...f, outEdge });
  const dist = riverGeodesicDistance({ ...f, outEdge }, outEdge);
  const length = dist[start.y * f.cw + start.x]!;
  const maxSteps = Math.ceil(1.5 * length) + 4;
  let x = start.x + 0.5;
  let y = start.y + 0.5;
  let steps = 0;
  let offWater = 0;
  let maxOffWater = 0;
  while (steps < maxSteps && distToEdge(f, outEdge, x, y) > SEED_REACH + 1) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= f.cw || ty >= f.ch) break;
    // Off the water the field encodes no direction (0.5, 0.5): steer by the closest texel that has one, within 3 texels.
    let d = dirAt(flow, tx, ty, f.cw);
    for (let r = 1; r <= 3 && Math.hypot(d.x, d.y) <= 0.5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = tx + dx;
          const yy = ty + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || xx < 0 || yy < 0 || xx >= f.cw || yy >= f.ch) continue;
          const c = dirAt(flow, xx, yy, f.cw);
          if (Math.hypot(c.x, c.y) > 0.5 && Math.hypot(d.x, d.y) <= 0.5) d = c;
        }
      }
    }
    if (Math.hypot(d.x, d.y) > 0.5) {
      x += d.x / Math.hypot(d.x, d.y);
      y += d.y / Math.hypot(d.x, d.y);
    }
    const nx = Math.floor(x);
    const ny = Math.floor(y);
    const inWater = nx >= 0 && ny >= 0 && nx < f.cw && ny < f.ch && f.mask[ny * f.cw + nx]! >= WATER_THRESHOLD;
    offWater = inWater ? 0 : offWater + 1;
    maxOffWater = Math.max(maxOffWater, offWater);
    steps++;
  }
  return { reached: distToEdge(f, outEdge, x, y) <= SEED_REACH + 1, steps, length, maxOffWater };
}

describe.skipIf(!vendoredArt)('computeRiverFlow on the vendored art', () => {
  it('goes round the bend60 loop towards each out edge, never across the neck', async () => {
    const f = await riverFrameInput('rivertile_bend60_loop_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(2);
    for (const out of edges) {
      const other = edges.find((e) => e !== out)!;
      const result = streamline(f, out, startNear(f, other));
      expect(result.reached, `out edge ${out}: ${JSON.stringify(result)}`).toBe(true);
      expect(result.steps).toBeLessThanOrEqual(1.5 * result.length + 4);
      expect(result.maxOffWater).toBeLessThanOrEqual(3);
    }
  }, 120_000);

  it('sends both inflow arms of the wide Y towards the single out edge', async () => {
    const f = await riverFrameInput('rivertile_ywide_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(3);
    // The single outflow is the narrow edge: fewest seed texels.
    const seedCount = (e: number) => riverGeodesicDistance({ ...f, outEdge: e }, e).reduce((n, d) => n + (d === 0 ? 1 : 0), 0);
    const out = [...edges].sort((a, b) => seedCount(a) - seedCount(b))[0]!;
    for (const arm of edges.filter((e) => e !== out)) {
      const result = streamline(f, out, startNear(f, arm));
      expect(result.reached, `arm ${arm} -> ${out}: ${JSON.stringify(result)}`).toBe(true);
      expect(result.maxOffWater).toBeLessThanOrEqual(3);
    }
  }, 120_000);
});
