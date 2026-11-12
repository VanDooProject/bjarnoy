import type { Sprite, Texture } from 'pixi.js';

export interface SpriteBox {
  texture: Texture;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/**
 * Writes a sprite's box (size, position, depth) only when it differs from what was applied last (`applied` holds the last
 * one per sprite). Pixi's setters mark the transform dirty even for an equal value, and a pan rebuild re-syncs every visible
 * hex that did not change. The texture is part of the record because the size setters scale against it. Returns whether
 * anything was written.
 */
export function applySpriteBox(applied: WeakMap<Sprite, SpriteBox>, sprite: Sprite, box: SpriteBox): boolean {
  const last = applied.get(sprite);
  if (
    last &&
    last.texture === box.texture &&
    last.x === box.x &&
    last.y === box.y &&
    last.width === box.width &&
    last.height === box.height &&
    last.zIndex === box.zIndex
  ) {
    return false;
  }
  sprite.width = box.width;
  sprite.height = box.height;
  sprite.position.set(box.x, box.y);
  sprite.zIndex = box.zIndex;
  applied.set(sprite, box);
  return true;
}
