import { Tile } from "./tile";

export class Chunk {
    s: number = 0;
    r: number = 0;
  
    tiles = [] as Tile[][];
  
    constructor(s : number, r : number, chunkTiles : Tile[][]) {
      this.r = s;
      this.r = r;
      this.tiles = chunkTiles;
    }
}