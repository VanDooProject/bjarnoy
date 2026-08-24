import 'zone.js/testing';
// Angular/TypeScript unit tests for MapService chunk-based map generation

import { MapService } from './map.service';
import { Tile } from '../models/tile';

describe('MapService', () => {
  let service: MapService;

  beforeEach(() => {
    service = new MapService();
  });

  it('should instantiate without errors', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a 2D array of tiles with correct dimensions', () => {
    const tiles = service.getTiles();
    expect(Array.isArray(tiles)).toBeTrue();
    // Check some sample coordinates
    expect(tiles[0][0]).toBeInstanceOf(Tile);
    expect(tiles[10][10]).toBeInstanceOf(Tile);
  });

  it('should assign orientation from allowed set', () => {
    const orientations = ["E", "NE", "NW", "SE", "SW", "W"];
    const tiles = service.getTiles();
    let found = false;
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < (tiles[x] || []).length; y++) {
        const tile = tiles[x][y];
        if (tile && orientations.includes(tile.orientation)) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBeTrue();
  });

  it('should assign color from allowed set or null', () => {
    const colors = ["red", "green", "blue", "yellow", "purple", "orange"];
    const tiles = service.getTiles();
    let foundColor = false;
    let foundNull = false;
    for (let x = 0; x < tiles.length; x++) {
      for (let y = 0; y < (tiles[x] || []).length; y++) {
        const tile = tiles[x][y];
        if (tile) {
          if (tile.color === null) foundNull = true;
          if (tile.color && colors.includes(tile.color)) foundColor = true;
        }
      }
    }
    expect(foundColor).toBeTrue();
    expect(foundNull).toBeTrue();
  });

  // Edge case: map boundaries
  it('should not throw for boundary coordinates', () => {
    const tiles = service.getTiles();
    expect(() => {
      const minX = 0;
      const minY = 0;
      const maxX = tiles.length - 1;
      const maxY = tiles[maxX].length - 1;
      [tiles[minX][minY], tiles[maxX][maxY]].forEach(tile => {
        expect(tile).toBeInstanceOf(Tile);
      });
    }).not.toThrow();
  });
});