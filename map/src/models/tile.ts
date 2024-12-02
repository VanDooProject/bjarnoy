export class Tile {
  x: number = 0;
  y: number = 0;

  type: string | null  = null;
  orientation: string = 'W';
  level: number | null = null;
  variant: number | null = null;
  color: string | null = null;

  constructor(x : number, y : number) {
    this.x = x;
    this.y = y;
  }
}
