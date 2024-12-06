
import { OffsetCoord } from "./offsetCoord";

export class HexCoord {
    q: number = 0;
    r: number = 0;
    s: number = 0;

    constructor(q: number, r: number) {
        this.q = q;
        this.r = r;
        this.s = -r -q;
    }

    axialToOddR() {
        var col = this.q;
        var row = this.r + (this.q - (this.q & 1)) / 2;
        return new OffsetCoord(col, row);
    }

    // to string
    public toString() {
        return `${this.q},${this.r},${this.s}`;
    }
}
