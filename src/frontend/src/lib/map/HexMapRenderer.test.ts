import { describe, expect, it } from 'vitest';
import { terrainTitleFor } from './HexMapRenderer';
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
