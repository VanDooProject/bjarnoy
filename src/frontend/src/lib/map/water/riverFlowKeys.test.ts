// A river cell's solver key must depend on the world only, not on which hexes the viewport draws: panning re-uses cached cells.
import { describe, expect, it, vi } from 'vitest';
import type { Renderer, Texture } from 'pixi.js';
import { neighbors } from '../../hex/coords';
import { isoGridPosition } from '../../hex/geometry';
import { TILE_ORIENTATIONS, type RiverTile } from '../types';
import { createRiverFlowEntrySource } from './riverFlowEntries';
import type { RiverFlowEntry } from './riverFlowLayer';

vi.mock('./waterDryMask', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./waterDryMask')>();
  class FakeTarget {
    texture = null;
    render() {
      return {} as Texture;
    }
    destroy() {}
  }
  return { ...actual, MaskRenderTarget: FakeTarget };
});

import { RiverFlowLayer } from './riverFlowLayer';

const CW = 100;
const CH = 48;
const EAST = TILE_ORIENTATIONS.indexOf('E');
const tex = (label: string) => ({ label }) as Texture;

/**
 * A river of `n` hexes running east from the origin, every hex with its own frame name `f<i>`. With `joinAt`, the hex at that
 * index is a confluence (it also takes a second branch in from the SW) so the upstream cells have a non-trivial psi range.
 */
function chain(n: number, joinAt?: number) {
  const coords = [{ q: 0, r: 0 }];
  for (let i = 1; i < n; i++) coords.push(neighbors(coords[i - 1]!)[EAST]!);
  const index = (q: number, r: number) => coords.findIndex((c) => c.q === q && c.r === r);
  const river = (q: number, r: number): RiverTile | undefined => {
    const i = index(q, r);
    if (i < 0) return undefined;
    return { q, r, shape: i === joinAt ? 'confluence' : 'straight', inDirections: i === joinAt ? ['W', 'SW'] : ['W'], outDirection: 'E' };
  };
  const source = createRiverFlowEntrySource(
    { getRiverTile: river, getBog: () => undefined, seaFacingDirectionOf: () => null },
    (c) => (index(c.q, c.r) < 0 ? undefined : tex(`f${index(c.q, c.r)}`)),
    (c) => {
      const grid = isoGridPosition(c, 168, 84);
      return { x: grid.x, y: grid.y - 10 };
    },
  );
  return { coords, source };
}

function layerWithMasks(frames: number) {
  const layer = new RiverFlowLayer({ onCellsReady: () => {} });
  const frame = { x: 0, y: 0, sx: 0, sy: 0, sw: CW * 2, sh: CH * 2 };
  (layer as unknown as { masks: unknown }).masks = {
    data: { width: CW, height: CH, frames: Object.fromEntries(Array.from({ length: frames }, (_, i) => [`f${i}`, frame])) },
    alpha: new Uint8Array(CW * CH).fill(255),
  };
  return layer;
}
const keysOf = (layer: RiverFlowLayer) => [...(layer as unknown as { cells: Map<string, unknown> }).cells.keys()];
/** The key a layer solved for frame `name`. */
const keyOf = (layer: RiverFlowLayer, name: string) => keysOf(layer).find((k) => k.startsWith(`${name}|`));
const draw = (entries: RiverFlowEntry[], frames: number) => {
  const layer = layerWithMasks(frames);
  layer.draw({} as Renderer, entries, 168);
  return layer;
};

describe('river flow entries', () => {
  it('give a hex the same neighbours and downstream whether or not they are drawn', () => {
    const { coords, source } = chain(4);
    const middle = source.entryAt(coords[1]!)!;
    expect(middle.neighbours?.map((n) => [n.direction, n.name])).toEqual([
      ['E', 'f2'],
      ['W', 'f0'],
    ]);
    expect(middle.downstream?.()).toBe(source.entryAt(coords[2]!));
    expect(source.entryAt(coords[3]!)?.downstream?.()).toBeUndefined();
  });

  it('key a cell the same whether its neighbours and downstream hexes are in the drawn set or not', () => {
    const { coords, source } = chain(6);
    const all = coords.map((c) => source.entryAt(c)!) satisfies RiverFlowEntry[];
    const fullKeys = keysOf(draw(all, 6));
    expect(fullKeys).toHaveLength(6);

    // A viewport that has panned so that only some of the river is drawn.
    for (const subset of [[all[0]!], [all[2]!, all[3]!], [all[5]!]]) {
      for (const key of keysOf(draw(subset, 6))) expect(fullKeys).toContain(key);
    }
  });

  it('give the cells upstream of a confluence that is not drawn the same psi range as when it is', () => {
    const { coords, source } = chain(4, 2);
    const all = coords.map((c) => source.entryAt(c)!);
    const full = keyOf(draw(all, 4), 'f1');
    // The confluence (index 2) and everything past it are off screen.
    const partial = keyOf(draw([all[0]!, all[1]!], 4), 'f1');
    expect(partial).toBe(full);
    // The range is the arm's share of the confluence's, not the whole [0, 1].
    expect(full).not.toMatch(/\|0,1$/);
  });

  it('give a cell on a river longer than the walk used to reach the same key whatever is drawn and in what order', () => {
    const n = 45;
    const { coords, source } = chain(n, n - 1);
    const all = coords.map((c) => source.entryAt(c)!);
    const reference = keyOf(draw(all, n), 'f0');
    expect(reference).not.toMatch(/\|0,1$/);
    expect(keyOf(draw([...all].reverse(), n), 'f0')).toBe(reference);
    expect(keyOf(draw([all[0]!], n), 'f0')).toBe(reference);
    expect(keyOf(draw([all[20]!, all[0]!, all[40]!], n), 'f0')).toBe(reference);
    // A mid-river cell too: the same from the other end.
    const mid = keyOf(draw(all, n), 'f33');
    expect(keyOf(draw([all[33]!], n), 'f33')).toBe(mid);
  });
});
