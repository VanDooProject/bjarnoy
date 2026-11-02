import { describe, expect, it } from 'vitest';
import { vendoredArt } from './riverArtFixture';
import { composePair, directionOfOffset, sampleComposite, SEAM_PAIRS, TEXEL_WORLD, type ComposedCell } from './riverSeamFixture';
import { topFaceEdgeIndex } from '../riverPath';

/** The texels where one cell's rim lies over the other cell's face: [rim texel data offset, face texel data offset, rim cell, face cell]. */
function overlaps(cells: ComposedCell[]): { rim: Uint8Array; ro: number; face: Uint8Array; fo: number }[] {
  const out: { rim: Uint8Array; ro: number; face: Uint8Array; fo: number }[] = [];
  for (const [i, j] of [[0, 1], [1, 0]] as const) {
    const r = cells[i]!;
    const f = cells[j]!;
    for (let ty = 0; ty < r.frame.ch; ty++) {
      for (let tx = 0; tx < r.frame.cw; tx++) {
        const ro = (ty * r.frame.cw + tx) * 4;
        if (r.rim[ro + 3] === 0) continue;
        const fx = Math.floor((r.x + (tx + 0.5) * TEXEL_WORLD - f.x) / TEXEL_WORLD);
        const fy = Math.floor((r.y + (ty + 0.5) * TEXEL_WORLD - f.y) / TEXEL_WORLD);
        if (fx < 0 || fy < 0 || fx >= f.frame.cw || fy >= f.frame.ch) continue;
        const fo = (fy * f.frame.cw + fx) * 4;
        if (f.face[fo + 3] === 0) continue;
        out.push({ rim: r.rim, ro, face: f.face, fo });
      }
    }
  }
  return out;
}

/** World points along the shared edge line, and the world step of one texel across it (from the first cell towards the second). */
function seamLine(cells: ComposedCell[], t: number) {
  const a = cells[0]!;
  const poly = a.frame.polygon;
  const p0 = poly[a.seamEdge]!;
  const p1 = poly[(a.seamEdge + 1) % 6]!;
  const c = poly.reduce((s, q) => ({ x: s.x + q.x / 6, y: s.y + q.y / 6 }), { x: 0, y: 0 });
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const len = Math.hypot(mid.x - c.x, mid.y - c.y);
  return {
    x: a.x + (p0.x + (p1.x - p0.x) * t) * TEXEL_WORLD,
    y: a.y + (p0.y + (p1.y - p0.y) * t) * TEXEL_WORLD,
    step: { x: ((mid.x - c.x) / len) * TEXEL_WORLD, y: ((mid.y - c.y) / len) * TEXEL_WORLD },
  };
}

describe.skipIf(!vendoredArt)('river flow across the seams of real neighbouring cells', () => {
  it('knows which way a neighbour lies', () => {
    expect(directionOfOffset(126, 38.64)).toBe('E');
    expect(topFaceEdgeIndex(directionOfOffset(0, 77.28))).toBe(topFaceEdgeIndex('SE'));
  });

  it('(a) draws every face texel as the cell\'s own value: a neighbour\'s rim never overwrites it', async () => {
    for (const pair of SEAM_PAIRS) {
      const cells = await composePair(pair, true);
      let checked = 0;
      cells.forEach((c, who) => {
        for (let ty = 0; ty < c.frame.ch; ty++) {
          for (let tx = 0; tx < c.frame.cw; tx++) {
            const o = (ty * c.frame.cw + tx) * 4;
            if (c.face[o + 3] === 0) continue;
            const s = sampleComposite(cells, c.x + (tx + 0.5) * TEXEL_WORLD, c.y + (ty + 0.5) * TEXEL_WORLD)!;
            // Another cell's face may cover the same texel only on the shared edge line, where the two faces meet.
            if (s.who !== who && s.pass === 'rim') throw new Error(`${pair[0].name}: rim of cell ${s.who} over the face of cell ${who} at ${tx},${ty}`);
            if (s.who === who) {
              expect(s.pass).toBe('face');
              expect(Math.round((s.b) * 255)).toBe(c.face[o + 2]);
              checked++;
            }
          }
        }
      });
      expect(checked, pair[0].name).toBeGreaterThan(500);
    }
  }, 300_000);

  it('(b) gives both hexes of a seam the same distance to the bank where one\'s rim lies over the other\'s face (within 0.05)', async () => {
    const report: string[] = [];
    for (const pair of SEAM_PAIRS) {
      const cells = await composePair(pair, true);
      const pairs = overlaps(cells);
      expect(pairs.length, pair[0].name).toBeGreaterThan(30);
      let max = 0;
      for (const o of pairs) max = Math.max(max, Math.abs(o.rim[o.ro + 2]! - o.face[o.fo + 2]!) / 255);
      report.push(`${pair[0].name.slice(9, 26)}|${pair[1].name.slice(9, 26)}: ${max.toFixed(3)}`);
      expect(max, report.join('\n')).toBeLessThanOrEqual(0.05);
    }
  }, 300_000);

  it('(b) and without the neighbour context the same pairs differ by a lot (the test can fail)', async () => {
    const cells = await composePair(SEAM_PAIRS[4]!, false);
    let max = 0;
    for (const o of overlaps(cells)) max = Math.max(max, Math.abs(o.rim[o.ro + 2]! - o.face[o.fo + 2]!) / 255);
    expect(max).toBeGreaterThan(0.3);
  }, 120_000);

  it('(c) turns the ripple phase at about the same rate on both sides of a seam (25 % on average over the pairs, 40 % at worst)', async () => {
    const worst: string[] = [];
    const medians: number[] = [];
    for (const pair of SEAM_PAIRS) {
      const cells = await composePair(pair, true);
      const ratios: number[] = [];
      for (let t = 0.3; t <= 0.71; t += 0.05) {
        const line = seamLine(cells, t);
        const theta = (k: number) => sampleComposite(cells, line.x + line.step.x * k, line.y + line.step.y * k)?.theta;
        const rate = (ks: number[]) => {
          let total = 0;
          for (let i = 1; i < ks.length; i++) {
            const u = theta(ks[i - 1]!);
            const v = theta(ks[i]!);
            if (u === undefined || v === undefined) return NaN;
            let d = v - u;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            total += d;
          }
          return Math.abs(total) / (ks.length - 1);
        };
        const l = rate([-5, -4, -3, -2, -1]);
        const r = rate([1, 2, 3, 4, 5]);
        if (Number.isFinite(l) && Number.isFinite(r) && Math.min(l, r) > 0.05) ratios.push(Math.max(l, r) / Math.min(l, r));
      }
      expect(ratios.length, pair[0].name).toBeGreaterThan(2);
      ratios.sort((a, b) => a - b);
      const median = ratios[ratios.length >> 1]!;
      worst.push(`${pair[0].name.slice(9, 26)}|${pair[1].name.slice(9, 26)}: median ${median.toFixed(2)} max ${ratios[ratios.length - 1]!.toFixed(2)}`);
      medians.push(median);
      // The rate is 2 pi n / (the path length through the point): each cell rounds its own n and has its own path lengths, so the
      // two sides of a seam differ by up to a third (the confluence pair measures 1.33).
      expect(median, worst.join('\n')).toBeLessThan(1.4);
    }
    expect(medians.reduce((a, b) => a + b, 0) / medians.length, worst.join('\n')).toBeLessThan(1.25);
  }, 300_000);
});
