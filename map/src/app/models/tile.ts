export class Tile {
  x: number = 0;
  y: number = 0;

  type: string | null  = null;
  orientation: string = 'W';
  level: number | null = null;
  color: string | null = null;

  constructor(x : number, y : number) {
    this.x = x;
    this.y = y;
  }

  get type_src(): string {
    // `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}.png`;

    if(this.level == null)
      return `${this.type}_${this.orientation}.png`;
    else
      return `${this.type}_${this.orientation}_level${String(this.level).padStart(3, '0')}.png`;
  }


}
