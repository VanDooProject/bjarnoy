import { Injectable } from '@angular/core';
import { Tile } from '../app/models/tile';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  // types: map/public/images/hextiles/coastalwatertile_E.png map/public/images/hextiles/coastalwatertile_NE.png map/public/images/hextiles/coastalwatertile_NW.png map/public/images/hextiles/coastalwatertile_SE.png map/public/images/hextiles/coastalwatertile_SW.png map/public/images/hextiles/coastalwatertile_W.png map/public/images/hextiles/foresttile_E.png map/public/images/hextiles/foresttile_NE.png map/public/images/hextiles/foresttile_NW.png map/public/images/hextiles/foresttile_SE.png map/public/images/hextiles/foresttile_SW.png map/public/images/hextiles/foresttile_W.png map/public/images/hextiles/grasstile_E.png map/public/images/hextiles/grasstile_NE.png map/public/images/hextiles/grasstile_NW.png map/public/images/hextiles/grasstile_SE.png map/public/images/hextiles/grasstile_SW.png map/public/images/hextiles/grasstile_W.png map/public/images/hextiles/mountaintile_E.png map/public/images/hextiles/mountaintile_NE.png map/public/images/hextiles/mountaintile_NW.png map/public/images/hextiles/mountaintile_SE.png map/public/images/hextiles/mountaintile_SW.png map/public/images/hextiles/mountaintile_W.png map/public/images/hextiles/sandtile_E.png map/public/images/hextiles/sandtile_NE.png map/public/images/hextiles/sandtile_NW.png map/public/images/hextiles/sandtile_SE.png map/public/images/hextiles/sandtile_SW.png map/public/images/hextiles/sandtile_W.png map/public/images/hextiles/watertile_E.png map/public/images/hextiles/watertile_NE.png map/public/images/hextiles/watertile_NW.png map/public/images/hextiles/watertile_SE.png map/public/images/hextiles/watertile_SW.png map/public/images/hextiles/watertile_W.png
  private tileTypes = [
    "coastalwatertile",
    "foresttile",
    "grasstile",
    "mountaintile",
    "sandtile",
    "watertile",
  ];

  private orientations = [
    "E",
    "NE",
    "NW",
    "SE",
    "SW",
    "W",
  ];

  private tiles: Tile[][];

  constructor() {
    this.tiles = [];
    for (let x = 0; x <= 10; x++) {
      this.tiles[x] = [];
      for (let y = 0; y <= 10; y++) {
        this.tiles[x][y] = new Tile();

        // randomly select from type list and orientation
        let typeIndex = Math.floor(Math.random() * this.tileTypes.length);
        let orientationIndex = Math.floor(Math.random() * this.orientations.length);

        this.tiles[x][y].type = `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}.png`;
      }
    }
  }

  getTiles(): Tile[][] {
    return this.tiles;
  }


}
