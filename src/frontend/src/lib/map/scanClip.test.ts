// The viewport scan is clipped to where terrain can actually draw; this pins
// that the clip never drops a hex the renderer would have drawn.
//
// A rebuild used to walk every hex in the viewport — ~92,000 of them on a
// zoomed-out map, to draw about a thousand — because the cost scaled with how
// far out the camera was while the work it found scaled with how much had been
// explored. The scan is now bounded by the same discs the per-hex cull already
// tests against.
//
// That is only sound if the discs are a superset of everything drawable, and
// the failure mode if they aren't is silent: terrain simply stops appearing in
// a corner of the map, at some zoom levels, for some settlement layouts. So
// this checks the geometry directly — `coveredRowSpans` must agree, hex for
// hex, with asking `hexDistance` about every hex in a box around the sources.
import { describe, expect, it } from 'vitest';
import { coveredRowSpans } from './HexMapRenderer';
import { hexDistance } from '../hex/coords';

interface Source {
  q: number;
  r: number;
  radius: number;
}

/** Every (q, r) the spans claim, over a box comfortably containing the sources. */
function hexesFromSpans(sources: Source[], qMin: number, qMax: number): Set<string> {
  const out = new Set<string>();
  const spans: number[] = [];
  for (let q = qMin; q <= qMax; q++) {
    const count = coveredRowSpans(q, sources, spans);
    for (let i = 0; i < count; i++) {
      for (let r = spans[i * 2]; r <= spans[i * 2 + 1]; r++) out.add(`${q},${r}`);
    }
  }
  return out;
}

/** The same set, derived the slow honest way. */
function hexesByDistance(sources: Source[], qMin: number, qMax: number, rMin: number, rMax: number): Set<string> {
  const out = new Set<string>();
  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      for (const s of sources) {
        if (hexDistance({ q, r }, { q: s.q, r: s.r }) <= s.radius) {
          out.add(`${q},${r}`);
          break;
        }
      }
    }
  }
  return out;
}

const LAYOUTS: { name: string; sources: Source[] }[] = [
  { name: 'a lone settlement', sources: [{ q: 0, r: 0, radius: 18 }] },
  { name: 'one off the origin', sources: [{ q: -7, r: 11, radius: 13 }] },
  { name: 'two that overlap', sources: [{ q: 0, r: 0, radius: 10 }, { q: 6, r: -2, radius: 9 }] },
  {
    // The case a naive min/max per column gets wrong: it would bridge the
    // empty water between them and scan it all.
    name: 'two far apart, with a gap',
    sources: [{ q: -40, r: 5, radius: 8 }, { q: 40, r: -5, radius: 8 }],
  },
  {
    name: 'a cluster plus a distant outpost',
    sources: [
      { q: 0, r: 0, radius: 18 },
      { q: 3, r: 4, radius: 12 },
      { q: -5, r: 2, radius: 14 },
      { q: 60, r: -30, radius: 9 },
    ],
  },
  { name: 'a zero-radius source', sources: [{ q: 2, r: -3, radius: 0 }] },
];

describe('coveredRowSpans', () => {
  for (const { name, sources } of LAYOUTS) {
    it(`covers exactly the hexes within reach — ${name}`, () => {
      const pad = 5;
      const qMin = Math.min(...sources.map((s) => s.q - s.radius)) - pad;
      const qMax = Math.max(...sources.map((s) => s.q + s.radius)) + pad;
      const rMin = Math.min(...sources.map((s) => s.r - s.radius)) - pad;
      const rMax = Math.max(...sources.map((s) => s.r + s.radius)) + pad;

      const claimed = hexesFromSpans(sources, qMin, qMax);
      const actual = hexesByDistance(sources, qMin, qMax, rMin, rMax);

      // Nothing drawable is dropped — the property the renderer relies on.
      for (const hex of actual) expect(claimed.has(hex), `missing ${hex}`).toBe(true);
      // ...and nothing far outside is swept in, or the clip would buy nothing.
      expect(claimed.size).toBe(actual.size);
    });
  }

  it('returns no spans for a column no source reaches', () => {
    const spans: number[] = [];
    expect(coveredRowSpans(1000, [{ q: 0, r: 0, radius: 18 }], spans)).toBe(0);
  });

  it('keeps a gap between distant sources rather than bridging it', () => {
    const spans: number[] = [];
    // A column both discs reach, with open water between them.
    const sources = [{ q: 0, r: -60, radius: 10 }, { q: 0, r: 60, radius: 10 }];
    expect(coveredRowSpans(0, sources, spans)).toBe(2);
    expect(spans.slice(0, 4)).toEqual([-70, -50, 50, 70]);
  });

  it('merges sources that touch into one span', () => {
    const spans: number[] = [];
    const sources = [{ q: 0, r: 0, radius: 5 }, { q: 0, r: 8, radius: 5 }];
    expect(coveredRowSpans(0, sources, spans)).toBe(1);
    expect(spans.slice(0, 2)).toEqual([-5, 13]);
  });

  it('is order-independent', () => {
    const a: number[] = [];
    const b: number[] = [];
    const sources = [
      { q: 0, r: 0, radius: 18 },
      { q: 3, r: 4, radius: 12 },
      { q: -5, r: 2, radius: 14 },
    ];
    for (let q = -25; q <= 25; q++) {
      const countA = coveredRowSpans(q, sources, a);
      const countB = coveredRowSpans(q, [...sources].reverse(), b);
      expect(countB, `q=${q}`).toBe(countA);
      expect(b.slice(0, countB * 2), `q=${q}`).toEqual(a.slice(0, countA * 2));
    }
  });
});
