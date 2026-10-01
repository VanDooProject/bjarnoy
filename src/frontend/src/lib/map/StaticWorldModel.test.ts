// StaticWorldModel is WastedIsland.vue's whole reason for existing: a
// WorldModel whose terrain is a fixed Tile[] rather than seed-derived, so the
// docs page's "turning island" can drive the real HexMapRenderer instead of
// its own hand-positioned DOM sprites. These tests exercise exactly the
// contract HexMapRenderer's preview branch (settlement mode, no settlement)
// relies on — see that class's own `worldModel.*` call sites this class
// overrides.
import { describe, expect, it } from 'vitest';
import { StaticWorldModel } from './StaticWorldModel';
import type { Tile } from './types';

function tile(overrides: Partial<Tile> & { q: number; r: number }): Tile {
  return { terrain: 'grass', ...overrides };
}

describe('StaticWorldModel', () => {
  it('returns the exact stored tile for its own coordinate', () => {
    const world = new StaticWorldModel([tile({ q: 1, r: -1, terrain: 'forest', variant: 2, orientation: 'NE' })]);
    const t = world.getTile(1, -1);
    expect(t.terrain).toBe('forest');
    expect(t.variant).toBe(2);
    expect(t.orientation).toBe('NE');
  });

  it('answers a plain, never-drawn sea tile for a coordinate outside the layout', () => {
    const world = new StaticWorldModel([tile({ q: 0, r: 0 })]);
    expect(world.getTile(9, 9)).toEqual({ q: 9, r: 9, terrain: 'sea' });
  });

  it('setTiles replaces the whole layout, not merges into it', () => {
    const world = new StaticWorldModel([tile({ q: 0, r: 0, terrain: 'mountain' })]);
    world.setTiles([tile({ q: 5, r: 5, terrain: 'sand' })]);
    // The old coordinate is gone (falls back to the never-drawn sea default)...
    expect(world.getTile(0, 0).terrain).toBe('sea');
    // ...and the new one is there.
    expect(world.getTile(5, 5).terrain).toBe('sand');
  });

  describe('terrainOf / isLand', () => {
    it('agrees with getTile.terrain for a stored tile', () => {
      const world = new StaticWorldModel([tile({ q: 2, r: 0, terrain: 'sand' })]);
      expect(world.terrainOf(2, 0)).toBe('sand');
      expect(world.isLand(2, 0)).toBe(true);
    });

    it('treats an unstored coordinate as sea (not land)', () => {
      const world = new StaticWorldModel([]);
      expect(world.terrainOf(3, 3)).toBe('sea');
      expect(world.isLand(3, 3)).toBe(false);
    });
  });

  describe('isWastedLandAt / isWastedRevealed', () => {
    it('is wasted land only for a wasted, non-sea tile', () => {
      const world = new StaticWorldModel([
        tile({ q: 0, r: 0, terrain: 'grass', wasted: true }),
        tile({ q: 1, r: 0, terrain: 'sea', wasted: true, isCoastalWater: true }),
        tile({ q: 2, r: 0, terrain: 'grass', wasted: false }),
      ]);
      expect(world.isWastedLandAt(0, 0)).toBe(true);
      expect(world.isWastedLandAt(1, 0)).toBe(false);
      expect(world.isWastedLandAt(2, 0)).toBe(false);
    });

    it('isWastedRevealed is true iff any stored tile is wasted', () => {
      expect(new StaticWorldModel([tile({ q: 0, r: 0, wasted: true })]).isWastedRevealed()).toBe(true);
      expect(new StaticWorldModel([tile({ q: 0, r: 0, wasted: false })]).isWastedRevealed()).toBe(false);
      expect(new StaticWorldModel([]).isWastedRevealed()).toBe(false);
    });

    it('reflects a setTiles rebuild (WastedIsland.vue advancing the blight slider)', () => {
      const world = new StaticWorldModel([tile({ q: 0, r: 0, wasted: false })]);
      expect(world.isWastedRevealed()).toBe(false);
      world.setTiles([tile({ q: 0, r: 0, wasted: true })]);
      expect(world.isWastedRevealed()).toBe(true);
    });
  });

  describe('previewIslandTiles / previewCropTiles', () => {
    it('return every stored coordinate, including water, regardless of the given center', () => {
      const tiles = [
        tile({ q: 0, r: 0, terrain: 'grass' }),
        tile({ q: 1, r: 0, terrain: 'sea' }),
        tile({ q: -5, r: 8, terrain: 'sea', isCoastalWater: true }),
      ];
      const world = new StaticWorldModel(tiles);
      const expected = expect.arrayContaining(tiles.map((t) => ({ q: t.q, r: t.r })));
      expect(world.previewIslandTiles({ q: 0, r: 0 })).toHaveLength(3);
      expect(world.previewIslandTiles({ q: 0, r: 0 })).toEqual(expected);
      expect(world.previewCropTiles({ q: 999, r: -999 })).toEqual(expected);
    });
  });

  describe('giantAnchorAt', () => {
    it('reads the anchor straight off a covered tile\'s own giant field', () => {
      const anchor = { q: 4, r: -2 };
      const world = new StaticWorldModel([
        tile({ q: 4, r: -2, giant: { family: 'giantshrine', anchor, part: 'C', orientation: 'SE' } }),
        tile({ q: 5, r: -2, giant: { family: 'giantshrine', anchor, part: 'SE', orientation: 'SE' } }),
      ]);
      expect(world.giantAnchorAt({ q: 4, r: -2 })).toEqual(anchor);
      expect(world.giantAnchorAt({ q: 5, r: -2 })).toEqual(anchor);
    });

    it('is null for a hex with no giant', () => {
      const world = new StaticWorldModel([tile({ q: 0, r: 0 })]);
      expect(world.giantAnchorAt({ q: 0, r: 0 })).toBeNull();
      expect(world.giantAnchorAt({ q: 9, r: 9 })).toBeNull();
    });
  });

  it('has no rivers and no buildings', () => {
    const world = new StaticWorldModel([tile({ q: 0, r: 0 })]);
    expect(world.getRiverTile(0, 0)).toBeUndefined();
    expect(world.buildingHexKeys()).toEqual([]);
  });

  it('sees its own wall hexes, so a palisade draws the piece its wall neighbours decide', () => {
    // Three walls in a row along q: the middle one has a wall on its E (+q) and W (-q) sides.
    const world = new StaticWorldModel([
      tile({ q: -1, r: 0, buildingType: 'palisade', buildingLevel: 1 }),
      tile({ q: 0, r: 0, buildingType: 'palisade', buildingLevel: 1 }),
      tile({ q: 1, r: 0, buildingType: 'palisade', buildingLevel: 1 }),
    ]);
    expect(world.wallNeighbourFlags({ q: 0, r: 0 }).filter(Boolean)).toHaveLength(2);

    // Replacing the layout drops the old walls from the index.
    world.setTiles([tile({ q: 0, r: 0, buildingType: 'palisade', buildingLevel: 1 })]);
    expect(world.wallNeighbourFlags({ q: 0, r: 0 }).some(Boolean)).toBe(false);
  });
});
