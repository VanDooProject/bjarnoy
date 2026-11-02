import { describe, expect, it } from 'vitest';
import { computeRiverFlow, riverGeodesicDistance, riverPotential, SEED_REACH, topFacePolygonTexels, WATER_THRESHOLD, type RiverFlowInput } from './riverFlow';
import { topFaceEdgeIndex } from '../riverPath';
import { riverFrameInput, vendoredArt, type RiverFrame } from './riverArtFixture';

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

/** The edge opposite `outEdge` is the in edge. */
function input(mask: Uint8Array, outEdge: number, fadeEdge?: number): RiverFlowInput {
  return { mask, cw: CW, ch: CH, polygon: POLYGON, inEdges: [outEdge === TOP ? BOTTOM : TOP], outEdge, fadeEdge };
}

/** Flow direction (-1..1) at a texel; (0, 0) where the cell has no flow (alpha 0). */
function dirAt(flow: Uint8Array, x: number, y: number, cw = CW): { x: number; y: number; b: number; a: number } {
  const o = (y * cw + x) * 4;
  if (flow[o + 3] === 0) return { x: 0, y: 0, b: 0, a: 0 };
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

  it('is opaque on the water of the face, transparent on dry texels and beyond the face', () => {
    const flow = computeRiverFlow(input(channel(), BOTTOM));
    expect(dirAt(flow, 50, 22).a).toBe(255);
    expect(dirAt(flow, 2, 2).a).toBe(0);
    // Past a side the water does not cross (edge 0, the left side), there is no rim: that neighbour is land.
    expect(dirAt(flow, 0, 25).a).toBe(0);
    // A dry texel inside the face is transparent too, so it never covers the neighbouring cell's rim drawn under it.
    const o = (22 * CW + 20) * 4;
    expect(flow[o + 3]).toBe(0);
  });

  it('carries the flow into the rim past the face edge, so neighbouring cells leave no gap at the seam', () => {
    const flow = computeRiverFlow(input(channel(), BOTTOM));
    // The bottom side of the face is y = 46; y = 47 is the rim the next hex's cell also covers.
    const rim = dirAt(flow, 50, 47);
    expect(rim.a).toBe(255);
    expect(rim.b).toBeGreaterThan(0.9);
    expect(rim.y).toBeGreaterThan(0.9);
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

/** Polygon edges the water of a frame touches (enough water texels within the seed reach). */
function touchedEdges(f: RiverFrame): number[] {
  const edges: number[] = [];
  for (let e = 0; e < 6; e++) {
    let near = 0;
    for (let y = 0; y < f.ch; y++) {
      for (let x = 0; x < f.cw; x++) {
        if (f.mask[y * f.cw + x]! >= WATER_THRESHOLD && distToEdge(f, e, x + 0.5, y + 0.5) <= SEED_REACH) near++;
      }
    }
    if (near >= 8) edges.push(e);
  }
  return edges;
}

/** The water texel next to polygon edge `e` that lies deepest in the channel (furthest from the bank); ties go to the one closest to the edge midpoint. */
function startNear(f: RiverFrame, e: number): { x: number; y: number } {
  const a = f.polygon[e]!;
  const b = f.polygon[(e + 1) % 6]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const depth = computeRiverFlow({ ...f, inEdges: [], outEdge: e });
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

function distToEdge(f: RiverFrame, e: number, x: number, y: number): number {
  const a = f.polygon[e]!;
  const b = f.polygon[(e + 1) % 6]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

/** Follows the flow in 1-texel steps from `start`; reports whether it reached `outEdge` and how it got there. */
function streamline(f: RiverFrame & { inEdges: readonly number[] }, outEdge: number, start: { x: number; y: number }) {
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
    // Off the water the field has no flow (alpha 0): steer by the closest texel that has one, within 3 texels.
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
  const degrees = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const c = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  };
  const mid = (f: RiverFrame, e: number) => {
    const a = f.polygon[e]!;
    const b = f.polygon[(e + 1) % 6]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const centre = (f: RiverFrame) => ({ x: f.polygon.reduce((s, p) => s + p.x, 0) / 6, y: f.polygon.reduce((s, p) => s + p.y, 0) / 6 });
  /** The normal of edge `e`, pointing out of the face. */
  const outward = (f: RiverFrame, e: number) => {
    const a = f.polygon[e]!;
    const b = f.polygon[(e + 1) % 6]!;
    const m = mid(f, e);
    const c = centre(f);
    const n = { x: b.y - a.y, y: a.x - b.x };
    return n.x * (m.x - c.x) + n.y * (m.y - c.y) >= 0 ? n : { x: -n.x, y: -n.y };
  };
  const water = (f: RiverFrame, x: number, y: number) => f.mask[y * f.cw + x]! >= WATER_THRESHOLD;
  /** Water texels of the face within `reach` of edge `e` and within `span` of its midpoint, with intensity above `minB`. */
  /** Whether a point is on the face's side of edge `e` (not in the rim past it). */
  const faceSide = (f: RiverFrame, e: number, x: number, y: number) => {
    const a = f.polygon[e]!;
    const b = f.polygon[(e + 1) % 6]!;
    const c = f.polygon.reduce((s, p) => ({ x: s.x + p.x / 6, y: s.y + p.y / 6 }), { x: 0, y: 0 });
    const side = (px: number, py: number) => (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    return side(x, y) * side(c.x, c.y) > 0;
  };
  const nearEdge = (f: RiverFrame, flow: Uint8Array, e: number, reach: number, span: number, minB = 0, faceOnly = false) => {
    const m = mid(f, e);
    const found: { x: number; y: number; d: ReturnType<typeof dirAt> }[] = [];
    for (let y = 0; y < f.ch; y++) {
      for (let x = 0; x < f.cw; x++) {
        if (!water(f, x, y) || flow[(y * f.cw + x) * 4 + 3] !== 255 || distToEdge(f, e, x + 0.5, y + 0.5) > reach || Math.hypot(x + 0.5 - m.x, y + 0.5 - m.y) > span) continue;
        if (faceOnly && !faceSide(f, e, x + 0.5, y + 0.5)) continue;
        const d = dirAt(flow, x, y, f.cw);
        if (d.b > minB) found.push({ x, y, d });
      }
    }
    return found;
  };

  it('crosses each in and out edge along its normal over the whole crossing, bank ends included', async () => {
    // These two frames meet at a seam where the band along the edge used to copy the bank's direction at its ends:
    // off-colour spots along the seam. Both sides of a seam use the edge normal, so they match exactly.
    for (const [name, outDir, inDirs] of [
      ['rivertile_bend120_meander_SE_base', 'W', ['SE']],
      ['rivertile_y_narrow_SE_base', 'W', ['E', 'SE']],
    ] as const) {
      const f = await riverFrameInput(name);
      const outEdge = topFaceEdgeIndex(outDir);
      const inEdges = inDirs.map(topFaceEdgeIndex);
      const flow = computeRiverFlow({ ...f, inEdges, outEdge });
      for (const e of [outEdge, ...inEdges]) {
        const n = outward(f, e);
        const want = e === outEdge ? n : { x: -n.x, y: -n.y };
        let checked = 0;
        for (let y = 0; y < f.ch; y++) {
          for (let x = 0; x < f.cw; x++) {
            if (distToEdge(f, e, x + 0.5, y + 0.5) > 1.5) continue;
            const d = dirAt(flow, x, y, f.cw);
            if (d.a === 0) continue;
            checked++;
            expect(degrees(d, want), `${name} edge ${e} at ${x},${y}`).toBeLessThan(5);
          }
        }
        expect(checked, `${name} edge ${e}`).toBeGreaterThan(5);
      }
    }
  }, 120_000);

  it('runs a straight river along its axis and crosses the in and out edge perpendicular to them, both ways round', async () => {
    const f = await riverFrameInput('rivertile_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(2);
    for (const [inEdge, outEdge] of [edges, [edges[1]!, edges[0]!]] as const) {
      const flow = computeRiverFlow({ ...f, inEdges: [inEdge], outEdge });
      const from = mid(f, inEdge);
      const to = mid(f, outEdge);
      const axis = { x: to.x - from.x, y: to.y - from.y };
      // The painted banks have coves, where the water follows the bank: nearly all of the channel is within 20 degrees of the
      // axis, the coves within 50.
      let checked = 0;
      let within20 = 0;
      for (let y = 0; y < f.ch; y++) {
        for (let x = 0; x < f.cw; x++) {
          const d = dirAt(flow, x, y, f.cw);
          if (d.a !== 255 || !water(f, x, y) || d.b <= 0.5) continue;
          const off = degrees(d, axis);
          expect(off, `${inEdge}->${outEdge} at ${x},${y}`).toBeLessThan(50);
          if (off < 20) within20++;
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(300);
      expect(within20 / checked).toBeGreaterThan(0.9);
      // Perpendicular to the edge it flows through: inward at the in edge, outward at the out edge.
      const inward = outward(f, inEdge);
      for (const t of nearEdge(f, flow, inEdge, 3, 12)) expect(degrees(t.d, { x: -inward.x, y: -inward.y }), `in edge at ${t.x},${t.y}`).toBeLessThan(10);
      for (const t of nearEdge(f, flow, outEdge, 3, 12)) expect(degrees(t.d, outward(f, outEdge)), `out edge at ${t.x},${t.y}`).toBeLessThan(10);
    }
  }, 120_000);

  it('keeps the intensity up across the seam: the dry rim along an edge is not a bank', async () => {
    const f = await riverFrameInput('rivertile_E_base');
    const [inEdge, outEdge] = touchedEdges(f) as [number, number];
    const flow = computeRiverFlow({ ...f, inEdges: [inEdge], outEdge });
    for (const e of [inEdge, outEdge]) {
      const texels = nearEdge(f, flow, e, 3, 6);
      expect(texels.length, `edge ${e}`).toBeGreaterThan(5);
      for (const t of texels) expect(t.d.b, `edge ${e} at ${t.x},${t.y}`).toBeGreaterThanOrEqual(0.9);
    }
  }, 120_000);

  it('has no singularity in open water around an island or a loop', async () => {
    for (const name of ['rivertile_bend120_island_E_base', 'rivertile_bend60_loop_E_base']) {
      const f = await riverFrameInput(name);
      const edges = touchedEdges(f);
      expect(edges.length, name).toBe(2);
      for (const [inEdge, outEdge] of [edges, [edges[1]!, edges[0]!]] as const) {
        const flow = computeRiverFlow({ ...f, inEdges: [inEdge], outEdge });
        // Open water: more than 4 texels from the in and out edge (the seams are checked on their own).
        const openWater = (x: number, y: number) => distToEdge(f, inEdge, x + 0.5, y + 0.5) > 4 && distToEdge(f, outEdge, x + 0.5, y + 0.5) > 4;
        let pairs = 0;
        for (let y = 0; y < f.ch - 1; y++) {
          for (let x = 0; x < f.cw - 1; x++) {
            const a = dirAt(flow, x, y, f.cw);
            if (a.b <= 0.5 || !water(f, x, y) || !openWater(x, y)) continue;
            for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
              const b = dirAt(flow, x + dx, y + dy, f.cw);
              if (b.b <= 0.5 || !water(f, x + dx, y + dy) || !openWater(x + dx, y + dy)) continue;
              expect(degrees(a, b), `${name} ${inEdge}->${outEdge} at ${x},${y}`).toBeLessThan(30);
              pairs++;
            }
          }
        }
        expect(pairs, name).toBeGreaterThan(300);
      }
    }
  }, 120_000);

  it('goes round the bend60 loop towards each out edge, never across the neck', async () => {
    const f = await riverFrameInput('rivertile_bend60_loop_E_base');
    const edges = touchedEdges(f);
    for (const out of edges) {
      const inEdge = edges.find((e) => e !== out)!;
      const result = streamline({ ...f, inEdges: [inEdge] }, out, startNear(f, inEdge));
      expect(result.reached, `out edge ${out}: ${JSON.stringify(result)}`).toBe(true);
      expect(result.steps).toBeLessThanOrEqual(1.5 * result.length + 4);
      expect(result.maxOffWater).toBeLessThanOrEqual(3);
    }
  }, 120_000);

  it('sends both inflow arms of the wide Y towards the single out edge, crossing each in edge perpendicular', async () => {
    const f = await riverFrameInput('rivertile_ywide_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(3);
    // The single outflow is the narrow edge: fewest seed texels.
    const seedCount = (e: number) => {
      let n = 0;
      for (let y = 0; y < f.ch; y++) for (let x = 0; x < f.cw; x++) if (water(f, x, y) && distToEdge(f, e, x + 0.5, y + 0.5) <= SEED_REACH) n++;
      return n;
    };
    const out = [...edges].sort((a, b) => seedCount(a) - seedCount(b))[0]!;
    const arms = edges.filter((e) => e !== out);
    const flow = computeRiverFlow({ ...f, inEdges: arms, outEdge: out });
    for (const arm of arms) {
      const inward = outward(f, arm);
      // The arm meets its edge obliquely, so the texels next to the bank lean: the median is within 10 degrees and four fifths are within 25. Measured on the face only: the rim past the edge copies its
      // direction from the face's texels next to it, bank lean included.
      const offs = nearEdge(f, flow, arm, 3, 6, 0.5, true).map((t) => degrees(t.d, { x: -inward.x, y: -inward.y }));
      expect(offs.length, `arm ${arm}`).toBeGreaterThan(5);
      expect([...offs].sort((a, b) => a - b)[offs.length >> 1], `arm ${arm}`).toBeLessThan(10);
      expect([...offs].sort((a, b) => a - b)[Math.floor(offs.length * 0.8)], `arm ${arm}`).toBeLessThan(25);
      const result = streamline({ ...f, inEdges: arms }, out, startNear(f, arm));
      expect(result.reached, `arm ${arm} -> ${out}: ${JSON.stringify(result)}`).toBe(true);
      expect(result.maxOffWater).toBeLessThanOrEqual(3);
    }
  }, 120_000);

  it('solves a frame in a few milliseconds', async () => {
    const f = await riverFrameInput('rivertile_bend60_loop_E_base');
    const [inEdge, outEdge] = touchedEdges(f) as [number, number];
    const input = { ...f, inEdges: [inEdge], outEdge };
    const runs = 5;
    const start = performance.now();
    let sweeps = 0;
    for (let i = 0; i < runs; i++) sweeps = riverPotential(input).sweeps;
    const ms = (performance.now() - start) / runs;
    console.log(`river flow potential: ${ms.toFixed(1)} ms per frame, ${sweeps} sweeps (bend60 loop, ${f.cw}x${f.ch})`);
    expect(sweeps).toBeLessThan(6000);
  }, 120_000);

  it('flows a spring frame (no in edge) towards its out edge', async () => {
    const f = await riverFrameInput('bogcreek_spring_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(1);
    const out = edges[0]!;
    const flow = computeRiverFlow({ ...f, inEdges: [], outEdge: out });
    const toOut = { x: mid(f, out).x - centre(f).x, y: mid(f, out).y - centre(f).y };
    let sum = 0;
    let n = 0;
    for (let y = 0; y < f.ch; y++) {
      for (let x = 0; x < f.cw; x++) {
        const d = dirAt(flow, x, y, f.cw);
        if (d.a !== 255 || !water(f, x, y) || d.b <= 0.5) continue;
        sum += Math.cos((degrees(d, toOut) * Math.PI) / 180);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(sum / n).toBeGreaterThan(0.5);
    for (const t of nearEdge(f, flow, out, 3, 10)) expect(degrees(t.d, outward(f, out)), `out edge at ${t.x},${t.y}`).toBeLessThan(25);
  }, 120_000);
});

describe('computeRiverFlow when the art stops short of the out edge', () => {
  it('seeds from the water closest to the edge', () => {
    // The channel ends 8 texels below the top edge, as the delta frame's trimmed canvas does.
    const mask = new Uint8Array(CW * CH);
    for (let y = 8; y < CH; y++) for (let x = 40; x < 60; x++) mask[y * CW + x] = 255;
    const flow = computeRiverFlow(input(mask, TOP));
    for (const y of [12, 22, 32]) expect(dirAt(flow, 50, y).y, `y=${y}`).toBeLessThan(-0.9);
  });
});

describe.skipIf(!vendoredArt)('computeRiverFlow on the river delta', () => {
  it('flows the delta funnel towards the sea edge although the art stops short of it', async () => {
    const f = await riverFrameInput('rivertile_delta_W_base');
    // The delta's river comes in on edge 4 and the sea lies behind edge 1.
    const flow = computeRiverFlow({ ...f, inEdges: [4], outEdge: 1 });
    let withDirection = 0;
    for (let i = 0; i < f.cw * f.ch; i++) if (flow[i * 4 + 3] === 255 && (flow[i * 4] !== 128 || flow[i * 4 + 1] !== 128)) withDirection++;
    expect(withDirection).toBeGreaterThan(400);
    // Averaged over the funnel (the water splits around the two sand islets, so single texels point left or right).
    let sum = 0;
    let n = 0;
    for (let y = 8; y < 48; y++) {
      for (let x = 0; x < f.cw; x++) {
        const d = dirAt(flow, x, y, f.cw);
        if (Math.hypot(d.x, d.y) > 0.5) {
          sum += d.y;
          n++;
        }
      }
    }
    expect(sum / n).toBeLessThan(-0.5);
  }, 120_000);
});
