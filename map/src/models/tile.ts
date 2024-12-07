import { OffsetCoord } from "./offsetCoord";
import { HexCoord } from "./hexCoord";

export class Tile {
    offsetCoord: OffsetCoord = new OffsetCoord(0, 0);
    //x: number = 0;
    //y: number = 0;
    hexCoord : HexCoord = new HexCoord(0, 0);

    type: string | null = null;
    orientation: string = 'W';
    level: number | null = null;
    variant: number | null = null;
    color: string | null = null;

    riverTile: RiverTile | null = null;

    constructor(x: number, y: number) {
        // this.x = x;
        // this.y = y;
        this.offsetCoord = new OffsetCoord(x, y);
        this.hexCoord = this.offsetCoord.oddQToAxial();
    }

    get x(): number {
        return this.offsetCoord.x;
    }

    get y(): number {
        return this.offsetCoord.y;
    }

    public toString() {
        let tmp = this.offsetCoord.oddQToAxial();
        return `xy: ${this.offsetCoord.x},${this.offsetCoord.y},   qrs:${tmp.q},${tmp.r},${tmp.s}`;
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
