import { Injectable } from '@angular/core';
import { Tile } from '../app/models/tile';

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

  private tiles: Tile[][];

  constructor() {
    let chunkSize = 50;
    this.tiles = [];
    for (let x = 0; x <= chunkSize; x++) {
      this.tiles[x] = [];
      for (let y = 0; y <= chunkSize; y++) {
        this.tiles[x][y] = new Tile(x, y);

        // randomly select from type list and orientation
        let orientationIndex = Math.floor(Math.random() * this.orientations.length);
        this.tiles[x][y].orientation = this.orientations[orientationIndex];

        /*
        if(
          this.tileTypes[typeIndex] == "towerbuilding"
        ) {
          let level = Math.floor(Math.random() * 2);
          // level should be attached to the path; it should be formatted with 3 digits with leading zeros
          this.tiles[x][y].type = `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}_level${String(level).padStart(3, '0')}.png`;
        }
        else if(
          this.tileTypes[typeIndex] == "vikinghut"
        ) {
          let level = Math.floor(Math.random() * 5) + 0;
          this.tiles[x][y].type = `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}_level${String(level).padStart(3, '0')}.png`;
        }
        else if(
          this.tileTypes[typeIndex] == "farm_crop"
          || this.tileTypes[typeIndex] == "farm_pumpkin"
        ) {
          let level = Math.floor(Math.random() * 2) + 0;
          this.tiles[x][y].type = `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}_level${String(level).padStart(3, '0')}.png`;
        }
        else
        {
          this.tiles[x][y].type = `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}.png`;
        }
        */
        
        //this.tiles[x][y].type_src = `watertile_${this.orientations[orientationIndex]}.png`;

        // randomly select color
        let colorIndex = Math.floor(Math.random() * this.colors.length);
        //this.tiles[x][y].color = this.colors[colorIndex];
        this.tiles[x][y].color = Math.floor(Math.random() * 12) == 0 ? this.colors[colorIndex] : null;
      }
    }

    this.generateMap();
  }

  getTiles(): Tile[][] {
    return this.tiles;
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

    this.cleanMap();
    this.cleanMap();

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
