import { describe, expect, it } from 'vitest';
import { terrainTitleFor, worldLayerOrder } from './HexMapRenderer';
import type { RiverTile, Tile } from './types';

// Regression coverage for a reported bug: a river mouth's hover tooltip
// read "Shore" (its underlying sand terrain) instead of naming the river
// actually drawn there — terrainTitleFor is the tooltip's title logic,
// extracted out of HexMapRenderer.hoverInfoFor (which is otherwise
// untestable without a real canvas/Pixi renderer) so this one rule can be
// checked directly.

function tileOf(terrain: Tile['terrain']): Tile {
  return { q: 0, r: 0, terrain };
}

const river: RiverTile = { q: 0, r: 0, shape: 'mouth', inDirections: ['NE'], outDirection: null };

describe('terrainTitleFor', () => {
  it('names the underlying terrain when there is no river', () => {
    expect(terrainTitleFor(tileOf('sand'), undefined)).toBe('Shore');
    expect(terrainTitleFor(tileOf('grass'), undefined)).toBe('Grassland');
  });

  it('names the river instead of the underlying terrain when one is present — even on sand (the reported case)', () => {
    expect(terrainTitleFor(tileOf('sand'), river)).toBe('River');
  });

  it('names the river regardless of which terrain it sits on', () => {
    for (const terrain of ['sea', 'sand', 'grass', 'forest', 'mountain'] as const) {
      expect(terrainTitleFor(tileOf(terrain), river)).toBe('River');
    }
  });
});

// The regression test for the whole of docs/design/water-shader.md §3.
// Layering is the hard part of the water feature and getting it wrong fails
// silently — water over the tall art, or under the islands it is supposed to
// lap against, both just look like a bad shader rather than a bug. Asserted on
// the pure ordering function rather than a mounted renderer for the same reason
// terrainTitleFor is extracted: `world`'s real children need a canvas and a
// Pixi Application, and this is our stack, not a third-party library.
describe('worldLayerOrder', () => {
  const indexIn = (mode: 'world' | 'settlement', name: string) => worldLayerOrder(mode).indexOf(name as never);

  it('puts the water mesh under the island polygons in world mode', () => {
    // §3.2: there is no water in the world-map canvas at all today (the sea is
    // a CSS gradient behind it), so the mesh fills an empty canvas and the
    // opaque terrainFlat hexes cover it wherever there is land.
    expect(worldLayerOrder('world')[0]).toBe('water');
    expect(indexIn('world', 'water')).toBeLessThan(indexIn('world', 'terrainFlat'));
  });

  it('puts the water mesh above the ground art and below the tall art in settlement mode', () => {
    // §3.3. The second half is what keeps a magictower's spire out of the
    // water: anything routed to terrainTop draws above the mesh by
    // construction, whatever the art's height (see legacyTileSplit.ts).
    expect(indexIn('settlement', 'terrainBase')).toBeLessThan(indexIn('settlement', 'water'));
    expect(indexIn('settlement', 'water')).toBeLessThan(indexIn('settlement', 'terrainTop'));
  });

  it('keeps the foam’s inward bleed clipped by real land geometry', () => {
    // §3.5: the foam band is allowed to run slightly onto land (the mask's G
    // channel), and in *both* views the land art draws above the mesh, so that
    // bleed is clipped for free rather than needing shader work.
    for (const mode of ['world', 'settlement'] as const) {
      const land = mode === 'world' ? 'terrainFlat' : 'terrainTop';
      expect(indexIn(mode, 'water')).toBeLessThan(indexIn(mode, land));
    }
  });

  it('never splits terrainBase into sea and land halves', () => {
    // The wrong answer an earlier draft of the plan reached, kept as an
    // assertion because it is not obviously wrong: every tile in the pack,
    // water included, has a 68px skirt, and a land tile's skirt reaches into
    // the top face of the water hex diagonally in front of it. Grouping all
    // the sea before all the land breaks that occlusion along every shore —
    // which is exactly where the foam is.
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(order.filter((name) => name === 'terrainBase')).toHaveLength(1);
    }
  });

  it('contains every layer exactly once in both modes', () => {
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(new Set(order).size).toBe(order.length);
      expect(order).toHaveLength(9);
    }
  });
});
