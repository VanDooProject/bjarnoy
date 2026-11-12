import { describe, expect, it } from 'vitest';
import { Sprite, Texture } from 'pixi.js';
import { applySpriteBox, type SpriteBox } from './spriteBox';

const box = (over: Partial<SpriteBox> = {}): SpriteBox => ({ texture: Texture.WHITE, x: 10, y: 20, width: 168, height: 300, zIndex: 5, ...over });

describe('applySpriteBox', () => {
  it('writes a new sprite, then leaves an unchanged one alone', () => {
    const applied = new WeakMap<Sprite, SpriteBox>();
    const sprite = new Sprite(Texture.WHITE);
    expect(applySpriteBox(applied, sprite, box())).toBe(true);
    expect([sprite.position.x, sprite.position.y, sprite.width, sprite.height, sprite.zIndex]).toEqual([10, 20, 168, 300, 5]);
    expect(applySpriteBox(applied, sprite, box())).toBe(false);
  });

  it('rewrites when the position, depth, size or texture changes', () => {
    const applied = new WeakMap<Sprite, SpriteBox>();
    const sprite = new Sprite(Texture.WHITE);
    applySpriteBox(applied, sprite, box());
    for (const change of [{ x: 11 }, { y: 21 }, { zIndex: 6 }, { width: 100 }, { height: 10 }, { texture: Texture.EMPTY }]) {
      expect(applySpriteBox(applied, sprite, box(change)), JSON.stringify(Object.keys(change))).toBe(true);
      expect(applySpriteBox(applied, sprite, box(change))).toBe(false);
    }
  });
});
