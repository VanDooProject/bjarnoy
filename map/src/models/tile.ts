export class Tile {
  x: number = 0;
  y: number = 0;

  type: string | null  = null;
  orientation: string = 'W';
  level: number | null = null;
  variant: number | null = null;
  color: string | null = null;

  riverTile: RiverTile | null = null;

  constructor(x : number, y : number) {
    this.x = x;
    this.y = y;
  }
}

export class RiverTile {
  river: River;
  position: number; // spring is pos 0

  constructor(river: River, position: number) {
    this.river = river;
    this.position = position;
  }
}

export class River {
  id: number;
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }
}
