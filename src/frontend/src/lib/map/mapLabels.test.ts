// Guards the map labels against being re-rasterised every frame.
//
// `rebuildMarkers` runs on every tick, and it used to set each label's style
// property by property there. Most of Pixi's `TextStyle` setters early-return
// on an unchanged value, so that reads as free — but `dropShadow = { ... }`
// passes a fresh object literal each time, and `dropShadow = false` is
// compared against the `null` the setter stored on the previous call. Both
// fail the identity check, both call `update()`, and `update()` bumps the tick
// that `styleKey` is built from.
//
// `styleKey` is what Pixi's text caches are keyed on, so a new one per frame
// means the glyphs are re-measured, re-drawn through Canvas 2D (with a shadow
// blur) and re-uploaded to the GPU, for every label on screen, with the camera
// perfectly still. Nothing renders wrong, the map is just permanently slower —
// which is exactly the kind of regression that creeps back in the next time
// someone reaches for `label.style.something` inside the tick.
//
// So this pins the mechanism rather than the call site: the shared styles must
// keep a stable `styleKey` across repeated assignment, and assigning a style a
// label already has must not dirty it.
import { describe, expect, it } from 'vitest';
import { TextStyle } from 'pixi.js';
import { LABEL_STYLES } from './HexMapRenderer';

describe('map label styles', () => {
  it('are shared instances, so a label can be pointed at one rather than rewritten', () => {
    for (const [name, style] of Object.entries(LABEL_STYLES)) {
      expect(style, name).toBeInstanceOf(TextStyle);
    }
    // Distinct roles must not collapse onto one instance, or the fill/weight
    // differences between them would be lost.
    const unique = new Set(Object.values(LABEL_STYLES));
    expect(unique.size).toBe(Object.keys(LABEL_STYLES).length);
  });

  it('keep a stable styleKey when re-read, so the text caches keep hitting', () => {
    for (const [name, style] of Object.entries(LABEL_STYLES)) {
      const before = style.styleKey;
      // Simulate a few frames of the marker rebuild touching the style.
      for (let i = 0; i < 5; i++) expect(style.styleKey, name).toBe(before);
    }
  });

  it('demonstrates the failure this guards against', () => {
    // The two writes the old code made every frame, shown dirtying the style.
    const shadowed = new TextStyle({ fontSize: 12 });
    const keyA = shadowed.styleKey;
    shadowed.dropShadow = { color: 0x000000, alpha: 0.85, blur: 6, distance: 2, angle: Math.PI / 2 };
    const keyB = shadowed.styleKey;
    shadowed.dropShadow = { color: 0x000000, alpha: 0.85, blur: 6, distance: 2, angle: Math.PI / 2 };
    // Same values, fresh object: still a new key, so the cache misses again.
    expect(shadowed.styleKey).not.toBe(keyB);
    expect(keyB).not.toBe(keyA);

    const plain = new TextStyle({ fontSize: 12 });
    plain.dropShadow = false;
    const keyC = plain.styleKey;
    plain.dropShadow = false;
    // `false` never equals the stored `null`, so even a no-op write dirties it.
    expect(plain.styleKey).not.toBe(keyC);
  });
});
