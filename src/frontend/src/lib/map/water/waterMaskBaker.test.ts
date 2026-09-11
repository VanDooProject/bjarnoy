// The bake worker's request/response bookkeeping.
//
// Worth testing on its own because every failure mode here is silent. A
// superseded response applied anyway puts an older, smaller mask over a newer
// one; a superseded response that also drops the *pending* request leaves the
// renderer recording a mask it never installed, and then re-asking for a bake
// that was already made. Neither throws, and both look like "the foam is
// sometimes wrong at the edges", which is indistinguishable from the bake
// simply being slow.
//
// jsdom has no `Worker`, so one is installed for the test — which also
// exercises the real fallback path: with no `Worker` at all the baker bakes
// inline, and that is what makes the suite (and any browser that refuses a
// module worker) still get a mask.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaterMaskBaker } from './waterMaskBaker';
import { waterMaskRegion, type WaterMaskRegion } from './waterMaskLayout';
import { DEFAULT_GENERATION } from '../worldGenerator';

const TILE_W = 168;
const TILE_H = 92;
const LAND_EVERYWHERE = { isLand: () => true };

function regionFor(halfWidth: number): WaterMaskRegion {
  return waterMaskRegion({ minX: -halfWidth, maxX: halfWidth, minY: -100, maxY: 100 }, TILE_W);
}

/** A stand-in worker that records what was posted and lets the test answer by hand. */
class FakeWorker {
  static last: FakeWorker | null = null;
  posted: { id: number; region: WaterMaskRegion }[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.last = this;
  }
  postMessage(request: { id: number; region: WaterMaskRegion }) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answers request `id` with a mask whose width is distinctive, so the test can tell them apart. */
  respond(id: number, width: number) {
    this.onmessage?.({
      data: { id, data: new Uint8Array(width * 4), width, height: 1, bakeMs: 1 },
    });
  }
}

function installFakeWorker() {
  vi.stubGlobal('Worker', FakeWorker);
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.last = null;
});

const input = (region: WaterMaskRegion) => ({
  region,
  tileWidth: TILE_W,
  tileHeight: TILE_H,
  seed: 1,
  generation: DEFAULT_GENERATION,
});

describe('WaterMaskBaker', () => {
  it('bakes inline when there is no Worker, so jsdom and a refusing browser still get a mask', () => {
    const applied: unknown[] = [];
    const baker = new WaterMaskBaker((mask) => applied.push(mask));
    const region = regionFor(400);
    const mask = baker.bake(input(region), LAND_EVERYWHERE, false);
    expect(mask).not.toBeNull();
    expect(mask!.width).toBe(region.width);
    // Inline means the caller already has it; nothing arrives through the callback.
    expect(applied).toHaveLength(0);
  });

  it('bakes inline when told to, even with a worker available', () => {
    installFakeWorker();
    const baker = new WaterMaskBaker(() => {});
    expect(baker.bake(input(regionFor(400)), LAND_EVERYWHERE, true)).not.toBeNull();
    expect(FakeWorker.last!.posted).toHaveLength(0);
  });

  it('hands the bake to the worker and applies the result when it arrives', () => {
    installFakeWorker();
    const applied: { width: number; region: WaterMaskRegion }[] = [];
    const baker = new WaterMaskBaker((mask, region) => applied.push({ width: mask.width, region }));
    const region = regionFor(400);

    expect(baker.bake(input(region), LAND_EVERYWHERE, false)).toBeNull();
    expect(baker.pendingRegion).toBe(region);
    expect(applied).toHaveLength(0);

    FakeWorker.last!.respond(FakeWorker.last!.posted[0].id, 7);
    expect(applied).toEqual([{ width: 7, region }]);
    expect(baker.pendingRegion).toBeNull();
  });

  it('drops a superseded response but still applies the one that superseded it', () => {
    installFakeWorker();
    const applied: { width: number; region: WaterMaskRegion }[] = [];
    const baker = new WaterMaskBaker((mask, region) => applied.push({ width: mask.width, region }));
    const small = regionFor(400);
    const big = regionFor(4000);

    baker.bake(input(small), LAND_EVERYWHERE, false);
    baker.bake(input(big), LAND_EVERYWHERE, false);
    const [first, second] = FakeWorker.last!.posted;
    expect(baker.pendingRegion).toBe(big);

    // The stale one answers first, as it would if the camera moved mid-bake.
    FakeWorker.last!.respond(first.id, 1);
    expect(applied).toHaveLength(0);
    // ...and the request that replaced it is still outstanding. This is the
    // regression: clearing it here lost the newer mask entirely.
    expect(baker.pendingRegion).toBe(big);

    FakeWorker.last!.respond(second.id, 2);
    expect(applied).toEqual([{ width: 2, region: big }]);
    expect(baker.pendingRegion).toBeNull();
  });

  it('drops a result the renderer has already invalidated', () => {
    installFakeWorker();
    const applied: unknown[] = [];
    const baker = new WaterMaskBaker((mask) => applied.push(mask));
    baker.bake(input(regionFor(400)), LAND_EVERYWHERE, false);
    const [request] = FakeWorker.last!.posted;

    baker.discardPending();
    FakeWorker.last!.respond(request.id, 1);
    expect(applied).toHaveLength(0);
    expect(baker.pendingRegion).toBeNull();
  });

  it('stops applying results and terminates the worker once destroyed', () => {
    installFakeWorker();
    const applied: unknown[] = [];
    const baker = new WaterMaskBaker((mask) => applied.push(mask));
    baker.bake(input(regionFor(400)), LAND_EVERYWHERE, false);
    const [request] = FakeWorker.last!.posted;

    baker.destroy();
    expect(FakeWorker.last!.terminated).toBe(true);
    FakeWorker.last!.respond(request.id, 1);
    expect(applied).toHaveLength(0);
  });

  it('falls back to inline baking after the worker errors', () => {
    installFakeWorker();
    const baker = new WaterMaskBaker(() => {});
    FakeWorker.last!.onerror?.();
    const mask = baker.bake(input(regionFor(400)), LAND_EVERYWHERE, false);
    expect(mask).not.toBeNull();
  });
});
