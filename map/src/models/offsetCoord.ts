import { HexCoord } from "./hexCoord";

export class OffsetCoord {
    x: number = 0;
    y: number = 0;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    oddRToAxial() {
        var q = this.x
        var r = this.y - (this.x - (this.x & 1)) / 2
        return new HexCoord(q, r)
    }
}