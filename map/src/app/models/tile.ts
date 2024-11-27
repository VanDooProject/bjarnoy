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

  get type_src(): string {
    // `${this.tileTypes[typeIndex]}_${this.orientations[orientationIndex]}.png`;

    let variant = this.variant == null ? '' : `_variant${String(this.variant).padStart(3, '0')}`;

    if(this.level == null)
      return `${this.type}_${this.orientation}${variant}.png`;
    else
      return `${this.type}_${this.orientation}_level${String(this.level).padStart(3, '0')}${variant}.png`;
  }


}
