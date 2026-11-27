// Small helpers the map's shader layers (water, river, bog lakes, fog) all need.
import { BufferImageSource, Texture } from 'pixi.js';

/** A 0xRRGGBB colour as three 0..1 floats, the form shader uniforms take. */
export function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

let sharedPlaceholderDryTexture: Texture | null = null;
/**
 * A 1x1 fully clear texture (alpha 0): "nothing is dry" for the water shader, "no lake water" for the bog lake shader, "no river
 * here" for the river shader's flow and psi samplers. Bound until the real texture is set.
 */
export function placeholderDryTexture(): Texture {
  sharedPlaceholderDryTexture ??= new Texture({
    source: new BufferImageSource({ resource: new Uint8Array([0, 0, 0, 0]), width: 1, height: 1 }),
  });
  return sharedPlaceholderDryTexture;
}
