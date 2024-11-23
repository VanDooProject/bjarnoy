import { Injectable } from '@angular/core';
import { Tile } from '../app/models/tile';

@Injectable({
  providedIn: 'root'
})
export class MapService {

  private tiles: Tile[][];

  constructor() {
    this.tiles = [];
    for (let x = 0; x <= 10; x++) {
      this.tiles[x] = [];
      for (let y = 0; y <= 10; y++) {
        this.tiles[x][y] = new Tile();
      }
    }
  }


}
