// The layer's handling of cells that are solved off the main thread.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renderer, Texture } from 'pixi.js';
import type { RiverFlowEntry } from './riverFlowLayer';

const { computeSpy, renders } = vi.hoisted(() => ({ computeSpy: vi.fn(), renders: [] as number[] }));

vi.mock('./riverFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./riverFlow')>();
  return {
    ...actual,
    computeRiverRipple: (input: Parameters<typeof actual.computeRiverRipple>[0]) => {
      computeSpy();
      return actual.computeRiverRipple(input);
    },
  };
});
// The render target needs a GPU renderer; what is drawn into it is not what is under test here.
vi.mock('./waterDryMask', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./waterDryMask')>();
  class FakeTarget {
    texture = null;
    render(_r: unknown, _rect: unknown, placements: readonly unknown[]) {
      renders.push(placements.length);
      return {} as Texture;
    }
    destroy() {}
  }
  return { ...actual, MaskRenderTarget: FakeTarget };
});

import { RiverFlowLayer } from './riverFlowLayer';

const CW = 100;
const CH = 48;

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: { id: number }[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: { id: number }) {
    this.posted.push(request);
  }
  terminate() {}
  replyAll() {
    for (const { id } of this.posted.splice(0)) {
      this.onmessage?.({ data: { id, data: new Uint8Array(CW * CH * 4), psi: new Uint8Array(CW * CH * 4), inside: new Uint8Array(CW * CH), periods: 3 } } as MessageEvent);
    }
  }
}

function entry(name: string, x: number): RiverFlowEntry {
  return { texture: { label: name } as Texture, x, y: 0, outDirection: 'S', inDirections: ['N'] };
}

function layerWithMasks(onCellsReady: () => void) {
  const layer = new RiverFlowLayer({ onCellsReady });
  const frame = { x: 0, y: 0, sx: 0, sy: 0, sw: CW * 2, sh: CH * 2 };
  // Decoding the build-time atlas needs the browser; hand the layer a decoded one instead.
  (layer as unknown as { masks: unknown }).masks = {
    data: { width: CW, height: CH, frames: { a: frame, b: frame } },
    alpha: new Uint8Array(CW * CH).fill(255),
  };
  return layer;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
  computeSpy.mockClear();
  renders.length = 0;
});

describe('RiverFlowLayer with an asynchronous solver', () => {
  const renderer = {} as Renderer;

  it('does not solve on the main thread, skips the cell, and notifies once when all cells have landed', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const ready = vi.fn();
    const layer = layerWithMasks(ready);
    const worker = FakeWorker.instances[0]!;
    const entries = [entry('a', 0), entry('b', 500)];

    layer.draw(renderer, entries, 168);
    expect(computeSpy).not.toHaveBeenCalled();
    expect(renders.at(-1)).toBe(0);
    expect(layer.pending).toBe(true);
    expect(worker.posted).toHaveLength(2);

    // A second draw while the cells are out asks for nothing again.
    layer.draw(renderer, entries, 168);
    expect(worker.posted).toHaveLength(2);

    worker.replyAll();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(layer.pending).toBe(false);

    layer.draw(renderer, entries, 168);
    expect(renders.at(-1)).toBe(4);
    expect(worker.posted).toHaveLength(0);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('draws every cell at once where there is no worker', () => {
    const ready = vi.fn();
    const layer = layerWithMasks(ready);
    layer.draw(renderer, [entry('a', 0)], 168);
    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(renders.at(-1)).toBe(2);
    expect(ready).not.toHaveBeenCalled();
    expect(layer.pending).toBe(false);
  });
});
