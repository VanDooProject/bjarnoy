import { describe, expect, it } from 'vitest';
import { coordKey, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import {
  canPlacePalisade,
  classifyEnd,
  dirForWestEdge,
  isRefusal,
  PALISADE_FAMILY,
  palisadeTileFor,
  pieceEdges,
  resolveWall,
  tileOfWallHex,
  westEdgeOfDir,
  type PalisadePiece,
  type PlacementContext,
  type WallSet,
} from './palisadeTiles';
import { bend60OrientationOf, bendOrientationOf, straightOrientationOf, TILE_ORIENTATIONS, type Terrain } from './types';

const flags = (dirs: number[]): boolean[] => [0, 1, 2, 3, 4, 5].map((d) => dirs.includes(d));

describe('palisadeTileFor: every piece in all six rotations', () => {
  const rotations = [0, 1, 2, 3, 4, 5];

  it.each(rotations)('straight / gate with W at direction %i', (dW) => {
    for (const piece of ['straight180', 'gate180'] as const) {
      const edges = pieceEdges(piece, dirForWestEdge(dW));
      expect(edges).toEqual([dW, (dW + 3) % 6]);
      const result = palisadeTileFor({ wallNeighbours: flags(edges), gate: piece === 'gate180' });
      expect(isRefusal(result)).toBe(false);
      if (isRefusal(result)) return;
      expect(result.piece).toBe(piece);
      // A straight is symmetric: either end may be the file's W edge, the pair of edges is what counts.
      expect([...result.edges].sort()).toEqual([...edges].sort());
      expect([straightOrientationOf(TILE_ORIENTATIONS[edges[0]!]!), straightOrientationOf(TILE_ORIENTATIONS[edges[1]!]!)]).toContain(
        result.dir,
      );
    }
  });

  it.each(rotations)('bend60 with W at direction %i (W-SW)', (dW) => {
    const dir = dirForWestEdge(dW);
    const edges = pieceEdges('bend60', dir);
    expect(edges).toEqual([dW, (dW + 1) % 6]);
    const result = palisadeTileFor({ wallNeighbours: flags(edges) });
    expect(result).toEqual({ piece: 'bend60', dir, edges });
    // Same file the river hairpin picks for the same pair of edges, in either flow direction.
    const [a, b] = edges.map((d) => TILE_ORIENTATIONS[d]!) as [(typeof TILE_ORIENTATIONS)[number], (typeof TILE_ORIENTATIONS)[number]];
    expect(bend60OrientationOf(a, b)).toBe(dir);
    expect(bend60OrientationOf(b, a)).toBe(dir);
  });

  it.each(rotations)('bend120 with W at direction %i (W-SE)', (dW) => {
    const dir = dirForWestEdge(dW);
    const edges = pieceEdges('bend120', dir);
    expect(edges).toEqual([dW, (dW + 2) % 6]);
    const result = palisadeTileFor({ wallNeighbours: flags(edges) });
    expect(result).toEqual({ piece: 'bend120', dir, edges });
    const [a, b] = edges.map((d) => TILE_ORIENTATIONS[d]!) as [(typeof TILE_ORIENTATIONS)[number], (typeof TILE_ORIENTATIONS)[number]];
    expect(bendOrientationOf(a, b)).toBe(dir);
    expect(bendOrientationOf(b, a)).toBe(dir);
  });

  it.each(rotations)('end and end_coast pointing at direction %i', (d) => {
    const dir = dirForWestEdge(d);
    expect(westEdgeOfDir(dir)).toBe(d);
    expect(palisadeTileFor({ wallNeighbours: flags([d]) })).toEqual({ piece: 'end', dir, edges: [d] });
    expect(palisadeTileFor({ wallNeighbours: flags([d]), coastalWater: true })).toEqual({ piece: 'end_coast', dir, edges: [d] });
    // The same file the river's single-edge pieces use for that edge.
    expect(dir).toBe(straightOrientationOf(TILE_ORIENTATIONS[d]!));
  });

  it('gives six distinct files for the six rotations of a bend and an end', () => {
    for (const piece of ['bend60', 'bend120', 'end'] as const) {
      const dirs = new Set(rotations.map((d) => pieceEdges(piece, dirForWestEdge(d)).join()));
      expect(dirs.size).toBe(6);
    }
  });

  it('recognises the pair whichever way round the wrap-around falls', () => {
    // Neighbours 5 and 0 are adjacent (diff 5 the other way round): a bend60 whose W is 5.
    expect(palisadeTileFor({ wallNeighbours: flags([0, 5]) })).toMatchObject({ piece: 'bend60', edges: [5, 0] });
    expect(palisadeTileFor({ wallNeighbours: flags([0, 4]) })).toMatchObject({ piece: 'bend120', edges: [4, 0] });
  });

  it('names an atlas family for every piece', () => {
    const pieces: PalisadePiece[] = ['straight180', 'bend60', 'bend120', 'gate180', 'end', 'end_coast'];
    for (const p of pieces) expect(PALISADE_FAMILY[p]).toBe(`palisade_${p}`);
  });
});

describe('palisadeTileFor: refusals', () => {
  it('refuses a branch (three or more wall neighbours), on land and at the coast', () => {
    expect(palisadeTileFor({ wallNeighbours: flags([0, 2, 4]) })).toEqual({ refusal: 'branch' });
    expect(palisadeTileFor({ wallNeighbours: flags([0, 1, 3]) })).toEqual({ refusal: 'branch' });
    expect(palisadeTileFor({ wallNeighbours: flags([0, 1, 2, 3, 4, 5]) })).toEqual({ refusal: 'branch' });
    expect(palisadeTileFor({ wallNeighbours: flags([0, 3]), coastalWater: true })).toEqual({ refusal: 'branch' });
  });

  it('refuses a gate that is not on a straight', () => {
    expect(palisadeTileFor({ wallNeighbours: flags([0, 1]), gate: true })).toEqual({ refusal: 'gateNotStraight' });
    expect(palisadeTileFor({ wallNeighbours: flags([0, 2]), gate: true })).toEqual({ refusal: 'gateNotStraight' });
    expect(palisadeTileFor({ wallNeighbours: flags([2]), gate: true })).toEqual({ refusal: 'gateNotStraight' });
    expect(palisadeTileFor({ wallNeighbours: flags([]), gate: true })).toEqual({ refusal: 'gateNotStraight' });
  });

  it('refuses a gate on water and reports a lone hex as isolated', () => {
    expect(palisadeTileFor({ wallNeighbours: flags([0]), coastalWater: true, gate: true })).toEqual({ refusal: 'notAllowedOnTerrain' });
    expect(palisadeTileFor({ wallNeighbours: flags([]) })).toEqual({ refusal: 'isolated' });
    expect(palisadeTileFor({ wallNeighbours: flags([]), coastalWater: true })).toEqual({ refusal: 'isolated' });
  });
});

/** A small flat world: land everywhere in a disc except what a test overrides. */
function world(overrides: Record<string, Terrain> = {}, rivers: string[] = [], wide: string[] = []): PlacementContext {
  const riverSet = new Set(rivers);
  const wideSet = new Set(wide);
  return {
    terrainAt: (c) => overrides[coordKey(c)] ?? (Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) > 8 ? 'sea' : 'grass'),
    isRiver: (c) => riverSet.has(coordKey(c)) || wideSet.has(coordKey(c)),
    isWideRiver: (c) => wideSet.has(coordKey(c)),
  };
}

const wallOf = (coords: AxialCoord[], gates: AxialCoord[] = []): WallSet => ({
  walls: new Set(coords.map(coordKey)),
  gates: new Set(gates.map(coordKey)),
});

describe('canPlacePalisade', () => {
  const o = { q: 0, r: 0 };
  const E = neighbors(o)[0]!; // direction 0
  const line = [o, E, { q: 2, r: 0 }];

  it('allows the first hex and extending a line', () => {
    expect(canPlacePalisade(o, wallOf([]), world())).toEqual({ ok: true });
    expect(canPlacePalisade({ q: 2, r: 0 }, wallOf([o, E]), world())).toEqual({ ok: true });
  });

  it('refuses a hex that is already a wall', () => {
    expect(canPlacePalisade(E, wallOf(line), world())).toEqual({ ok: false, reason: 'occupied' });
  });

  it('refuses mountain, lake, bog and every river hex (stream or wide)', () => {
    const t = (terrain: Terrain) => canPlacePalisade(o, wallOf([]), world({ [coordKey(o)]: terrain }));
    for (const terrain of ['mountain', 'lake', 'bog'] as const) expect(t(terrain)).toEqual({ ok: false, reason: 'notAllowedOnTerrain' });
    expect(canPlacePalisade(o, wallOf([]), world({}, [coordKey(o)]))).toEqual({ ok: false, reason: 'notAllowedOnTerrain' });
    expect(canPlacePalisade(o, wallOf([]), world({}, [], [coordKey(o)]))).toEqual({ ok: false, reason: 'notAllowedOnTerrain' });
  });

  it('allows a sea end next to exactly one land wall hex, and nothing else on water', () => {
    const sea = { q: 3, r: 0 };
    const ctx = world({ [coordKey(sea)]: 'sea' });
    expect(canPlacePalisade(sea, wallOf([o, E, { q: 2, r: 0 }]), ctx)).toEqual({ ok: true });
    // Nothing to hang off.
    expect(canPlacePalisade(sea, wallOf([]), ctx)).toEqual({ ok: false, reason: 'notAllowedOnTerrain' });
    // Two wall neighbours: the sea hex would branch.
    expect(canPlacePalisade(sea, wallOf([{ q: 2, r: 0 }, { q: 2, r: 1 }]), ctx)).toEqual({ ok: false, reason: 'branch' });
    // A sea end cannot chain onto another sea end.
    const sea2 = { q: 4, r: 0 };
    expect(canPlacePalisade(sea2, wallOf([{ q: 3, r: 0 }]), world({ [coordKey(sea)]: 'sea', [coordKey(sea2)]: 'sea' }))).toEqual({
      ok: false,
      reason: 'notAllowedOnTerrain',
    });
    // No gate on water.
    expect(canPlacePalisade(sea, wallOf([{ q: 2, r: 0 }]), ctx, { gate: true })).toEqual({ ok: false, reason: 'notAllowedOnTerrain' });
  });

  it('refuses a hex that would give a neighbour three wall neighbours, naming the branch', () => {
    // A straight o-E-(2,0); a hex beside E would give E a third neighbour.
    for (const side of [neighbors(E)[1]!, neighbors(E)[5]!, neighbors(E)[2]!, neighbors(E)[4]!]) {
      expect(canPlacePalisade(side, wallOf(line), world())).toEqual({ ok: false, reason: 'branch' });
    }
  });

  it('refuses a hex that touches the wall twice (a hex that has three neighbours itself)', () => {
    // (1,1)... build a U: placing the middle of three wall hexes around it.
    const centre = { q: 0, r: 0 };
    const around = [neighbors(centre)[0]!, neighbors(centre)[2]!, neighbors(centre)[4]!];
    expect(canPlacePalisade(centre, wallOf(around), world())).toEqual({ ok: false, reason: 'branch' });
  });

  it('allows a bend and a turn that leaves every neighbour with at most two wall neighbours', () => {
    expect(canPlacePalisade(neighbors(E)[1]!, wallOf([o, E]), world())).toEqual({ ok: true }); // E becomes a bend
  });

  it('refuses a hex that would bend an existing gate, but lets a gate wait for its wall', () => {
    const gateWall = wallOf(line, [E]);
    expect(canPlacePalisade(neighbors(E)[1]!, gateWall, world())).toEqual({ ok: false, reason: 'branch' });
    // A gate with a single neighbour so far is unfinished, and a turn after it is refused only once it has two.
    expect(canPlacePalisade(neighbors(E)[1]!, wallOf([o, E], [E]), world())).toEqual({ ok: false, reason: 'gateNotStraight' });
    expect(canPlacePalisade({ q: 2, r: 0 }, wallOf([o, E], [E]), world())).toEqual({ ok: true });
  });

  it('places a gate only on a straight, or upgrades one', () => {
    expect(canPlacePalisade(E, wallOf(line), world(), { gate: true })).toEqual({ ok: true });
    // On a bend: refused.
    const bend = [o, E, neighbors(E)[1]!];
    expect(canPlacePalisade(E, wallOf(bend), world(), { gate: true })).toEqual({ ok: false, reason: 'gateNotStraight' });
    // On an end or an empty hex: refused.
    expect(canPlacePalisade({ q: 2, r: 0 }, wallOf([o, E]), world(), { gate: true })).toEqual({ ok: false, reason: 'gateNotStraight' });
    expect(canPlacePalisade({ q: 5, r: 0 }, wallOf([]), world(), { gate: true })).toEqual({ ok: false, reason: 'gateNotStraight' });
    // Upgrading a gate again is occupied.
    expect(canPlacePalisade(E, wallOf(line, [E]), world(), { gate: true })).toEqual({ ok: false, reason: 'occupied' });
  });
});

describe('resolveWall', () => {
  it('turns a placed wall into pieces: end, straight, bend, sea end', () => {
    const sea = { q: 3, r: -1 };
    const hexes = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, sea];
    const ctx = world({ [coordKey(sea)]: 'sea' });
    const wall = wallOf(hexes);
    const pieces = resolveWall(wall, ctx.terrainAt, parseKey);
    const piece = (c: AxialCoord) => {
      const r = pieces.get(coordKey(c))!;
      return isRefusal(r) ? r.refusal : r.piece;
    };
    expect(piece(hexes[0]!)).toBe('end');
    expect(piece(hexes[1]!)).toBe('straight180');
    expect(piece(hexes[2]!)).toBe('bend120'); // neighbours W (3) and NE (1): one edge apart
    expect(piece(sea)).toBe('end_coast');
    expect(tileOfWallHex(sea, wall, ctx.terrainAt)).toMatchObject({ piece: 'end_coast', edges: [4] });
  });
});

describe('classifyEnd', () => {
  const at = { q: 0, r: 0 };
  const ring = neighbors(at);
  const terrainWith = (d: number, t: Terrain) => (c: AxialCoord): Terrain => (coordKey(c) === coordKey(ring[d]!) ? t : 'grass');
  const noRiver = () => false;

  it('an end on plain land or next to the sea is half open', () => {
    expect(classifyEnd(at, () => 'grass', noRiver)).toBe('halfOpen');
    for (let d = 0; d < 6; d++) expect(classifyEnd(at, terrainWith(d, 'sea'), noRiver)).toBe('halfOpen');
    // Streams (not wide) and bog do not seal either.
    expect(classifyEnd(at, terrainWith(1, 'bog'), noRiver)).toBe('halfOpen');
  });

  it('an end that touches a mountain or a wide river is sealed, from any side', () => {
    for (let d = 0; d < 6; d++) {
      expect(classifyEnd(at, terrainWith(d, 'mountain'), noRiver)).toBe('sealed');
      expect(classifyEnd(at, () => 'grass', (c) => coordKey(c) === coordKey(ring[d]!))).toBe('sealed');
    }
  });
});
