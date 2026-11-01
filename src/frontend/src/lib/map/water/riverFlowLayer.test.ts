import { describe, expect, it } from 'vitest';
import type { BogTile, RiverTile } from '../types';
import { SOURCE_H, SOURCE_W } from './dryMaskCore';
import { cropAtlasCell, riverFlowOf } from './riverFlowLayer';
import { dryCellWorldRect } from './waterDryMask';

const river = (over: Partial<RiverTile>): RiverTile => ({ q: 0, r: 0, shape: 'straight', inDirections: ['W'], outDirection: 'E', ...over });
const bog = (over: Partial<BogTile>): BogTile => ({ q: 0, r: 0, kind: 'creek', inDirections: ['W'], outDirection: 'E', waterEdges: [], ...over });

describe('riverFlowOf', () => {
  it('flows a river towards its out direction', () => {
    expect(riverFlowOf(river({}), undefined, null)).toEqual({ outDirection: 'E' });
  });

  it('flows a mouth without an out direction towards the sea', () => {
    expect(riverFlowOf(river({ shape: 'mouth', outDirection: null }), undefined, 'NE')).toEqual({ outDirection: 'NE' });
    expect(riverFlowOf(river({ shape: 'mouth', outDirection: null }), undefined, null)).toBeNull();
  });

  it('has no flow for a lava stream or a river without an out direction', () => {
    expect(riverFlowOf(river({ wasted: true }), undefined, null)).toBeNull();
    expect(riverFlowOf(river({ shape: 'spring', inDirections: [], outDirection: null }), undefined, null)).toBeNull();
  });

  it('flows bog creeks and creek springs, but not moss or lakes', () => {
    expect(riverFlowOf(undefined, bog({}), null)).toEqual({ outDirection: 'E' });
    expect(riverFlowOf(undefined, bog({ kind: 'creekspring', inDirections: [] }), null)).toEqual({ outDirection: 'E' });
    for (const kind of ['bog', 'lake', 'inlet', 'shore', 'half'] as const) expect(riverFlowOf(undefined, bog({ kind }), null), kind).toBeNull();
  });

  it('fades a lake mouth away from its creek edge, whichever way the water runs', () => {
    // Water runs out of the lake: the out edge is the creek edge.
    expect(riverFlowOf(undefined, bog({ kind: 'mouth', inDirections: ['W'], outDirection: 'E', waterEdges: ['W'] }), null)).toEqual({ outDirection: 'E', fadeDirection: 'E' });
    // Water runs into the lake: the in edge is the creek edge.
    expect(riverFlowOf(undefined, bog({ kind: 'mouth', inDirections: ['W'], outDirection: 'E', waterEdges: ['E'] }), null)).toEqual({ outDirection: 'E', fadeDirection: 'W' });
    expect(riverFlowOf(undefined, bog({ kind: 'mouth', outDirection: null }), null)).toBeNull();
  });
});

describe('cropAtlasCell', () => {
  it('copies the frame cell out of the atlas plane', () => {
    const width = 10;
    const alpha = new Uint8Array(width * 6);
    alpha.forEach((_, i) => (alpha[i] = i));
    const cell = cropAtlasCell(alpha, width, { x: 2, y: 1, sx: 0, sy: 0, sw: 6, sh: 4 });
    expect(cell.cw).toBe(3);
    expect(cell.ch).toBe(2);
    expect(Array.from(cell.mask)).toEqual([12, 13, 14, 22, 23, 24]);
  });
});

describe('river flow cell placement', () => {
  it('lands on the art sprite like the dry mask cells do: origin plus the cell rect scaled to the tile width', () => {
    const rect = dryCellWorldRect({ x: 1000, y: 500 }, { sx: 0, sy: 100, sw: SOURCE_W, sh: SOURCE_H - 100 }, 168);
    expect(rect.x).toBeCloseTo(1000, 6);
    expect(rect.y).toBeCloseTo(584, 6);
    expect(rect.w).toBeCloseTo(168, 6);
    expect(rect.h).toBeCloseTo(168, 6);
  });
});
