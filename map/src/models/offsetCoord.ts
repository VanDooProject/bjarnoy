import { HexCoord } from "./hexCoord";

export class OffsetCoord {
    x: number = 0;
    y: number = 0;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    oddQToAxial() {
        var q = this.x
        var r = this.y - (this.x - (this.x & 1)) / 2
        let s = -q - r;
        return new HexCoord(s, r)
    }
}