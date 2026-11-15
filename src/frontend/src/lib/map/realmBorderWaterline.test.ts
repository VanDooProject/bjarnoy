// Realm-border geometry on the waterline. The scenes mirror the design study's test scenes: 'S' is land, 'W' sea (drawn lowered in the
// settlement view), the owner grid names the realm of each hex, both in offset (col, row) like the study.
import { describe, expect, it } from 'vitest';
import { axialToOddQ, oddQToAxial, type AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';
import { clippedStrokePieces, type Pt } from './convexPolygon';
import { insetBorderCorners } from './realmBorderEdges';
import { createWaterlineBorders, hexesAtCorner, type BorderLinePiece, type HexBorderGeometry } from './realmBorderWaterline';
import { neighbourAcrossEdge, ownedAcrossEdges } from './realmBorders';
import { TILE_ART_SEA_TOPFACE_DROP_FRAC } from './textures';

const W = 168;
const H = (W * 92) / 200;
const SEA_DROP = W * TILE_ART_SEA_TOPFACE_DROP_FRAC;

interface Scene {
  rows: number;
  cols: number;
  isSea(c: AxialCoord): boolean;
  owner(c: AxialCoord): string | undefined;
  hexes(): AxialCoord[];
}

function scene(terrain: string[], owners: string[]): Scene {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
  return {
    rows,
    cols,
    isSea: (c) => {
      const { col, row } = axialToOddQ(c);
      return terrain[clamp(row, rows)][clamp(col, cols)] === 'W';
    },
    owner: (c) => {
      const { col, row } = axialToOddQ(c);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return undefined;
      const o = owners[row][col];
      return o === '.' ? undefined : o;
    },
    hexes: () => Array.from({ length: rows * cols }, (_, i) => oddQToAxial({ col: i % cols, row: Math.floor(i / cols) })),
  };
}

const at = (col: number, row: number) => oddQToAxial({ col, row });

function geometryOf(s: Scene, settlement = true): Map<string, HexBorderGeometry> {
  const g = createWaterlineBorders({ realmBorderOwnerAt: (q, r) => s.owner({ q, r }), isLowered: (q, r) => settlement && s.isSea({ q, r }) }, W, H);
  const out = new Map<string, HexBorderGeometry>();
  for (const c of s.hexes()) {
    const owner = s.owner(c);
    if (owner) out.set(`${c.q},${c.r}`, g.hexGeometry(c, owner));
  }
  return out;
}

const topOf = (c: AxialCoord): Pt[] => {
  const g = isoGridPosition(c, W, H);
  return isoTopPoints(W, H).map((p) => ({ x: g.x + p.x, y: g.y + p.y }));
};

/** How far inside the convex polygon `p` is (smallest distance to an edge line; negative outside), for either winding. */
function depthInside(p: Pt, poly: readonly Pt[]): number {
  const cx = poly.reduce((s, q) => s + q.x, 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q.y, 0) / poly.length;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const sign = (b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x) >= 0 ? 1 : -1;
    min = Math.min(min, (sign * cross) / len);
  }
  return min;
}

const isVertical = (l: BorderLinePiece) => Math.abs(l.a.x - l.b.x) < 1e-6 && Math.abs(l.a.y - l.b.y) > 1e-6;
const isHorizontalAt = (l: BorderLinePiece, y: number) => Math.abs(l.a.y - y) < 1e-6 && Math.abs(l.b.y - y) < 1e-6 && Math.abs(l.a.x - l.b.x) > 1e-6;

const linesOf = (g: Map<string, HexBorderGeometry>) => [...g.values()].flatMap((h) => h.lines);

/** y of the inset top (edge 1) or bottom (edge 4) line of a hex, before any drop. */
function insetEdgeY(s: Scene, c: AxialCoord, edge: 1 | 4): number {
  const owner = s.owner(c)!;
  const inset = insetBorderCorners(topOf(c), ownedAcrossEdges({ realmBorderOwnerAt: (q, r) => s.owner({ q, r }) }, c, owner));
  return inset[edge]!.y;
}

describe('hexesAtCorner', () => {
  it('names, for every corner of every hex, three hexes whose own corner index is at the same point', () => {
    for (const c of [at(0, 0), at(1, 0), at(2, 3), at(3, 2), at(-2, -1)]) {
      for (let k = 0; k < 6; k++) {
        const v = topOf(c)[k];
        const hexes = hexesAtCorner(c, k);
        expect(new Set(hexes.map((h) => `${h.c.q},${h.c.r}`)).size).toBe(3);
        for (const h of hexes) {
          const p = topOf(h.c)[h.k];
          expect(Math.hypot(p.x - v.x, p.y - v.y)).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe('waterline border geometry', () => {
  it('sea realm with land to the north: the north edges sit one sea drop lower', () => {
    const s = scene(['SSSSSS', 'SSSSSS', 'WWWWWW', 'WWWWWW', 'WWWWWW'], ['......', '......', '.aaaa.', '.aaaa.', '......']);
    const lines = linesOf(geometryOf(s));
    const c = at(2, 2);
    expect(lines.some((l) => isHorizontalAt(l, insetEdgeY(s, c, 1) + SEA_DROP))).toBe(true);
    expect(lines.some((l) => isHorizontalAt(l, insetEdgeY(s, c, 1)))).toBe(false);
  });

  it('sea realm with land to the south: the front edges stay on the grid and no line point lies on the land in front', () => {
    const s = scene(['WWWWWW', 'WWWWWW', 'WWWWWW', 'SSSSSS', 'SSSSSS'], ['......', '.aaaa.', '.aaaa.', '......', '......']);
    const g = geometryOf(s);
    const lines = linesOf(g);
    expect(lines.some((l) => isHorizontalAt(l, insetEdgeY(s, at(2, 2), 4)))).toBe(true);
    const land = s.hexes().filter((c) => !s.isSea(c) && axialToOddQ(c).row === 3).map(topOf);
    for (const l of lines.filter((p) => !p.clip)) {
      for (const p of [l.a, l.b]) for (const face of land) expect(depthInside(p, face)).toBeLessThan(0.5);
    }
  });

  it('land realm with sea to the south: the front edges drop with the sea and a vertical connector shows the sand skirt', () => {
    const s = scene(['SSSSSS', 'SSSSSS', 'SSSSSS', 'WWWWWW', 'WWWWWW'], ['......', '.aaaa.', '.aaaa.', '......', '......']);
    const lines = linesOf(geometryOf(s));
    expect(lines.some((l) => isHorizontalAt(l, insetEdgeY(s, at(2, 2), 4) + SEA_DROP))).toBe(true);
    const connectors = lines.filter(isVertical);
    expect(connectors.length).toBeGreaterThan(0);
    for (const c of connectors) expect(Math.abs(c.a.y - c.b.y)).toBeCloseTo(SEA_DROP);
  });

  it('land realm with sea to the north: nothing drops', () => {
    const s = scene(['WWWWWW', 'WWWWWW', 'SSSSSS', 'SSSSSS', 'SSSSSS'], ['......', '......', '.aaaa.', '.aaaa.', '......']);
    const lines = linesOf(geometryOf(s));
    expect(lines.some((l) => isHorizontalAt(l, insetEdgeY(s, at(2, 2), 1)))).toBe(true);
    expect(lines.filter(isVertical)).toEqual([]);
  });

  describe('a border crossing a coast', () => {
    const scenes = {
      'sea to the west': scene(['WWWSSS', 'WWWSSS', 'WWWSSS', 'WWWSSS', 'WWWSSS'], ['......', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......']),
      'diagonal coast': scene(['WWWWSS', 'WWWSSS', 'WWSSSS', 'WSSSSS', 'SSSSSS'], ['......', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......']),
    };

    for (const [name, s] of Object.entries(scenes)) {
      it(`${name}: the lowered line is clipped by the land in front, down to the coast`, () => {
        const lines = linesOf(geometryOf(s));
        const clipped = lines.filter((l) => l.clip);
        expect(clipped.length).toBeGreaterThan(0);
        let touchesCoast = false;
        for (const l of clipped) {
          for (const [width] of [[7], [2.5]]) {
            for (const piece of clippedStrokePieces(l.a, l.b, width, l.clip!)) {
              for (const p of piece) {
                for (const face of l.clip!) {
                  // no vertex strictly inside the top face of the land in front: nothing of the line, glow included, is drawn on it
                  expect(depthInside(p, face)).toBeLessThan(1e-6);
                  if (Math.abs(depthInside(p, face)) < 1e-6) touchesCoast = true;
                }
              }
            }
          }
        }
        expect(touchesCoast).toBe(true);
      });
    }

    it('clips by the raw, undropped top face of a land hex', () => {
      const lines = linesOf(geometryOf(scenes['sea to the west']));
      const faces = new Set(
        scenes['sea to the west'].hexes().filter((c) => !scenes['sea to the west'].isSea(c)).map((c) => topOf(c).map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')),
      );
      for (const l of lines.filter((p) => p.clip)) for (const face of l.clip!) expect(faces.has(face.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';'))).toBe(true);
    });
  });

  it('two realms meeting on the coast: each keeps its own lowered lines and the washes do not overlap', () => {
    const s = scene(['SSSSSS', 'SSSSSS', 'SSSSSS', 'WWWWWW', 'WWWWWW'], ['......', 'aaabbb', 'aaabbb', 'aaabbb', '......']);
    expectWashesTessellate(s);
    const g = geometryOf(s);
    const a = g.get(`${at(1, 3).q},${at(1, 3).r}`)!;
    const b = g.get(`${at(4, 3).q},${at(4, 3).r}`)!;
    expect(a.lines.length).toBeGreaterThan(0);
    expect(b.lines.length).toBeGreaterThan(0);
    // the sea row is lowered, so its outline sits below its inset grid line
    expect(a.lines.some((l) => isHorizontalAt(l, insetEdgeY(s, at(1, 3), 4) + SEA_DROP))).toBe(true);
  });

  it('island in a sea realm: the ring drops on the island side that is behind it, and stays on the grid where the island is in front', () => {
    const s = scene(['WWWWWW', 'WWWWWW', 'WWSWWW', 'WWWWWW', 'WWWWWW'], ['......', '.aaaa.', '.a.aa.', '.aaaa.', '......']);
    const g = geometryOf(s);
    const island = at(2, 2);
    const above = neighbourAcrossEdge(island, 1);
    const below = neighbourAcrossEdge(island, 4);
    // above the island the realm's bottom edge faces the island in front of it: on the grid
    expect(g.get(`${above.q},${above.r}`)!.lines.some((l) => isHorizontalAt(l, insetEdgeY(s, above, 4)))).toBe(true);
    // below the island the realm's top edge is its own back, the sea in front: one sea drop lower
    expect(g.get(`${below.q},${below.r}`)!.lines.some((l) => isHorizontalAt(l, insetEdgeY(s, below, 1) + SEA_DROP))).toBe(true);
    const face = topOf(island);
    for (const l of linesOf(g).filter((p) => !p.clip)) for (const p of [l.a, l.b]) expect(depthInside(p, face)).toBeLessThan(0.5);
  });

  it('washes of neighbouring owned hexes do not overlap on any scene', () => {
    for (const s of [
      scene(['SSSSSS', 'SSSSSS', 'WWWWWW', 'WWWWWW', 'WWWWWW'], ['......', '......', '.aaaa.', '.aaaa.', '......']),
      scene(['WWWWSS', 'WWWSSS', 'WWSSSS', 'WSSSSS', 'SSSSSS'], ['......', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......']),
      scene(['SSWWWW', 'SSSWWW', 'SSSSWW', 'SSSSSW', 'SSSSSS'], ['......', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......']),
      scene(['WWWWWW', 'WWWWWW', 'WWSWWW', 'WWWWWW', 'WWWWWW'], ['......', '.aaaa.', '.a.aa.', '.aaaa.', '......']),
    ]) expectWashesTessellate(s);
  });

  it('world mode lowers nothing: the wash is the top face and every outline edge is one inset line, as before', () => {
    const s = scene(['WWWSSS', 'WWWSSS', 'WWSSSS', 'WSSSSS', 'SSSSSS'], ['......', 'aaaaaa', 'aaaaaa', 'aaaaaa', '......']);
    for (const c of s.hexes()) {
      const owner = s.owner(c);
      if (!owner) continue;
      const geo = geometryOf(s, false).get(`${c.q},${c.r}`)!;
      const top = topOf(c);
      expect(geo.wash).toEqual(top);
      const owned = ownedAcrossEdges({ realmBorderOwnerAt: (q, r) => s.owner({ q, r }) }, c, owner);
      const inset = insetBorderCorners(top, owned);
      const outline = owned.map((o, e) => (o ? -1 : e)).filter((e) => e >= 0);
      expect(geo.lines).toHaveLength(outline.length);
      outline.forEach((e, i) => {
        expect(geo.lines[i].a).toEqual(inset[e]);
        expect(geo.lines[i].b).toEqual(inset[(e + 1) % 6]);
        expect(geo.lines[i].clip).toBeUndefined();
        expect(geo.lines[i].layer).toBe(e < 3 ? 'back' : 'front');
      });
    }
  });
});

describe('connectors and layers', () => {
  it('a land hex in a sea realm: both cliff steps draw over its topping, each exactly once, and edges keep their own layer', () => {
    // only the island's own outline: a realm of one land hex surrounded by sea
    const one = scene(['WWWWW', 'WWWWW', 'WWSWW', 'WWWWW', 'WWWWW'], ['.....', '.....', '..a..', '.....', '.....']);
    const geo = geometryOf(one).get(`${at(2, 2).q},${at(2, 2).r}`)!;
    const connectors = geo.lines.filter(isVertical);
    expect(connectors).toHaveLength(2);
    expect(connectors.every((c) => c.layer === 'front')).toBe(true);
    const keys = connectors.map((c) => [c.a.x, c.a.y, c.b.x, c.b.y].map((n) => n.toFixed(4)).join());
    expect(new Set(keys).size).toBe(2);
    const edges = geo.lines.filter((l) => !isVertical(l));
    expect(edges).toHaveLength(6);
    expect(edges.map((l) => l.layer)).toEqual(['back', 'back', 'back', 'front', 'front', 'front']);
  });

  it('emits every connector of a realm once', () => {
    const s = scene(['SSSSSS', 'SSSSSS', 'SSSSSS', 'WWWWWW', 'WWWWWW'], ['......', '.aaaa.', '.aaaa.', '......', '......']);
    const connectors = linesOf(geometryOf(s)).filter(isVertical);
    const keys = connectors.map((c) => [c.a.x, c.a.y, c.b.x, c.b.y].map((n) => n.toFixed(4)).join());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('inland hexes', () => {
  it('give the same geometry whether or not the world has sea elsewhere', () => {
    const coast = scene(['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'WWWWWW'], ['......', 'aaaaaa', 'aaaaaa', '......', '......']);
    const inland = geometryOf(coast).get(`${at(2, 1).q},${at(2, 1).r}`)!;
    const asWorld = geometryOf(coast, false).get(`${at(2, 1).q},${at(2, 1).r}`)!;
    expect(inland).toEqual(asWorld);
  });
});

describe('invariants', () => {
  it('never throws on scrambled coasts and realms', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 40; n++) {
      const terrain = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => (rnd() < 0.45 ? 'W' : 'S')).join(''));
      const owners = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => (rnd() < 0.7 ? 'a' : rnd() < 0.5 ? 'b' : '.')).join(''));
      expect(() => geometryOf(scene(terrain, owners))).not.toThrow();
    }
  });
});

/**
 * The washes of all owned hexes never overlap (sampled on a fine grid), also where a hex's wash tilts at a coast: neighbouring
 * washes meet along their shared, dropped edge.
 */
function expectWashesTessellate(s: Scene) {
  const washes = [...geometryOf(s).values()].map((h) => h.wash);
  const inside = (p: Pt, poly: Pt[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const xs = washes.flat().map((p) => p.x);
  const ys = washes.flat().map((p) => p.y);
  let overlaps = 0;
  for (let x = Math.min(...xs) + 0.37; x < Math.max(...xs); x += 3) {
    for (let y = Math.min(...ys) + 0.41; y < Math.max(...ys); y += 3) {
      if (washes.filter((w) => inside({ x, y }, w)).length > 1) overlaps++;
    }
  }
  expect(overlaps).toBe(0);
}
