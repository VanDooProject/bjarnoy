import { describe, expect, it } from 'vitest';
import type { AxialCoord } from '../hex/coords';
import { checkBogRules } from './bogRules';
import { BogPaths, waterRun } from './bogGenerator';
import type { BogTile, RiverTile, Terrain, TileOrientation } from './types';

const grass = (): Terrain => 'grass';
const bog = (q: number, r: number, kind: BogTile['kind'], inDirections: TileOrientation[] = [], outDirection: TileOrientation | null = null, waterEdges: TileOrientation[] = []): BogTile => ({
  q,
  r,
  kind,
  inDirections,
  outDirection,
  waterEdges,
});

describe('checkBogRules: what each map rule flags', () => {
  it('flags a bog tile touching four lake tiles (R1)', () => {
    // E, NE, NW, W of the centre are the first four directions.
    const tiles = [bog(0, 0, 'half'), bog(1, 0, 'lake'), bog(1, -1, 'lake'), bog(0, -1, 'lake'), bog(-1, 0, 'lake')];
    expect(checkBogRules(tiles, [], grass).R1).toBeGreaterThan(0);
  });

  it('flags a tile touching two separate lakes (R1 and R2)', () => {
    const tiles = [bog(0, 0, 'shore'), bog(1, 0, 'lake'), bog(-1, 0, 'lake')];
    const v = checkBogRules(tiles, [], grass);
    expect(v.R1).toBeGreaterThan(0);
    expect(v.R2).toBeGreaterThan(0);
  });

  it('flags a creek 120 degrees off straight, a creek beside a lake and a mouth without its opposite creek edge (R3, R4)', () => {
    expect(checkBogRules([bog(0, 0, 'creek', ['E'], 'NE')], [], grass).R3).toBeGreaterThan(0);
    expect(checkBogRules([bog(0, 0, 'creek', ['W'], 'E'), bog(1, 0, 'lake')], [], grass).R4).toBeGreaterThan(0);
    // A mouth whose creek comes in from the wrong side (in E, water E is not opposite).
    expect(checkBogRules([bog(0, 0, 'mouth', ['E'], 'NE', ['E']), bog(1, 0, 'lake')], [], grass).R4).toBeGreaterThan(0);
  });

  it('flags bog beside sand or the sea (R7) but not beside other bog', () => {
    const sandy = (c: AxialCoord): Terrain => (c.q === 1 && c.r === 0 ? 'sand' : 'grass');
    expect(checkBogRules([bog(0, 0, 'bog')], [], sandy).R7).toBeGreaterThan(0);
    // The same sand hex turned into bog (an enclosed pocket's ring) is fine.
    expect(checkBogRules([bog(0, 0, 'bog'), bog(1, 0, 'bog')], [], sandy).R7).toBe(0);
    const sea = (c: AxialCoord): Terrain => (c.q === 0 && c.r === 1 ? 'sea' : 'grass');
    expect(checkBogRules([bog(0, 0, 'bog')], [], sea).R7).toBeGreaterThan(0);
  });

  it('flags a lake on land without an outflow and inflow (R8)', () => {
    expect(checkBogRules([bog(0, 0, 'lake')], [], grass).R8).toBeGreaterThan(0);
  });

  it('flags a creek meeting a stream (R11) and a spring whose creek never reaches a river (R9)', () => {
    const stream: RiverTile = { q: 0, r: 0, shape: 'straight', inDirections: ['W'], outDirection: 'E', width: 'stream' };
    expect(checkBogRules([bog(1, 0, 'creek', ['W'], 'E')], [stream], grass).R11).toBeGreaterThan(0);
    expect(checkBogRules([bog(0, 0, 'creekspring', [], 'E')], [], grass).R9).toBeGreaterThan(0);
  });

  it('flags a bog tile whose kind does not match the lake edges it touches (R1)', () => {
    // A plain bog tile with a lake neighbour should have been an inlet.
    expect(checkBogRules([bog(0, 0, 'bog'), bog(1, 0, 'lake')], [], grass).R1).toBeGreaterThan(0);
  });
});

describe('waterRun', () => {
  it('lists a contiguous run of water directions from where it starts, wrapping round the wheel', () => {
    expect(waterRun(0)).toEqual([]);
    expect(waterRun(1 << 2)).toEqual([2]);
    expect(waterRun((1 << 5) | (1 << 0))).toEqual([5, 0]);
    expect(waterRun((1 << 4) | (1 << 5) | (1 << 0))).toEqual([4, 5, 0]);
  });
});

describe('BogPaths.clone', () => {
  it('copies the paths, the flags and the constraints so a trial never edits the original', () => {
    const paths = [[{ q: 0, r: 0 }, { q: 1, r: 0 }]];
    const original = new BogPaths(paths, [false]);
    original.forcedOut.set('0,0', 1);
    original.requireRiver.add('0,0');
    const copy = original.clone();
    copy.paths[0]!.push({ q: 2, r: 0 });
    copy.merged[0] = true;
    copy.forcedOut.set('1,0', 2);
    copy.requireRiver.add('1,0');
    expect(original.paths[0]).toHaveLength(2);
    expect(original.merged).toEqual([false]);
    expect(original.forcedOut.size).toBe(1);
    expect(original.requireRiver.size).toBe(1);
  });
});
