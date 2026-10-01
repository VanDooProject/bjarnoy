import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coordKey, hexDistance, neighbors, parseKey, type AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import { isRefusal, resolveWall, type PalisadePiece } from '../../src/frontend/src/lib/map/palisadeTiles';
import type { RiverTile, Terrain, TileOrientation } from '../../src/frontend/src/lib/map/types';
import { canDraw } from './font';
import { centreline, edgeMidpoint, footerLines, hexLine, parseScenario, renderScenario, runScenario, type Scenario } from './pathing';
import { islandStats, RULE_SETS } from './pathing-stats';
import { isWideRiverTile, riverArms, type PathingWorld } from './pathing-world';

const SQRT3 = Math.sqrt(3);
const centreOf = (c: AxialCoord): [number, number] => [1.5 * c.q, SQRT3 * (c.r + c.q / 2)];

const grass = (_c: AxialCoord): Terrain => 'grass';

describe('hexLine', () => {
  it('walks a straight hex line with every step a neighbour', () => {
    const line = hexLine({ q: 0, r: 0 }, { q: 5, r: -3 });
    expect(line[0]).toEqual({ q: 0, r: 0 });
    expect(line.at(-1)).toEqual({ q: 5, r: -3 });
    expect(line).toHaveLength(hexDistance({ q: 0, r: 0 }, { q: 5, r: -3 }) + 1);
    for (let i = 1; i < line.length; i++) expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1);
  });
});

describe('centreline: the art contract, drawn', () => {
  const normal = (d: number): [number, number] => {
    const [x, y] = edgeMidpoint(d);
    return [x / Math.hypot(x, y), y / Math.hypot(x, y)];
  };

  it.each([0, 1, 2, 3, 4, 5])('every piece leaves its edges at the midpoint, square to the edge (edge %i first)', (a: number) => {
    const cases: [PalisadePiece, number[]][] = [
      ['straight180', [a, (a + 3) % 6]],
      ['gate180', [a, (a + 3) % 6]],
      ['bend60', [a, (a + 1) % 6]],
      ['bend120', [a, (a + 2) % 6]],
      ['end', [a]],
      ['end_coast', [a]],
    ];
    for (const [piece, edges] of cases) {
      const line = centreline(piece, edges);
      // First point: the edge midpoint, leaving along the edge normal.
      expect(line[0]![0]).toBeCloseTo(edgeMidpoint(a)[0], 9);
      expect(line[0]![1]).toBeCloseTo(edgeMidpoint(a)[1], 9);
      const [nx, ny] = normal(a);
      const [dx, dy] = [line[1]![0] - line[0]![0], line[1]![1] - line[0]![1]];
      const along = Math.abs(dx * nx + dy * ny) / Math.hypot(dx, dy);
      // An arc's first chord is a few degrees off the tangent, never more than ~10.
      expect(along).toBeGreaterThan(0.97);
      if (edges.length === 2) {
        const last = line.at(-1)!;
        const m = edgeMidpoint(edges[1]!);
        expect(Math.hypot(last[0] - m[0], last[1] - m[1])).toBeLessThan(1e-9);
        const [ex, ey] = [line.at(-1)![0] - line.at(-2)![0], line.at(-1)![1] - line.at(-2)![1]];
        const [mx, my] = normal(edges[1]!);
        expect(Math.abs(ex * mx + ey * my) / Math.hypot(ex, ey)).toBeGreaterThan(0.97);
      }
    }
  });

  it('bend60 turns tightly round the shared corner, bend120 sweeps wider', () => {
    // The 60-degree bend never gets farther from the corner than 0.5; the 120 sweeps r 1.5 about the skipped neighbour's centre.
    const b60 = centreline('bend60', [0, 1]);
    const corner: [number, number] = [(edgeMidpoint(0)[0] * 2 + edgeMidpoint(1)[0] * 2) / 3, (edgeMidpoint(0)[1] * 2 + edgeMidpoint(1)[1] * 2) / 3];
    for (const p of b60) expect(Math.hypot(p[0] - corner[0], p[1] - corner[1])).toBeCloseTo(0.5, 6);
    const b120 = centreline('bend120', [0, 2]);
    const skipped = edgeMidpoint(1);
    for (const p of b120) expect(Math.hypot(p[0] - 2 * skipped[0], p[1] - 2 * skipped[1])).toBeCloseTo(1.5, 6);
  });

  it('pieces of neighbouring hexes meet at the same world point, for every piece the resolver makes', () => {
    // A ring (six bend120), a triangle (three bend60) and a chain with a gate, all on open grass.
    const o = { q: 0, r: 0 };
    const ring = neighbors(o);
    const triangle: AxialCoord[] = [{ q: 5, r: 0 }, { q: 6, r: 0 }, { q: 5, r: 1 }];
    const chain: AxialCoord[] = [0, 1, 2, 3, 4].map((i) => ({ q: -10 + i, r: 6 }));
    const walls = new Set([...ring, ...triangle, ...chain].map(coordKey));
    const tiles = resolveWall({ walls, gates: new Set([coordKey(chain[2]!)]) }, grass, parseKey);
    const pieces = new Set<string>();
    for (const [key, tile] of tiles) {
      expect(isRefusal(tile)).toBe(false);
      if (isRefusal(tile)) continue;
      pieces.add(tile.piece);
      const c = parseKey(key);
      const line = centreline(tile.piece, tile.edges);
      for (const d of tile.edges) {
        const n = neighbors(c)[d]!;
        const neighbourTile = tiles.get(coordKey(n))!;
        if (isRefusal(neighbourTile)) throw new Error('refused neighbour');
        // The neighbour runs back into this hex through the opposite edge.
        expect(neighbourTile.edges).toContain((d + 3) % 6);
        const mine = edgeMidpoint(d);
        const theirs = edgeMidpoint((d + 3) % 6);
        const [cx, cy] = centreOf(c);
        const [nx, ny] = centreOf(n);
        expect(cx + mine[0]).toBeCloseTo(nx + theirs[0], 9);
        expect(cy + mine[1]).toBeCloseTo(ny + theirs[1], 9);
        expect(line.some((p) => Math.hypot(p[0] - mine[0], p[1] - mine[1]) < 1e-9)).toBe(true);
      }
    }
    expect([...pieces].sort()).toEqual(['bend120', 'bend60', 'end', 'gate180', 'straight180']);
  });
});

describe('scenario files', () => {
  const dir = join(new URL('./scenarios', import.meta.url).pathname);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('ship at least the six rules, each parsing and drawable in the bitmap font', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      const scn = parseScenario(readFileSync(join(dir, f), 'utf8'), f);
      expect(f).toBe(`${scn.name}.json`);
      expect(canDraw(scn.name)).toBe(true);
      expect(canDraw(scn.title ?? '')).toBe(true);
    }
  });

  it('rejects malformed scenarios', () => {
    const ok = { name: 'x', seed: 1, radius: 10, window: { q: 0, r: 0, size: 5 } };
    expect(() => parseScenario(JSON.stringify({ ...ok, name: '' }))).toThrow(/name/);
    expect(() => parseScenario(JSON.stringify({ ...ok, window: undefined }))).toThrow(/window/);
    expect(() => parseScenario(JSON.stringify({ ...ok, routes: [{ from: [0, 0], to: [1, 1], army: 'ally' }] }))).toThrow(/army/);
    expect(() => parseScenario(JSON.stringify({ ...ok, walls: [[0, 'a']] }))).toThrow(/pairs/);
  });

  const load = (name: string): Scenario => parseScenario(readFileSync(join(dir, `${name}.json`), 'utf8'), name);

  // The seed-11 worlds are generated by the real client generator; these pin what each scenario is there to show.
  it('c: a wall from a wide river to the sea seals; the enemy has no route in, the friendly army uses the gate', { timeout: 60_000 }, () => {
    const run = runScenario(load('c-sea-end-seals'));
    expect(run.refused).toEqual([]);
    expect([...run.tiles.values()].map((t) => (isRefusal(t) ? 'refused' : t.piece)).filter((p) => p === 'end_coast')).toHaveLength(1);
    expect(run.routes[0]!.path).toBeNull();
    expect(run.routes[0]!.before).not.toBeNull();
    expect(run.routes[1]!.path).not.toBeNull();
    expect(run.routes[1]!.path!.some((c) => run.wall.gates!.has(coordKey(c)))).toBe(true);
    for (const r of run.routes) for (const c of r.path ?? []) if (!run.wall.gates!.has(coordKey(c))) expect(run.wall.walls.has(coordKey(c))).toBe(false);
    expect(footerLines(run).join('\n')).toContain('NO ROUTE');
  });

  it('d: a land end at the coast is half open, the sea end still seals', { timeout: 60_000 }, () => {
    const touching = runScenario(load('d-land-end-at-coast'));
    // The end by the sea is half open; the end at the river is sealed.
    expect([...touching.halfOpen]).toEqual([coordKey({ q: 209, r: -651 })]);
    const path = touching.routes[0]!.path!;
    expect(path).not.toBeNull();
    expect(path.some((c) => touching.halfOpen.has(coordKey(c)))).toBe(true);
    expect(path.filter((c) => touching.wall.walls.has(coordKey(c)))).toHaveLength(1);
    expect(runScenario(load('c-sea-end-seals')).halfOpen.size).toBe(0);
    const short = runScenario(load('d2-land-end-one-short'));
    expect(short.routes[0]!.path).not.toBeNull();
    expect(short.routes[0]!.path!.length).toBeGreaterThan(short.routes[0]!.before!.length);
  });

  it('a: the wide river is walked round, the stream is crossed', { timeout: 60_000 }, () => {
    const run = runScenario(load('a-wide-river-vs-stream'));
    const [wide, stream] = run.routes;
    expect(wide!.path!.length).toBeGreaterThan(3 * wide!.before!.length);
    expect(wide!.path!.every((c) => !run.pw.isWideRiver(c))).toBe(true);
    expect(stream!.path!.some((c) => run.pw.isRiver(c))).toBe(true);
    expect(stream!.cost).toBe(stream!.before!.cost);
  });

  it('b and e: mountains force a detour, a wall from a mountain to a wide river seals', { timeout: 60_000 }, () => {
    const b = runScenario(load('b-mountains-block'));
    expect(b.routes[0]!.path!.length).toBeGreaterThan(2 * b.routes[0]!.before!.length);
    expect(b.routes[0]!.path!.every((c) => b.pw.terrainAt(c) !== 'mountain')).toBe(true);
    const e = runScenario(load('e-mountain-to-river-seals'));
    expect(e.routes[0]!.path).toBeNull();
    expect(e.routes[0]!.before).not.toBeNull();
  });

  it('f: every piece type shows up and the refused placements are named', { timeout: 60_000 }, () => {
    const run = runScenario(load('f-every-piece'));
    const pieces = new Set([...run.tiles.values()].map((t) => (isRefusal(t) ? t.refusal : t.piece)));
    expect([...pieces].sort()).toEqual(['bend120', 'bend60', 'end', 'end_coast', 'gate180', 'straight180']);
    expect(run.refused.map((r) => r.reason).sort()).toEqual(['branch', 'gateNotStraight']);
  });

  it('renders a scenario to a PNG with its footer', { timeout: 60_000 }, () => {
    const { png, lines } = renderScenario(load('e-mountain-to-river-seals'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(lines.some((l) => l.startsWith('ROUTE A ENEMY') && l.includes('NO ROUTE'))).toBe(true);
  });
});

describe('pathing-stats', () => {
  // A 7x1 strip of land with one mountain in the middle: the mountain splits it in two.
  const strip = (cells: Terrain[]): { tiles: AxialCoord[]; pw: PathingWorld } => {
    const tiles = cells.map((_, i) => ({ q: i, r: 0 }));
    const pw = {
      terrainAt: (c: AxialCoord) => cells[c.q] ?? 'sea',
      isRiver: () => false,
      riverAt: () => undefined,
      isWideRiver: () => false,
      isCoastalWater: () => false,
    } as unknown as PathingWorld;
    return { tiles, pw };
  };

  it('counts what a mountain cuts off, and the mountain itself as blocked', () => {
    const { tiles, pw } = strip(['grass', 'grass', 'grass', 'mountain', 'grass', 'grass', 'grass', 'grass']);
    const decided = RULE_SETS.find((r) => r.label.startsWith('decided:'))!;
    const stat = islandStats(tiles, pw, decided, 0);
    expect(stat).toMatchObject({ tiles: 8, blocked: 1, walkable: 7, unreachable: 3, components: 2 });
    expect(islandStats(tiles, pw, RULE_SETS[0]!, 0)).toMatchObject({ blocked: 0, unreachable: 0, components: 1 });
  });
});

describe('which river tiles are wide (arm widths)', () => {
  // Tile at (0,0); neighbour directions E (1,0), NE (1,-1), NW (0,-1), W (-1,0), SW (-1,1), SE (0,1).
  const tile = (width: RiverTile['width'], ins: TileOrientation[], out: TileOrientation | null, shape: RiverTile['shape'] = 'straight'): RiverTile => ({
    q: 0, r: 0, shape, inDirections: ins, outDirection: out, width,
  });
  const upstream = (q: number, r: number, width: RiverTile['width']): RiverTile => ({ q, r, shape: 'straight', inDirections: [], outDirection: 'W', width });
  const at = (...tiles: RiverTile[]) => (c: { q: number; r: number }) => tiles.find((t) => t.q === c.q && t.r === c.r);

  it('a stream joining a river at the Y (riverstream) is wide: part of the river', () => {
    const y = tile('riverstream', ['NW', 'E'], 'W', 'confluence');
    const riverAt = at(upstream(0, -1, 'stream'), upstream(1, 0, 'river'));
    expect(riverArms(y, riverAt)).toEqual({ river: 2, stream: 1 });
    expect(isWideRiverTile(y, riverAt)).toBe(true);
  });

  it('a widen tile (stream in, river out) and a plain stream stay crossable', () => {
    const widen = tile('widen', ['E'], 'W');
    expect(riverArms(widen, at(upstream(1, 0, 'stream')))).toEqual({ river: 1, stream: 1 });
    expect(isWideRiverTile(widen, at(upstream(1, 0, 'stream')))).toBe(false);
    const stream = tile('stream', ['E'], 'W');
    expect(isWideRiverTile(stream, at(upstream(1, 0, 'stream')))).toBe(false);
    // Two streams meeting where the river begins: still only the out-arm is river.
    const meet = tile('widen', ['E', 'NW'], 'SW', 'confluence');
    expect(isWideRiverTile(meet, at(upstream(1, 0, 'stream'), upstream(0, -1, 'stream')))).toBe(false);
  });

  it('river tiles are wide: through, with a creek or lake upstream, and at a mouth', () => {
    expect(isWideRiverTile(tile('river', ['E'], 'W'), at(upstream(1, 0, 'river')))).toBe(true);
    expect(isWideRiverTile(tile('river', ['E'], 'W'), at())).toBe(true);
    expect(isWideRiverTile(tile(undefined, ['E'], null, 'mouth'), at(upstream(1, 0, 'widen')))).toBe(true);
    // A stream reaching the sea head-on widens on the mouth tile itself: crossable.
    expect(isWideRiverTile(tile('widen', ['E'], null, 'mouth'), at(upstream(1, 0, 'stream')))).toBe(false);
  });
});
