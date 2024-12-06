
import { OffsetCoord } from "./offsetCoord";

export class HexCoord {
    q: number = 0;
    r: number = 0;
    s: number = 0;

    constructor(s: number, r: number) {
        this.q = -s - r;
        this.r = r;
        this.s = s
    }

    axialToOddQ() {
        var col = this.q;
        var row = this.r + (this.q - (this.q & 1)) / 2;
        return new OffsetCoord(col, row);
    }

    // to string
    public toString() {
        return `${this.q},${this.r},${this.s}`;
    }
}
