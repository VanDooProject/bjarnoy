import { describe, expect, it, vi } from 'vitest';
import { WorldModel } from '../WorldModel';
import { buildDemoFogMask, DEMO_MASK_RADIUS } from './demoFogMask';
import { toTexel, worldMaskBounds } from './fogMaskLayout';

// The bake used to round-trip every texel through an OffscreenCanvas 2D
// context (`putImageData` -> `convertToBlob({type: 'image/png'})` ->
// `createImageBitmap(blob)`) purely to get from raw pixels to an
// `ImageBitmap` — a PNG encode/decode neither this module nor its one
// caller (`HexMapRenderer.setFogMask`, which only ever wants a
// `TextureSource`) has any use for. That round trip shares the GPU/
// compositor pipeline with the page's own continuously-rendering WebGL
// canvas: measured in a real browser, `convertToBlob` alone triggered a
// driver-level "GPU stall due to ReadPixels" and combined with the matching
// `createImageBitmap(blob)` decode ballooned an idle re-bake from the
// ~12-25ms this module's own comments expect to 4+ seconds — long enough
// for a freshly-founded settlement's fog reveal (docs/design/
// map-fog-v2.md §2.6) to read as a stuck blank canvas instead of a brief
// cross-fade. `createImageBitmap` accepts an `ImageData` directly, so the
// canvas/PNG detour is dropped entirely; these tests both pin the
// (unmocked) behaviour and guard the OffscreenCanvas-free path so the
// round trip can't quietly come back.
//
// The test environment is `node` (see vitest.config.ts), not a browser, so
// `ImageData`/`createImageBitmap` need stand-ins the same way
// `stores/world.test.ts` stubs `localStorage` — but `OffscreenCanvas` is
// deliberately left undefined: if a future change reintroduces
// `new OffscreenCanvas(...)`, these tests fail with a `ReferenceError`
// rather than silently reinstating the stall.
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function stubBitmapGlobals() {
  vi.stubGlobal('ImageData', FakeImageData);
  const createImageBitmap = vi.fn(async (source: unknown) => ({ __source: source }) as unknown as ImageBitmap);
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return createImageBitmap;
}

describe('buildDemoFogMask', () => {
  it('bails out to null with no settlements, without touching ImageData/createImageBitmap', async () => {
    const createImageBitmap = stubBitmapGlobals();
    const model = new WorldModel();

    const result = await buildDemoFogMask(model);

    expect(result).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('builds the bitmap straight from raw pixels — no OffscreenCanvas/PNG round trip', async () => {
    const createImageBitmap = stubBitmapGlobals();
    // OffscreenCanvas is intentionally left unstubbed/undefined here: if the
    // bake still (or again) constructed one, `new OffscreenCanvas(...)`
    // would throw a ReferenceError and fail this test.
    expect(typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas).toBe('undefined');

    const model = new WorldModel();
    model.foundSettlement('player-1', 'Player', 'Realm', { q: 0, r: 0 });

    const bitmap = await buildDemoFogMask(model);

    expect(bitmap).not.toBeNull();
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    const passed = createImageBitmap.mock.calls[0][0] as FakeImageData;
    // A plain pixel buffer, not a Blob (which is what the old
    // `convertToBlob` path handed over) — `data`/`width`/`height` is the
    // `ImageData` shape `HexMapRenderer.setFogMask`'s `Texture.from` reads.
    expect(passed).toBeInstanceOf(FakeImageData);
    const bounds = worldMaskBounds(DEMO_MASK_RADIUS);
    expect(passed.width).toBe(bounds.width);
    expect(passed.height).toBe(bounds.height);
    expect(passed.data).toBeInstanceOf(Uint8ClampedArray);
    expect(passed.data.length).toBe(bounds.width * bounds.height * 4);
    vi.unstubAllGlobals();
  });

  it('reads a settlement-owned hex as explored (unknown channel 0) in the pixels it bakes', async () => {
    stubBitmapGlobals();
    const model = new WorldModel();
    model.foundSettlement('player-1', 'Player', 'Realm', { q: 0, r: 0 });

    let capturedData: Uint8ClampedArray | null = null;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (source: FakeImageData) => {
        capturedData = source.data;
        return {} as ImageBitmap;
      }),
    );

    await buildDemoFogMask(model);

    expect(capturedData).not.toBeNull();
    const bounds = worldMaskBounds(DEMO_MASK_RADIUS);
    // The settlement's own hex (q:0, r:0) is explored the instant it's
    // founded (WorldModel.foundSettlement populates `explored` synchronously
    // — see that method's own comment) — so its texel's R (unknown) channel
    // must read 0, not the 255 a not-yet-explored hex would carry.
    const texel = toTexel({ q: 0, r: 0 });
    const homeIndex = (texel.v - bounds.minV) * bounds.width + (texel.u - bounds.minU);
    expect(capturedData![homeIndex * 4 + 0]).toBe(0);
    expect(capturedData![homeIndex * 4 + 3]).toBe(255); // alpha always opaque
    vi.unstubAllGlobals();
  });
});
