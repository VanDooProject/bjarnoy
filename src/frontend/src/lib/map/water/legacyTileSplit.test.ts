// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Pixi probes a throwaway canvas at import time; jsdom has no canvas backend
// and logs about it. Pixi handles a null context, so hand it one.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { BufferImageSource, Texture } from 'pixi.js';
import { TILE_ART_NATIVE_H, TILE_ART_NATIVE_W, TILE_ART_TOPFACE_Y_FRAC } from '../textures';
import { LEGACY_TALL_KEYS, splitLegacyTexture } from './legacyTileSplit';

function tileTexture(): Texture {
  return new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array(TILE_ART_NATIVE_W * TILE_ART_NATIVE_H * 4),
      width: TILE_ART_NATIVE_W,
      height: TILE_ART_NATIVE_H,
    }),
  });
}

describe('splitLegacyTexture', () => {
  it('cuts at exactly the y the art pack cuts at', () => {
    // The whole point of this module is that it is the pack's own split done in
    // code ahead of time — so the cut line is TILE_ART_TOPFACE_Y_FRAC, not a
    // number tuned to look right.
    const { base, top } = splitLegacyTexture(tileTexture());
    expect(top.nativeH).toBe(Math.round(TILE_ART_NATIVE_W * TILE_ART_TOPFACE_Y_FRAC));
    expect(base.nativeY).toBe(top.nativeH);
  });

  it('produces two pieces that abut exactly — no gap, no doubled row', () => {
    // syncSpriteLayer places each piece by its nativeY and scales it by its
    // nativeH, so an off-by-one here is a visible seam or a doubled pixel row
    // across every tile of the four legacy families.
    const { base, top } = splitLegacyTexture(tileTexture());
    expect(top.nativeY).toBe(0);
    expect(top.nativeY + top.nativeH).toBe(base.nativeY);
    expect(base.nativeY + base.nativeH).toBe(TILE_ART_NATIVE_H);
  });

  it('gives each piece a frame matching its own declared slice', () => {
    const { base, top } = splitLegacyTexture(tileTexture());
    expect(top.texture.frame.y).toBe(top.nativeY);
    expect(top.texture.frame.height).toBe(top.nativeH);
    expect(base.texture.frame.y).toBe(base.nativeY);
    expect(base.texture.frame.height).toBe(base.nativeH);
    expect(top.texture.frame.width).toBe(TILE_ART_NATIVE_W);
  });

  it('shares one source and caches the cut', () => {
    // rebuildTerrain runs on every camera move, so cutting the same texture
    // again per rebuild would leak a Texture per tile per pan.
    const texture = tileTexture();
    const first = splitLegacyTexture(texture);
    expect(splitLegacyTexture(texture)).toBe(first);
    expect(first.top.texture.source).toBe(texture.source);
    expect(first.base.texture.source).toBe(texture.source);
  });
});

describe('LEGACY_TALL_KEYS', () => {
  it('holds exactly the unsplit families that rise above their top face', () => {
    // Measured from the art by first row with >=5 opaque pixels (a raw alpha
    // bbox is inflated by stray near-transparent rows): mountaintile 66px,
    // magictower 102px, dockyard 25px, towerbuilding 20px.
    expect([...LEGACY_TALL_KEYS].sort()).toEqual(['dockyard', 'magictower', 'mountain', 'tower']);
  });

  it('leaves the flat unsplit families alone', () => {
    // The distinction this set exists to make. Keying the split on "is it
    // legacy" instead would put sand — the most common terrain on any coastline
    // — through a second, empty sprite it does not need, on every coastal hex.
    for (const flat of ['water', 'coastalwater', 'sand', 'fishinghut']) {
      expect(LEGACY_TALL_KEYS.has(flat)).toBe(false);
    }
  });

  it('leaves families the pack has already split alone', () => {
    for (const split of ['grass', 'forest', 'river', 'longhouse']) {
      expect(LEGACY_TALL_KEYS.has(split)).toBe(false);
    }
  });
});
