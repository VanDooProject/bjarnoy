import { describe, expect, it } from 'vitest';
import { computeRiverFlow, computeRiverRipple, GROUND_SQUASH, riverStreamFunction, SLOW_PHASE_FACTOR, RIPPLE_WAVELENGTH_TEXELS, RIVER_CENTRE_TEXELS, riverGeodesicDistance, riverPotential, SEED_REACH, topFacePolygonTexels, WATER_THRESHOLD, type RiverFlowInput } from './riverFlow';
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
  /**
   * The direction water crosses edge `e` out of the face: hex centre to edge midpoint, which is the ground normal of the edge
   * projected onto the isometric screen. (The screen perpendicular of a slanted edge is about 30 degrees off it.)
   */
  const outward = (f: RiverFrame, e: number) => {
    const m = mid(f, e);
    const c = centre(f);
    return { x: m.x - c.x, y: m.y - c.y };
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
      // axis, the coves within 50. Angles are ground angles.
      let checked = 0;
      let within20 = 0;
      for (let y = 0; y < f.ch; y++) {
        for (let x = 0; x < f.cw; x++) {
          const d = dirAt(flow, x, y, f.cw);
          if (d.a !== 255 || !water(f, x, y) || d.b <= 0.5) continue;
          // Angles are measured on the ground (screen y unsquashed): that is where the flow is solved and where a bank slants.
          const off = degrees({ x: d.x, y: d.y / GROUND_SQUASH }, { x: axis.x, y: axis.y / GROUND_SQUASH });
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

/** The ripple phase (radians, wrapped to -pi..pi) at a texel of a ripple cell; null where the cell has no flow. */
function phaseAt(cell: Uint8Array, x: number, y: number, cw: number): { theta: number; cos: number; b: number } | null {
  const o = (y * cw + x) * 4;
  if (cell[o + 3] === 0) return null;
  const cos = (cell[o]! / 255) * 2 - 1;
  const sin = (cell[o + 1]! / 255) * 2 - 1;
  return { theta: Math.atan2(sin, cos), cos, b: cell[o + 2]! / 255 };
}

/** Distance (ground texels: screen y unsquashed) from a texel centre to polygon edge `e` of the frame. */
function groundDistToEdge(f: RiverFrame, e: number, x: number, y: number): number {
  const s = 1 / GROUND_SQUASH;
  const a = f.polygon[e]!;
  const b = f.polygon[(e + 1) % 6]!;
  const dx = b.x - a.x;
  const dy = (b.y - a.y) * s;
  const t = Math.max(0, Math.min(1, ((x + 0.5 - a.x) * dx + ((y + 0.5 - a.y) * s) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x + 0.5 - (a.x + t * dx), (y + 0.5 - a.y) * s - t * dy);
}

describe('computeRiverRipple on a synthetic straight channel', () => {
  it('is a whole number of periods, 0 mod 2 pi on the in and out seed bands, rising from the out edge to the in edge', () => {
    const { data, periods } = computeRiverRipple(input(channel(), BOTTOM));
    // The channel runs from the bottom seed band (y ~ 45) to the top one (y ~ 1): about 44 screen texels, 44 / squash on the ground.
    expect(periods).toBe(Math.max(1, Math.round(44 / GROUND_SQUASH / RIPPLE_WAVELENGTH_TEXELS)));
    // On the edge line itself (the face's top and bottom sides, y 0 and 46) the phase is a whole turn; past it, in the seed band
    // and the rim, it runs on at the cell's mean rate instead of standing still. The texel centres at y 0.5 and 45.5 are half
    // a texel from the lines, the out edge's rim at 46.5 and 47.5 up to 1.5.
    // The phase runs at 2 pi periods / 44 per screen texel along the axis, so it is within that times the distance (30 % margin).
    const perTexel = (2 * Math.PI * periods) / 44;
    for (const [y, d] of [[0, 0.5], [CH - 3, 0.5], [1, 1.5], [CH - 2, 1.5], [CH - 1, 2.5]] as const) expect(phaseAt(data, 50, y, CW)!.cos, `y=${y}`).toBeGreaterThan(Math.cos(Math.min(Math.PI, 1.3 * perTexel * d)));
    // Unwrapped along the axis from the out edge to the in edge: never decreases, ends at 2 pi * periods.
    let prev = 0;
    let unwrapped = 0;
    let started = false;
    for (let y = CH - 1; y >= 0; y--) {
      const p = phaseAt(data, 50, y, CW);
      if (!p) continue;
      if (started) {
        let step = p.theta - prev;
        while (step < -Math.PI) step += 2 * Math.PI;
        while (step > Math.PI) step -= 2 * Math.PI;
        expect(step, `y=${y}`).toBeGreaterThan(-0.05);
        unwrapped += step;
      }
      started = true;
      prev = p.theta;
    }
    // The sampled rows run from 1.5 texels past the out edge line to half a texel inside the in edge line, so the span is a
    // whole number of periods plus the phase of those 2 texels at the cell's rate (2 pi periods / 44 per texel, about 0.6).
    expect(Math.abs(unwrapped - 2 * Math.PI * periods - 2 * perTexel)).toBeLessThan(1);
  });

  it('continues its phase across a seam: the out edge rim of one hex equals the in edge side of the hex below it', () => {
    const above = computeRiverRipple(input(channel(), BOTTOM));
    const below = computeRiverRipple(input(channel(), BOTTOM));
    expect(above.periods).toBe(below.periods);
    // The face's bottom side is at y = 46, the next hex's top side is the same line: texel y of the hex above is y - 46 of the
    // hex below. Both are on the water, one in the out edge's rim, the other in the in edge's seed band.
    for (const [yAbove, yBelow] of [[46, 0]] as const) {
      const a = phaseAt(above.data, 50, yAbove, CW)!;
      const b = phaseAt(below.data, 50, yBelow, CW)!;
      expect(Math.abs(a.theta - b.theta), `rows ${yAbove}/${yBelow}`).toBeLessThan(0.05);
      // The shader's lag is a function of B alone, so equal phase and nearly equal B (the domains end at different rows) make the same crest on both sides.
      expect(Math.abs(above.data[(yAbove * CW + 50) * 4 + 2]! - below.data[(yBelow * CW + 50) * 4 + 2]!) / 255).toBeLessThan(0.1);
    }
  });

  it('runs the other way round when the edges swap, and covers the same texels as the direction cell', () => {
    const flow = computeRiverFlow(input(channel(), TOP));
    const { data, periods } = computeRiverRipple(input(channel(), TOP));
    for (let p = 0; p < CW * CH; p++) {
      expect(data[p * 4 + 3], `alpha ${p}`).toBe(flow[p * 4 + 3]);
    }
    const perTexel = (2 * Math.PI * periods) / 44;
    expect(phaseAt(data, 50, 0, CW)!.cos).toBeGreaterThan(Math.cos(1.3 * perTexel * 0.5));
    expect(phaseAt(data, 50, CH - 3, CW)!.cos).toBeGreaterThan(Math.cos(1.3 * perTexel * 0.5));
  });
});

describe('computeRiverRipple slow phase', () => {
  it('has its own whole number of periods, fewer than the fast phase, and covers the same texels', () => {
    const { data, slow, periods, slowPeriods } = computeRiverRipple(input(channel(), BOTTOM));
    expect(slowPeriods).toBeGreaterThanOrEqual(1);
    expect(slowPeriods).toBeLessThan(periods);
    expect(Math.abs(slowPeriods - periods / SLOW_PHASE_FACTOR)).toBeLessThanOrEqual(1);
    for (let p = 0; p < CW * CH; p++) {
      expect(slow[p * 4 + 3]).toBe(data[p * 4 + 3]);
    }
    // 0 mod 2 pi on the out edge's line, like the fast phase.
    const o = ((CH - 3) * CW + 50) * 4;
    expect(slow[o]! / 127.5 - 1).toBeGreaterThan(0.8);
  });
});

describe('computeRiverRipple intensity', () => {
  it('is 0 at the bank and 1 from RIVER_CENTRE_TEXELS of it, across the whole width of a wide channel', () => {
    const mask = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 20; x < 80; x++) mask[y * CW + x] = 255;
    const { data } = computeRiverRipple(input(mask, BOTTOM));
    const b = (x: number) => data[(20 * CW + x) * 4 + 2]! / 255;
    expect(b(20)).toBeLessThan(0.1);
    expect(b(20 + RIVER_CENTRE_TEXELS / 2)).toBeGreaterThan(0.4);
    expect(b(20 + RIVER_CENTRE_TEXELS / 2)).toBeLessThan(0.6);
    expect(b(20 + RIVER_CENTRE_TEXELS + 1)).toBe(1);
    expect(b(50)).toBe(1);
  });

  it('is nearly the same in the middle on both sides of a seam (within 0.1)', () => {
    const above = computeRiverRipple(input(channel(), BOTTOM));
    const below = computeRiverRipple(input(channel(), BOTTOM));
    for (const [yAbove, yBelow] of [[46, 0]] as const) {
      for (const x of [50]) expect(Math.abs(above.data[(yAbove * CW + x) * 4 + 2]! - below.data[(yBelow * CW + x) * 4 + 2]!) / 255, `x=${x} rows ${yAbove}/${yBelow}`).toBeLessThan(0.1);
    }
  });
});

describe.skipIf(!vendoredArt)('computeRiverRipple on the vendored art', () => {
  it('is a whole turn on every in and out edge line: cos theta > 0.8 (2 pi / 6 per ground texel at most) within 2 ground texels of it', async () => {
    for (const [name, outDir, inDirs] of [
      ['rivertile_bend120_meander_SE_base', 'W', ['SE']],
      ['rivertile_y_narrow_SE_base', 'W', ['E', 'SE']],
    ] as const) {
      const f = await riverFrameInput(name);
      const outEdge = topFaceEdgeIndex(outDir);
      const inEdges = inDirs.map(topFaceEdgeIndex);
      const { data, periods } = computeRiverRipple({ ...f, inEdges, outEdge });
      expect(periods, name).toBeGreaterThanOrEqual(1);
      for (const e of [outEdge, ...inEdges]) {
        let checked = 0;
        for (let y = 0; y < f.ch; y++) {
          for (let x = 0; x < f.cw; x++) {
            if (groundDistToEdge(f, e, x, y) > 2) continue;
            const p = phaseAt(data, x, y, f.cw);
            if (!p) continue;
            checked++;
            // The phase runs at most 2 pi / 6 per ground texel (a period is 6..18 texels), from 0 on the edge line.
            expect(p.cos, `${name} edge ${e} at ${x},${y}`).toBeGreaterThan(Math.cos(Math.min(Math.PI, (Math.PI / 3) * groundDistToEdge(f, e, x, y) + 0.15)));
          }
        }
        expect(checked, `${name} edge ${e}`).toBeGreaterThan(5);
      }
    }
  }, 120_000);

  it('gives a spring frame (no in edge) a valid cell with phase 0 at the out edge', async () => {
    const f = await riverFrameInput('bogcreek_spring_E_base');
    const edges = touchedEdges(f);
    expect(edges.length).toBe(1);
    const out = edges[0]!;
    const { data, periods } = computeRiverRipple({ ...f, inEdges: [], outEdge: out });
    expect(periods).toBeGreaterThanOrEqual(1);
    let covered = 0;
    let checked = 0;
    for (let y = 0; y < f.ch; y++) {
      for (let x = 0; x < f.cw; x++) {
        const p = phaseAt(data, x, y, f.cw);
        if (!p) continue;
        covered++;
        const dg = groundDistToEdge(f, out, x, y);
        if (dg <= 3) {
          checked++;
          expect(p.cos, `at ${x},${y}`).toBeGreaterThan(Math.cos(Math.min(Math.PI, (Math.PI / 3) * dg + 0.15)));
        }
      }
    }
    expect(covered).toBeGreaterThan(50);
    expect(checked).toBeGreaterThan(3);
  }, 120_000);
});

/** The tile art is drawn `TILE_W` wide: 168 world units for 200 source px. */
const WORLD_PER_SOURCE_PX = 168 / 200;

describe('computeRiverFlow on a slanted channel', () => {
  it('runs along the centre-to-centre axis between a pair of slanted opposite edges, both ways round', () => {
    const polygon = POLYGON;
    const mid = (e: number) => ({ x: (polygon[e]!.x + polygon[(e + 1) % 6]!.x) / 2, y: (polygon[e]!.y + polygon[(e + 1) % 6]!.y) / 2 });
    const m0 = mid(0);
    const m3 = mid(3);
    const axis = { x: m3.x - m0.x, y: m3.y - m0.y };
    // A channel 12 ground texels wide round the line from one edge midpoint to the other.
    const mask = new Uint8Array(CW * CH);
    const len = Math.hypot(axis.x, axis.y / GROUND_SQUASH);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const px = x + 0.5 - m0.x;
        const py = (y + 0.5 - m0.y) / GROUND_SQUASH;
        const across = (px * (axis.y / GROUND_SQUASH) - py * axis.x) / len;
        if (Math.abs(across) <= 6) mask[y * CW + x] = 255;
      }
    }
    for (const [inEdge, outEdge, sign] of [[0, 3, 1], [3, 0, -1]] as const) {
      const flow = computeRiverFlow({ mask, cw: CW, ch: CH, polygon, inEdges: [inEdge], outEdge });
      let checked = 0;
      for (let y = 0; y < CH; y++) {
        for (let x = 0; x < CW; x++) {
          const d = dirAt(flow, x, y);
          const px = x + 0.5 - m0.x;
          const py = (y + 0.5 - m0.y) / GROUND_SQUASH;
          const across = Math.abs((px * (axis.y / GROUND_SQUASH) - py * axis.x) / len);
          if (d.a === 0 || d.b < 0.99 || across > 1.5) continue;
          checked++;
          const dot = (d.x * axis.x * sign + d.y * axis.y * sign) / (Math.hypot(d.x, d.y) * Math.hypot(axis.x, axis.y));
          expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI, `${inEdge}->${outEdge} at ${x},${y}`).toBeLessThan(5);
        }
      }
      expect(checked, `${inEdge}->${outEdge}`).toBeGreaterThan(20);
    }
  });
});

describe.skipIf(!vendoredArt)('computeRiverFlow across a slanted seam of the real art', () => {
  it('turns by less than 15 degrees between texels 2 apart along the channel middle across the seam of the bend-into-meander pair', async () => {
    const meanderOrigin = { x: 7182, y: 6103.44 };
    const bendOrigin = { x: 7308, y: 6142.08 };
    const meander = await riverFrameInput('rivertile_bend180_meander_NW_base');
    const bend = await riverFrameInput('rivertile_bend_SE_base');
    const meanderFlow = computeRiverFlow({ ...meander, inEdges: [topFaceEdgeIndex('E')], outEdge: topFaceEdgeIndex('W') });
    const bendFlow = computeRiverFlow({ ...bend, inEdges: [topFaceEdgeIndex('SE')], outEdge: topFaceEdgeIndex('W') });
    // The cells as the render texture places them (the bend is drawn last): world -> flow at that point, or null.
    const cells = [
      { f: meander, flow: meanderFlow, o: meanderOrigin },
      { f: bend, flow: bendFlow, o: bendOrigin },
    ];
    const sample = (wx: number, wy: number) => {
      let found: { x: number; y: number; b: number } | null = null;
      for (const { f, flow, o } of cells) {
        const x = Math.floor((((wx - o.x) / WORLD_PER_SOURCE_PX) - f.sx) / 2);
        const y = Math.floor((((wy - o.y) / WORLD_PER_SOURCE_PX) - f.sy) / 2);
        if (x < 0 || y < 0 || x >= f.cw || y >= f.ch) continue;
        const d = dirAt(flow, x, y, f.cw);
        if (d.a === 255) found = d;
      }
      return found;
    };
    // The seam: the bend's out edge. Its water midpoint is where the channel crosses.
    const outEdge = topFaceEdgeIndex('W');
    const a = bend.polygon[outEdge]!;
    const b = bend.polygon[(outEdge + 1) % 6]!;
    const toWorld = (p: { x: number; y: number }) => ({
      x: bendOrigin.x + (bend.sx + 2 * p.x) * WORLD_PER_SOURCE_PX,
      y: bendOrigin.y + (bend.sy + 2 * p.y) * WORLD_PER_SOURCE_PX,
    });
    const wa = toWorld(a);
    const wb = toWorld(b);
    const wc = toWorld(bend.polygon.reduce((s, p) => ({ x: s.x + p.x / 6, y: s.y + p.y / 6 }), { x: 0, y: 0 }));
    const seamMid = { x: (wa.x + wb.x) / 2, y: (wa.y + wb.y) / 2 };
    const cross = { x: seamMid.x - wc.x, y: seamMid.y - wc.y };
    const crossLen = Math.hypot(cross.x, cross.y);
    // Walk along the crossing direction through the seam, in texel steps of the half-resolution cell (2 source px).
    const step = 2 * WORLD_PER_SOURCE_PX;
    const samples: { x: number; y: number; b: number }[] = [];
    for (let i = -12; i <= 12; i++) {
      const d = sample(seamMid.x + (cross.x / crossLen) * step * i, seamMid.y + (cross.y / crossLen) * step * i);
      if (d && d.b > 0.5) samples.push(d);
    }
    expect(samples.length).toBeGreaterThan(12);
    for (let i = 0; i + 2 < samples.length; i++) {
      const p = samples[i]!;
      const q = samples[i + 2]!;
      const c = (p.x * q.x + p.y * q.y) / (Math.hypot(p.x, p.y) * Math.hypot(q.x, q.y));
      expect((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI, `samples ${i}/${i + 2}`).toBeLessThan(15);
    }
  }, 120_000);
});

describe.skipIf(!vendoredArt)('computeRiverRipple coverage on the real art', () => {
  it('covers every painted water texel of the frame, banks of both sides and the spill past the top face included', async () => {
    // The art's water spills up to about 6.5 texels past the top face at the hex corners and past the in and out edges; a 2-texel
    // rim left that strip without ripples, a gap of plain water along one bank where the river meets the next hex.
    for (const [name, inDirs, outDir] of [
      ['rivertile_bend120_island_NW_base', ['E'], 'NW'],
      ['rivertile_bend_SE_base', ['SE'], 'W'],
      ['rivertile_bend_W_base', ['SE'], 'NE'],
      ['rivertile_y_narrow_SE_base', ['E', 'SE'], 'W'],
      ['rivertile_bend180_meander_NW_base', ['E'], 'W'],
    ] as const) {
      const f = await riverFrameInput(name);
      const { data } = computeRiverRipple({ ...f, inEdges: inDirs.map(topFaceEdgeIndex), outEdge: topFaceEdgeIndex(outDir) });
      const missed: string[] = [];
      for (let y = 0; y < f.ch; y++) for (let x = 0; x < f.cw; x++) if (f.mask[y * f.cw + x]! >= WATER_THRESHOLD && data[(y * f.cw + x) * 4 + 3] === 0) missed.push(`${x},${y}`);
      expect(missed.slice(0, 5), `${name}: ${missed.length} water texels uncovered`).toEqual([]);
    }
  }, 120_000);

  it('covers the painted water of the bog creek frames, up to the few texels where the art spills over the cliff past a non-flow edge', async () => {
    for (const [name, inDirs, outDir] of [
      ['bogcreek_NW_variant002_base', ['E'], 'W'],
      ['bogcreek_bend_SE_variant002_base', ['SE'], 'W'],
      ['bogcreek_W_base', ['SE'], 'NW'],
      ['bogcreek_bend_NW_base', ['E'], 'NW'],
    ] as const) {
      const f = await riverFrameInput(name);
      const { data } = computeRiverRipple({ ...f, inEdges: inDirs.map(topFaceEdgeIndex), outEdge: topFaceEdgeIndex(outDir) });
      let water = 0;
      let missed = 0;
      for (let y = 0; y < f.ch; y++) {
        for (let x = 0; x < f.cw; x++) {
          if (f.mask[y * f.cw + x]! < WATER_THRESHOLD) continue;
          water++;
          if (data[(y * f.cw + x) * 4 + 3] === 0) missed++;
        }
      }
      expect(water, name).toBeGreaterThan(900);
      expect(missed, `${name}: ${missed} of ${water} water texels uncovered`).toBeLessThanOrEqual(5);
    }
  }, 120_000);
});

describe('computeRiverRipple distance to the bank near an edge', () => {
  const bAt = (data: Uint8Array, x: number, y: number) => data[(y * CW + x) * 4 + 2]! / 255;

  it('(d) does not count the strip where the water stops short of the edge as a bank: B at the edge is about its middle value', () => {
    // The channel (x 40..60) stops 2 texels short of the face's top and bottom sides.
    const mask = new Uint8Array(CW * CH);
    for (let y = 2; y < 44; y++) for (let x = 40; x < 60; x++) mask[y * CW + x] = 255;
    const { data } = computeRiverRipple(input(mask, BOTTOM));
    expect(Math.abs(bAt(data, 50, 3) - bAt(data, 50, 22))).toBeLessThan(0.1);
    expect(Math.abs(bAt(data, 50, 42) - bAt(data, 50, 22))).toBeLessThan(0.1);
  });

  it('(d) keeps a real bank that reaches the edge a bank: B is 0 against it right up to the edge', () => {
    const { data } = computeRiverRipple(input(channel(), BOTTOM));
    // Water at x 40 is against the bank at x 39 along the whole channel, edge rows included.
    for (const y of [1, 10, 22, 36, 45]) expect(bAt(data, 40, y), `y=${y}`).toBeLessThan(0.1);
  });
});

describe('computeRiverRipple draws only water it has a phase for', () => {
  it('(e) gives every drawn texel a unit (cos, sin) pair, and draws no water the distance fields do not reach', () => {
    const { data } = computeRiverRipple(input(channel(), BOTTOM));
    let drawn = 0;
    for (let p = 0; p < CW * CH; p++) {
      if (data[p * 4 + 3] === 0) continue;
      drawn++;
      const c = data[p * 4]! / 127.5 - 1;
      const s = data[p * 4 + 1]! / 127.5 - 1;
      expect(Math.hypot(c, s), `texel ${p}`).toBeGreaterThan(0.97);
      expect(Math.hypot(c, s)).toBeLessThan(1.03);
    }
    expect(drawn).toBeGreaterThan(500);
  });

  it.skipIf(!vendoredArt)('(e) does so on real frames too', async () => {
    for (const [name, inDir, outDir] of [
      ['rivertile_bend120_island_NW_base', 'E', 'NW'],
      ['rivertile_bend_SE_base', 'SE', 'W'],
    ] as const) {
      const f = await riverFrameInput(name);
      const { data } = computeRiverRipple({ ...f, inEdges: [topFaceEdgeIndex(inDir)], outEdge: topFaceEdgeIndex(outDir) });
      for (let p = 0; p < f.cw * f.ch; p++) {
        if (data[p * 4 + 3] === 0) continue;
        const m = Math.hypot(data[p * 4]! / 127.5 - 1, data[p * 4 + 1]! / 127.5 - 1);
        expect(m, `${name} texel ${p}`).toBeGreaterThan(0.97);
      }
    }
  }, 120_000);
});

describe('riverStreamFunction', () => {
  const psiAt = (psi: Float64Array, x: number, y: number) => psi[y * CW + x]!;

  it('is 0 on the bank to the right looking downstream and 1 on the left, and flips with the flow', () => {
    // Flowing towards the bottom (south), the right-hand bank is the west one (small x).
    const down = riverStreamFunction(input(channel(), BOTTOM));
    expect(psiAt(down, 41, 22)).toBeLessThan(0.15);
    expect(psiAt(down, 58, 22)).toBeGreaterThan(0.85);
    // Monotone across the channel, and about the same along it (a straight channel: the streamlines are straight).
    for (let x = 41; x < 58; x++) expect(psiAt(down, x + 1, 22)).toBeGreaterThanOrEqual(psiAt(down, x, 22) - 1e-3);
    expect(Math.abs(psiAt(down, 50, 12) - psiAt(down, 50, 34))).toBeLessThan(0.05);
    const up = riverStreamFunction(input(channel(), TOP));
    expect(psiAt(up, 41, 22)).toBeGreaterThan(0.85);
    expect(psiAt(up, 58, 22)).toBeLessThan(0.15);
  });

  it('gives an island no fixed value: the streamlines part round it', () => {
    const mask = channel();
    for (let y = 18; y < 28; y++) for (let x = 48; x < 53; x++) mask[y * CW + x] = 0;
    const psi = riverStreamFunction(input(mask, BOTTOM));
    // Inside the island ψ is neither bank value, and the water on either side of it keeps its side.
    expect(psiAt(psi, 50, 22)).toBeGreaterThan(0.25);
    expect(psiAt(psi, 50, 22)).toBeLessThan(0.75);
    expect(psiAt(psi, 45, 22)).toBeLessThan(0.5);
    expect(psiAt(psi, 55, 22)).toBeGreaterThan(0.5);
    // Above and below the island the streamline at its middle is the same one (ψ about 0.5 on the axis).
    expect(Math.abs(psiAt(psi, 50, 12) - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(psiAt(psi, 50, 36) - 0.5)).toBeLessThan(0.15);
  });

  it('puts the two banks of a spring on either side of its out crossing', () => {
    const psi = riverStreamFunction({ mask: channel(), cw: CW, ch: CH, polygon: POLYGON, inEdges: [], outEdge: BOTTOM });
    expect(psiAt(psi, 41, 40)).toBeLessThan(0.3);
    expect(psiAt(psi, 58, 40)).toBeGreaterThan(0.7);
  });
});
