// The browser-only half of chunked fog delivery: turning the endpoint's
// base64 PNGs into pixels and the stitched window into an ImageBitmap the
// renderer can wrap in a texture. Kept apart from fogChunks.ts so that file
// stays pure and unit-testable in a DOM-less test runner; stores/world.test.ts
// mocks this module for the same reason.
import { FOG_CHUNK_SIZE } from './fogChunks';

/** Decodes one chunk's base64 PNG into RGBA8 pixels (`FOG_CHUNK_SIZE` square). */
export async function decodeChunkPng(base64: string): Promise<Uint8ClampedArray> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // colorSpaceConversion 'none': the channels are data (ramps, a noise seed),
  // not colour, and must come back exactly as baked.
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  try {
    if (bitmap.width !== FOG_CHUNK_SIZE || bitmap.height !== FOG_CHUNK_SIZE) {
      throw new Error(`fog chunk is ${bitmap.width}x${bitmap.height}, expected ${FOG_CHUNK_SIZE}x${FOG_CHUNK_SIZE}`);
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context to decode a fog chunk with');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  } finally {
    bitmap.close();
  }
}

/** Wraps stitched RGBA8 pixels as an `ImageBitmap`, for `HexMapRenderer.setFogMask`. */
export function pixelsToBitmap(pixels: Uint8ClampedArray, width: number, height: number): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
}
