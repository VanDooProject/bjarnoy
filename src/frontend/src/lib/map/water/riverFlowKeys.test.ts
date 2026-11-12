// A river cell's solver key must depend on the world only, not on which hexes the viewport draws: panning re-uses cached cells.
import { describe, expect, it, vi } from 'vitest';
import type { Renderer, Texture } from 'pixi.js';
import { neighbors } from '../../hex/coords';
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
const WEST = TILE_ORIENTATIONS.indexOf('W');
const tex = (label: string) => ({ label }) as Texture;

/** A straight river of `n` hexes running east from the origin; every hex has its own frame name. */
function chain(n: number) {
  const coords = [{ q: 0, r: 0 }];
  for (let i = 1; i < n; i++) coords.push(neighbors(coords[i - 1]!)[EAST]!);
  const index = (q: number, r: number) => coords.findIndex((c) => c.q === q && c.r === r);
  const river = (q: number, r: number): RiverTile | undefined =>
    index(q, r) < 0 ? undefined : { q, r, shape: 'straight', inDirections: ['W'], outDirection: 'E' };
  const source = createRiverFlowEntrySource(
    { getRiverTile: river, getBog: () => undefined, seaFacingDirectionOf: () => null },
    (c) => (index(c.q, c.r) < 0 ? undefined : tex(`f${index(c.q, c.r)}`)),
    168,
    84,
    10,
  );
  return { coords, source };
}

function layerWithMasks() {
  const layer = new RiverFlowLayer({ onCellsReady: () => {} });
  const frame = { x: 0, y: 0, sx: 0, sy: 0, sw: CW * 2, sh: CH * 2 };
  (layer as unknown as { masks: unknown }).masks = {
    data: { width: CW, height: CH, frames: Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`f${i}`, frame])) },
    alpha: new Uint8Array(CW * CH).fill(255),
  };
  return layer;
}
const keysOf = (layer: RiverFlowLayer) => [...(layer as unknown as { cells: Map<string, unknown> }).cells.keys()];

describe('river flow entries', () => {
  it('give a hex the same neighbours and downstream whether or not they are drawn', () => {
    const { coords, source } = chain(4);
    const middle = source.entryAt(coords[1]!)!;
    expect(middle.neighbours?.map((n) => [n.direction, n.name])).toEqual([
      ["E", "f2"],
      ['W', 'f0'],
    ]);
    expect(middle.downstream?.()).toBe(source.entryAt(coords[2]!));
    expect(source.entryAt(coords[3]!)?.downstream?.()).toBeUndefined();
    expect(neighbors(coords[0]!)[WEST]).toBeDefined();
  });

  it('key a cell the same whether its neighbours and downstream hexes are in the drawn set or not', () => {
    const { coords, source } = chain(6);
    const all = coords.map((c) => source.entryAt(c)!) satisfies RiverFlowEntry[];
    const full = layerWithMasks();
    full.draw({} as Renderer, all, 168);
    const fullKeys = keysOf(full);
    expect(fullKeys).toHaveLength(6);

    // A viewport that has panned so that only some of the river is drawn.
    for (const subset of [[all[0]!], [all[2]!, all[3]!], [all[5]!]]) {
      const partial = layerWithMasks();
      partial.draw({} as Renderer, subset, 168);
      for (const key of keysOf(partial)) expect(fullKeys).toContain(key);
    }
  });
});
