import { Tile } from "./tile";

export class Chunk {
    s: number = 0;
    r: number = 0;

    tiles = [] as Tile[][];
    tile_length: number = 0;

    size: number = 0;
  
    constructor(s : number, r : number, chunkTiles : Tile[][], size : number) {
      this.s = s;
      this.r = r;

      this.tiles = chunkTiles;
      this.tile_length = chunkTiles.length;

      this.size = size;
    }

    // overload "object identity"
    //equals(c: Chunk): boolean {
    //  return this.s == c.s && this.r == c.r && this.tiles.length == c.tiles.length;
    //}
}