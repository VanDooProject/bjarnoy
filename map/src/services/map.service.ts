import { Injectable } from '@angular/core';
import { River, RiverTile, Tile } from '../models/tile';
import { OffsetCoord } from '../models/offsetCoord';
import { HexCoord } from '../models/hexCoord';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  // types: map/public/images/hextiles/coastalwatertile_E.png map/public/images/hextiles/coastalwatertile_NE.png map/public/images/hextiles/coastalwatertile_NW.png map/public/images/hextiles/coastalwatertile_SE.png map/public/images/hextiles/coastalwatertile_SW.png map/public/images/hextiles/coastalwatertile_W.png map/public/images/hextiles/foresttile_E.png map/public/images/hextiles/foresttile_NE.png map/public/images/hextiles/foresttile_NW.png map/public/images/hextiles/foresttile_SE.png map/public/images/hextiles/foresttile_SW.png map/public/images/hextiles/foresttile_W.png map/public/images/hextiles/grasstile_E.png map/public/images/hextiles/grasstile_NE.png map/public/images/hextiles/grasstile_NW.png map/public/images/hextiles/grasstile_SE.png map/public/images/hextiles/grasstile_SW.png map/public/images/hextiles/grasstile_W.png map/public/images/hextiles/mountaintile_E.png map/public/images/hextiles/mountaintile_NE.png map/public/images/hextiles/mountaintile_NW.png map/public/images/hextiles/mountaintile_SE.png map/public/images/hextiles/mountaintile_SW.png map/public/images/hextiles/mountaintile_W.png map/public/images/hextiles/sandtile_E.png map/public/images/hextiles/sandtile_NE.png map/public/images/hextiles/sandtile_NW.png map/public/images/hextiles/sandtile_SE.png map/public/images/hextiles/sandtile_SW.png map/public/images/hextiles/sandtile_W.png map/public/images/hextiles/watertile_E.png map/public/images/hextiles/watertile_NE.png map/public/images/hextiles/watertile_NW.png map/public/images/hextiles/watertile_SE.png map/public/images/hextiles/watertile_SW.png map/public/images/hextiles/watertile_W.png
  private tileTypes = [
    //"watertile",
    //"coastalwatertile",
    //"sandtile",
    "grasstile",
    "foresttile",
    //"mountaintile",

    "fishinghutbuilding",
    "vikinghut",
    "farm_crop",
    "farm_pumpkin",

    //"towerbuilding",
    //"magictower",
  ];

  private orientations = [
    "E",
    "NE",
    "NW",
    "SE",
    "SW",
    "W",
  ];

  private colors = [
    "red",
    "green",
    "blue",
    "yellow",
    "purple",
    "orange",
  ];

  private tiles: Tile[][]; // [x][y]
  private tilesHex: Tile[][]; // [r][s]

  private mapSize = 30;
  private mapStart = -15;

  constructor() {
    this.tiles = [];
    this.tilesHex = [];

    for (let x = this.mapStart; x <= this.mapSize; x++) {
      this.tiles[x] = [];
      for (let y = this.mapStart; y <= this.mapSize; y++) {
        this.tiles[x][y] = new Tile(x, y);

        // randomly select from type list and orientation
        let orientationIndex = Math.floor(Math.random() * this.orientations.length);
        this.tiles[x][y].orientation = this.orientations[orientationIndex];

                // randomly select color
        let colorIndex = Math.floor(Math.random() * this.colors.length);
        //this.tiles[x][y].color = this.colors[colorIndex];
        this.tiles[x][y].color = Math.floor(Math.random() * 12) == 0 ? this.colors[colorIndex] : null;
      }
    }

    this.generateMap();

    this.calculateMapHexCoord();
  }

  getTiles(): Tile[][] {
    return this.tiles;
  }

  // get chunk of map by size and x,y
  getChunk(x: number, y: number, size: number): Tile[][] {
    let chunk = [] as Tile[][];
    for (let i = 0; i < size; i++) {
      let cy = y + i;
      chunk[i] = [];
      for (let j = 0; j < size; j++) {
        let cx = x + j;
        // this.tiles is in [x][y] format
        chunk[i][j] = this.tiles[cx][cy];
      }
    }

    return chunk; // chunk[y][x]
  }

  calculateMapHexCoord(): void {
    this.tilesHex = [] as Tile[][]; // [r][s]

    for (let x = this.mapStart; x < this.tiles.length; x++) {
      for (let y = this.mapStart; y < this.tiles[x].length; y++) {
        let hexCoord = new OffsetCoord(x, y).oddQToAxial();
        let s = hexCoord.s;
        let r = hexCoord.r;

        this.tilesHex[r] = this.tilesHex[r] || [];
        this.tilesHex[r][s] = this.tiles[x][y];
      }
    }
  }

  getChunkHex(s: number, r: number, size: number): Tile[][] {
    let chunk = [] as Tile[][]; // [r][s]

    // this.tiles[x][y]

    let top = new HexCoord(s, r).axialToOddQ();
    let right = new HexCoord(s - size, r).axialToOddQ();
    let bottom = new HexCoord(s - size, r + size).axialToOddQ();
    let left = new HexCoord(s, r + size).axialToOddQ();

    console.log("getChunkHex", top, right, bottom, left);

    for (let i = r; i <= r+size; i++) {
      chunk[i] = [];
      for (let j = s; j <= s+size; j++) {
        chunk[i][j] = this.tilesHex[r+i][s+j];
      }
    }

    return chunk; // chunk[r][s]
  }

  /*
   * method which recursively generates a map by starting in the middle itterating over the tiles and setting the type
   * the middle starts with a grasstile;
   * there are some rules which tiles allow which neigbours, this rules should be implemented in an dict/object structure
   * rules:
   *  - watertile can be surrounded by watertile, coastalwatertile
   *  - coastalwatertile can be surrounded by watertile, coastalwatertile, sandtile
   *  - sandtile can be surrounded by coastalwatertile, sandtile, grasstile
   * 
   *  - grasstile can be surrounded by grasstile, foresttile, mountaintile, sandtile 
   *  - foresttile can be surrounded by grasstile, foresttile, mountaintile
   *  - mountaintile can be surrounded by foresttile, mountaintile
   * 
   *  - farm_crop can be surrounded by grasstile, foresttile
   *  - farm_pumpkin can be surrounded by grasstile, foresttile
   *  - vikinghut can be surrounded by grasstile, foresttile
   */
  generateMap(): Tile[][] {

    // start in the middle
    let x = Math.floor(this.tiles.length / 2);
    let y = Math.floor(this.tiles[x].length / 2);

    // set the middle tile to grasstile
    this.tiles[x][y].type = "grasstile";

    // call setRandomTileType for all neighbors
    this.setRandomIterator(x, y);

    //this.cleanMap();
    //this.cleanMap();

    //for (let i = 0; i < 10; i++) {
    //  this.carveRiver(i);
    //}

    return this.tiles;
  }

  // removes all sandtiles which do not have a neighbor of type grasstile or coastalwatertile
  // removes all coastalwatertile which do not have a neighbor of type sandtile
  private cleanMap(): void {
    for (let x = 0; x < this.tiles.length; x++) {
      for (let y = 0; y < this.tiles[x].length; y++) {
        let neighbors = this.getNeighbors(x, y);
        let neighborTypes = neighbors.map(n => n.type);

        if (this.tiles[x][y].type == "sandtile") {
          if (
            !neighborTypes.includes("grasstile") &&
            // also check alternative tiles
            !neighborTypes.includes("farm_crop") &&
            !neighborTypes.includes("farm_pumpkin") &&
            !neighborTypes.includes("vikinghut")
          ) {
            this.tiles[x][y].type = "coastalwatertile";
          }
          else if (
            !neighborTypes.includes("coastalwatertile") &&
            // also check alternative tiles
            !neighborTypes.includes("fishinghutbuilding")
          ) {
            this.tiles[x][y].type = "grasstile";
          }
        }
        else if (this.tiles[x][y].type == "coastalwatertile") {
          if (!neighborTypes.includes("sandtile")) {
            //this.tiles[x][y].type = null;
            this.tiles[x][y].type = "watertile";
            // reset variant
            this.tiles[x][y].variant = null;
          }
        }
        else if (this.tiles[x][y].type == "fishinghutbuilding") {
          if (!neighborTypes.includes("sandtile")) {
            this.tiles[x][y].type = "watertile";
          }
        }
      }
    }
  }

  private carveRiver(riverId : number): [number, number][] {
    let [x, y] = this.getStartPoint();

    let river = new River(riverId, `riverId_${riverId}`);

    // use dijkstra to find the shortest path to the next sandtile
    //let path = this.dijkstra(x, y, ["sandtile", /*"rivertile",*/ "rivertile_bend"]); // only to bend so we get nicer Y crossings
    let path = this.dijkstra(x, y, ["sandtile", "rivertile", "rivertile_bend"]); // only to bend so we get nicer Y crossings

    console.log("path", path);

    // carve the path
    for (let i = 0; i < path.length; i++) {
      let [x, y] = path[i];
      this.tiles[x][y].type = "rivertile";
      this.tiles[x][y].riverTile = new RiverTile(river, i);
    }

    // corect river flow
    for (let i = 0; i < path.length; i++) {
      let [x, y] = path[i];
      this.fixRiver(x, y);
    }

    return path;
  }

/*
  * adopt roation and tile type
  *
  * spring tiles:
  * - E bottom left
  * - NE top left
  * - NW top
  * - SE bottom
  * - SW bottom right
  * - W top right
  *
  * straight tiles:
  * - E, W flow top/bottom
  * - NE, SW flow bottom left/top right
  * - NW, SE flow top left/bottom right
  * 
  * bend tiles:
  * - E top/bottom left
  * - NE top left/top right
  * - NW top/bottom right
  * - SE top left/bottom
  * - SW bottom left/bottom right
  * - W top right/bottom
  * 
  * rivertile_y_narrow:
  * - E top/bottom left/bottom
  * - NE top left/bottom left/top right
  * - NW top left/top/bottom right
  * - SE top left/bottom right/bottom
  * - SW bottom left/top right/bottom right
  * - W top/top right/bottom
  */
  private fixRiver(x: number, y: number, allowNesting = true): void {
    // get neighbors, filter only river
    let neighbors = this.getNeighbors(x, y).filter(n =>
      n.type == "rivertile" ||
      n.type == "rivertile_bend" ||
      n.type == "rivertile_spring" ||
      n.type == "coastalwatertile" ||
      n.type == "rivertile_y_narrow" ||
      n.type == "fishinghutbuilding" // TODO remove this
    );

    // if multiple costalwatertiles, drop all except one
    let coastalWaterTiles = neighbors.filter(n => n.type == "coastalwatertile");
    if(coastalWaterTiles.length > 1) {
      neighbors = neighbors.filter(n => n.type != "coastalwatertile");
      neighbors.push(coastalWaterTiles[0]);
    }

    // if there are other rivers multiple times, drop the ones farther from the spring (higher pos)
    let riverTiles = neighbors.filter(
      n => n.riverTile != null &&
      n.riverTile?.river.id != this.tiles[x][y].riverTile?.river.id);
    if(riverTiles.length > 1) {
      let nearestToSpring = riverTiles.reduce((prev, current) => {
        return prev.riverTile!.position < current.riverTile!.position ? prev : current;
      });

      // remove other river
      neighbors = neighbors.filter(n => n.riverTile == null || n.riverTile?.river.id == this.tiles[x][y].riverTile?.river.id);
      // add back nearest to spring
      neighbors.push(nearestToSpring);

      // fix other river first, because the main river should have the Y - this would likely loop if we add Y to filter list at beginning of this method
      if(allowNesting)
        this.fixRiver(nearestToSpring.x, nearestToSpring.y, false);
    }


    if(
      neighbors.length == 0 ||
      neighbors.length > 3
    ) {
      return;
    }

    if(neighbors.length == 1) {
      let tile = neighbors[0];
      let x1 = tile.x;
      let y1 = tile.y;
      let direction = this.getDirectionFromCoords(x, y, x1, y1);

      // spring tiles
      if(direction == "bottom left") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "E";
      }
      else if(direction == "top left") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "NE";
      }
      else if(direction == "top") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "NW";
      }
      else if(direction == "bottom") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "SE";
      }
      else if(direction == "bottom right") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "SW";
      }
      else if(direction == "top right") {
        this.tiles[x][y].type = "rivertile_spring";
        this.tiles[x][y].orientation = "W";
      }
    }
    else if(neighbors.length == 2) {
      let tile1 = neighbors[0];
      let tile2 = neighbors[1];
      let x1 = tile1.x;
      let y1 = tile1.y;
      let x2 = tile2.x;
      let y2 = tile2.y;

      let direction1 = this.getDirectionFromCoords(x, y, x1, y1);
      let direction2 = this.getDirectionFromCoords(x, y, x2, y2);

      // bend tiles
      if(
        this.isDirection(direction1, direction2, "top", "bottom left")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "E";
      }
      else if(
        this.isDirection(direction1, direction2, "top left", "top right")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "NE";
      }
      else if(
        this.isDirection(direction1, direction2, "top", "bottom right")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "NW";
      }
      else if(
        this.isDirection(direction1, direction2, "top left", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "SE";
      }
      else if(
        this.isDirection(direction1, direction2, "bottom left", "bottom right")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "SW";
      }
      else if(
        this.isDirection(direction1, direction2, "top right", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile_bend";
        this.tiles[x][y].orientation = "W";
      }

      // straight tiles
      else if(
        this.isDirection(direction1, direction2, "top", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile";
        //this.tiles[x][y].orientation = "E"; // or W
        this.tiles[x][y].orientation = Math.floor(Math.random() * 2) == 0 ? "E" : "W";
      }
      else if(
        this.isDirection(direction1, direction2, "bottom left", "top right")
      ) {
        this.tiles[x][y].type = "rivertile";
        //this.tiles[x][y].orientation = "NE"; // or SW
        this.tiles[x][y].orientation = Math.floor(Math.random() * 2) == 0 ? "NE" : "SW";
      }
      else if(
        this.isDirection(direction1, direction2, "top left", "bottom right")
      ) {
        this.tiles[x][y].type = "rivertile";
        //this.tiles[x][y].orientation = "NW"; // or SE
        this.tiles[x][y].orientation = Math.floor(Math.random() * 2) == 0 ? "NW" : "SE";
      }
      else
      {
        console.error(`unknown river bend ${x},${y}`, direction1, direction2);
      }
    }
    else if(neighbors.length == 3) {
      // add Y crossing - rivertile_y_narrow
      let tile1 = neighbors[0];
      let tile2 = neighbors[1];
      let tile3 = neighbors[2];

      let x1 = tile1.x;
      let y1 = tile1.y;
      let x2 = tile2.x;
      let y2 = tile2.y;
      let x3 = tile3.x;
      let y3 = tile3.y;

      let direction1 = this.getDirectionFromCoords(x, y, x1, y1);
      let direction2 = this.getDirectionFromCoords(x, y, x2, y2);
      let direction3 = this.getDirectionFromCoords(x, y, x3, y3);

      // rivertile_y_narrow
      if(
        this.isDirection3(direction1, direction2, direction3, "top", "bottom left", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "E";
      }
      else if(
        this.isDirection3(direction1, direction2, direction3, "top left", "bottom left", "top right")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "NE";
      }
      else if(
        this.isDirection3(direction1, direction2, direction3, "top left", "top", "bottom right")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "NW";
      }
      else if(
        this.isDirection3(direction1, direction2, direction3, "top left", "bottom right", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "SE";
      }
      else if(
        this.isDirection3(direction1, direction2, direction3, "bottom left", "top right", "bottom right")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "SW";
      }
      else if(
        this.isDirection3(direction1, direction2, direction3, "top right", "top", "bottom")
      ) {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "W";
      }
      else
      {
        this.tiles[x][y].type = "rivertile_y_narrow";
        this.tiles[x][y].orientation = "W"; // TODO replace tis dummy
        console.error(`unknown river Y ${x},${y}`, direction1, direction2, direction3);
      }
    }


    this.tiles[x][y].level = null;
    this.tiles[x][y].variant = null;

    console.log(`fixRiver ${x},${y}`, this.tiles[x][y].type, this.tiles[x][y].orientation, neighbors);
  }

  private isDirection(assert1 : string | null, assert2 : string | null, expect1 : string, expect2 : string): boolean {
    if(assert1 == null || assert2 == null) {
      return false;
    }
    
    return (
      (assert1 == expect1 && assert2 == expect2) ||
      (assert1 == expect2 && assert2 == expect1)
    );
  }

  // is direction str comparison for 3 directions
  private isDirection3(
    assert1 : string | null,
    assert2 : string | null,
    assert3 : string | null,
    expect1 : string,
    expect2 : string,
    expect3 : string): boolean {
    if(assert1 == null || assert2 == null || assert3 == null) {
      return false;
    }

    return (
      (assert1 == expect1 && assert2 == expect2 && assert3 == expect3) ||
      (assert1 == expect1 && assert2 == expect3 && assert3 == expect2) ||
      (assert1 == expect2 && assert2 == expect1 && assert3 == expect3) ||
      (assert1 == expect2 && assert2 == expect3 && assert3 == expect1) ||
      (assert1 == expect3 && assert2 == expect1 && assert3 == expect2) ||
      (assert1 == expect3 && assert2 == expect2 && assert3 == expect1)
    );
  }

  private dijkstra(x: number, y: number, targetTypes: string[]): [number, number][] {
    let visited = new Set<string>();
    let queue = [] as [number, number][];
    let previous = new Map<string, [number, number]>();

    queue.push([x, y]);
    visited.add(`${x},${y}`);

    while (queue.length > 0) {
      let [cx, cy] = queue.shift() as [number, number];
      let neighbors = this.getNeighbors(cx, cy);

      for (let i = 0; i < neighbors.length; i++) {
        let n = neighbors[i];
        let key = `${n.x},${n.y}`;

        if (!visited.has(key)) {
          visited.add(key);
          queue.push([n.x, n.y]);
          previous.set(key, [cx, cy]);
        }

        //if (n.type == targetType) {
        if (targetTypes.includes(n.type as string)) {
          let path = [] as [number, number][];
          let current: [number, number] | undefined = [n.x, n.y];

          while (current) {
            path.push(current);
            current = previous.get(`${current[0]},${current[1]}`);
          }

          path.reverse();
          return path;
        }
      }
    }

    return [];
  }

  private getStartPoint(): [number, number] {
    let x = Math.floor(Math.random() * this.tiles.length);
    let y = Math.floor(Math.random() * this.tiles[x].length);

    // retry if the tile is not a grasstile
    if (this.tiles[x][y].type != "grasstile") {
      console.log("retry getStartPoint", x, y);
      return this.getStartPoint();
    }

    return [x, y];
  }

  private rules = {
    "watertile": ["watertile", "coastalwatertile"],
    "coastalwatertile": ["watertile", "coastalwatertile", "sandtile"],
    "sandtile": ["coastalwatertile", "sandtile", "grasstile"],
    //"sandtile": ["coastalwatertile", "sandtile", "grasstile", "watertile", "foresttile"], // enable way more so we get less conflicts

    "grasstile": ["grasstile", "foresttile", "sandtile"],
    "foresttile": ["grasstile", "foresttile", "mountaintile"],
    //"foresttile": ["grasstile", "foresttile", "mountaintile", "sandtile"], // forest can be placed near sand, but not vice versa; this could lead to conflicts
    "mountaintile": ["foresttile", "mountaintile"],

    // buildings
    "farm_crop": ["grasstile", "foresttile"], // 2 level (starting with 0) -> 0,1
    "farm_pumpkin": ["grasstile", "foresttile"], // 2 level (starting with 0)
    "vikinghut": ["grasstile", "foresttile"], // 4 level (starting with 0) -> 0,1,2,3,4
    "fishinghutbuilding": ["sandtile", "coastalwatertile"/*, "watertile"*/],
  } as { [key: string]: string[] };

  private setRandomIterator(x: number, y: number): void {
    //if (this.tiles[x][y].type) {
    //  return;
    //}

    let neighbors = this.getNeighbors(x, y);

    //let unsetNeighborsCount = neighbors.filter(n => n.type == null);
    let unsetNeighborsCount = 0;
    let unsetNeighbors = [] as [number, number][]; // x, y
    for (let i = 0; i < neighbors.length; i++) {
      if (this.tiles[neighbors[i].x][neighbors[i].y].type == null) {
        this.setRandomTileType(neighbors[i].x, neighbors[i].y);
        unsetNeighborsCount++;
        unsetNeighbors.push([neighbors[i].x, neighbors[i].y]);
      }
    }

    //for (let i = 0; i < neighbors.length; i++) {
    //  let nextNeighbors = this.getNeighbors(x, y);
    //  for (let i = 0; i < nextNeighbors.length; i++) {
    //    if (this.tiles[nextNeighbors[i].x][nextNeighbors[i].y].type == null) {
    //      this.setRandomIterator(nextNeighbors[i].x, nextNeighbors[i].y);
    //    }
    //  }
    //}

    // recure for all unset neighbors
    //for (let i = 0; i < unsetNeighbors.length; i++) {
    //  this.setRandomIterator(unsetNeighbors[i][0], unsetNeighbors[i][1]);
    //}
  }

  private setRandomTileType(x: number, y: number): void {
    // set type if not already set
    if (this.tiles[x][y].type) {
      return;
    }
    
    // read the type of the neighbors; ignore the ones that are out of bounds
    let neighborTileTypes = [] as string[];
    // let neighborsCoords = this.getNeighborCoords(x, y);
    // for (let i = 0; i < neighborsCoords.length; i++) {
    //   let n = neighborsCoords[i];
    //   if (this.tiles[n[0]] && this.tiles[n[0]][n[1]]) {
    //     if(this.tiles[n[0]][n[1]].type)
    //     {
    //       neighborTileTypes.push(this.tiles[n[0]][n[1]].type as string);
    //     }
    //   }
    // }
    let neighbors = this.getNeighbors(x, y);
    for (let i = 0; i < neighbors.length; i++) {
      if(neighbors[i].type)
      {
        neighborTileTypes.push(neighbors[i].type as string);
      }
    }

    // remove buildings from the neighbors and replace them with grasstile
    for (let i = 0; i < neighborTileTypes.length; i++) {
      if(
        neighborTileTypes[i] == "farm_crop"
        || neighborTileTypes[i] == "farm_pumpkin"
        || neighborTileTypes[i] == "vikinghut"
      ) {
        neighborTileTypes[i] = "grasstile";
      }
      //else if(
      //  neighborTileTypes[i] == "towerbuilding"
      //  || neighborTileTypes[i] == "magictower"
      //) {
      //  neighborTileTypes[i] = "mountaintile";
      //}
      else if(
        neighborTileTypes[i] == "fishinghutbuilding"
      ) {
        neighborTileTypes[i] = "coastalwatertile";
      }
    }

    // get the possible types for this tile
    let possibleTypes = [] as string[];
    // iterate over the rules and check if the neighbors match the rules
    for (let rule in this.rules) {
      if (neighborTileTypes.every(r => this.rules[rule].includes(r))) {
        possibleTypes.push(rule);
      }
    }

    //console.log(`(${x}|${y}) possible types: ${possibleTypes}`);

    // TODO we need a fallback for conflicting tiles
    if (possibleTypes.length == 0) {
      console.log(`(${x}|${y}) no possible types found for: ${neighborTileTypes}`);
      return;
    }

    // randomly select a type
    let typeIndex = Math.floor(Math.random() * possibleTypes.length);
    // reroll the type if not grasstile, foresttile or mountaintile
    if(
      possibleTypes[typeIndex] != "grasstile"
      && possibleTypes[typeIndex] != "foresttile"
      && possibleTypes[typeIndex] != "mountaintile"
    ) {
      typeIndex = Math.floor(Math.random() * possibleTypes.length);
    }
    this.tiles[x][y].type = possibleTypes[typeIndex];

    //console.log(`(${x}|${y}) set type: ${this.tiles[x][y].type}`);
    console.log(`(${x}|${y}) possible types: `, possibleTypes,
      "neighborTileTypes", neighborTileTypes,
      "set type: ", this.tiles[x][y].type
    );

    // switch building and set level
    if(
      this.tiles[x][y].type == "farm_crop"
      || this.tiles[x][y].type == "farm_pumpkin"
    ) {
      let level = Math.floor(Math.random() * 2) + 0;
      this.tiles[x][y].level = level;
    }
    else if(
      this.tiles[x][y].type == "vikinghut"
    ) {
      let level = Math.floor(Math.random() * 5) + 0;
      this.tiles[x][y].level = level;
    }
    else if(
      this.tiles[x][y].type == "coastalwatertile" ||
      this.tiles[x][y].type == "foresttile"
    ) {
      //let variant = Math.floor(Math.random() * (1 + 2)) - 1;
      // fix distribution, for about 80% of the time we do not want a variant
      let variant = Math.floor(Math.random() * 2) + 0;
      this.tiles[x][y].variant = Math.floor(Math.random() * 12) == 0 ? variant : null;
    }

    // recursively call setRandomTileType for all neighbors
    //let neighbors = this.getNeighbors(x, y);
    for (let i = 0; i < neighbors.length; i++) {
      this.setRandomTileType(neighbors[i].x, neighbors[i].y);
    }
  }

  // get neighboring tiles on a odd-q hex grid - https://www.redblobgames.com/grids/hexagons/#neighbors
  // just coords as tuples
  private getNeighborCoords(x: number, y: number) : [number, number][] {
    if(x % 2 == 1) {
      return [
        [x + 1, y + 0], // top right
        [x + 1, y + 1], // bottom right
        [x + 0, y + 1], // bottom
        [x - 1, y + 1], // bottom left
        [x - 1, y + 0], // top left
        [x + 0, y - 1], // top
      ]
    }
    else
    {
      return [
        [x + 1, y - 1], // top right
        [x + 1, y + 0], // bottom right
        [x + 0, y + 1], // bottom
        [x - 1, y + 0], // bottom left
        [x - 1, y - 1], // top left
        [x + 0, y - 1], // top
      ];
    }

    return [
      //[x, y - 1],
      //[x + 1, y - 1],
      //[x + 1, y],
      //[x, y + 1],
      //[x - 1, y],
      //[x - 1, y - 1],

      // this is from red blob games
      //[x + 1, y + 0], // bottom right
      //[x + 1, y - 1], // top right
      //[x + 0, y - 1], // top
      //[x - 1, y + 0], // bottom left
      //[x - 1, y + 1], // distached
      //[x + 0, y + 1], // bottom

      // this is our cause y is inverted
      //[x + 0, y + 1],
      //[x + 1, y + 1],
      //[x + 1, y + 0],
      //[x + 0, y - 1],
      //[x - 1, y + 0],
      //[x - 1, y + 1],

      
      // another try with our but non inverted y - 10,4
      [x + 1, y + 0], // bottom right
      [x + 1, y - 1], // top right
      [x + 0, y - 1], // top
      [x - 1, y + 0], // bottom left
      [x - 1, y - 1], // distached -> now: top left
      [x + 0, y + 1], // bottom
    ];
  }

  private getDirectionFromCoords(x1: number, y1: number, x2: number, y2: number): string | null {
    if(x1 == x2 && y1 == y2) {
      return null;
    }

    let coords = [x2 - x1, y2 - y1];

    if(x1 % 2 == 1) {
      if(coords[0] == 1 && coords[1] == 0) {
        return "top right";
      }
      else if(coords[0] == 1 && coords[1] == 1) {
        return "bottom right";
      }
      else if(coords[0] == 0 && coords[1] == 1) {
        return "bottom";
      }
      else if(coords[0] == -1 && coords[1] == 1) {
        return "bottom left";
      }
      else if(coords[0] == -1 && coords[1] == 0) {
        return "top left";
      }
      else if(coords[0] == 0 && coords[1] == -1) {
        return "top";
      }
    }
    else
    {
      if(coords[0] == 1 && coords[1] == -1) {
        return "top right";
      }
      else if(coords[0] == 1 && coords[1] == 0) {
        return "bottom right";
      }
      else if(coords[0] == 0 && coords[1] == 1) {
        return "bottom";
      }
      else if(coords[0] == -1 && coords[1] == 0) {
        return "bottom left";
      }
      else if(coords[0] == -1 && coords[1] == -1) {
        return "top left";
      }
      else if(coords[0] == 0 && coords[1] == -1) {
        return "top";
      }
    }
    
    return null;
  }

  // gets a list of actual neighboring tiles, leaving out the ones that are out of bounds
  private getNeighbors(x: number, y: number): Tile[] {
    let neighbors = this.getNeighborCoords(x, y);
    let result = [];
    for (let i = 0; i < neighbors.length; i++) {
      let n = neighbors[i];
      if (this.tiles[n[0]] && this.tiles[n[0]][n[1]]) {
        result.push(this.tiles[n[0]][n[1]]);
      }
    }
    return result;
  }


}
