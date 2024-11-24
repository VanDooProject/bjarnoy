import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TileComponent } from '../tile/tile.component';
import { MapService } from '../../services/map.service';
import { Tile } from '../../app/models/tile';

interface MapTile {
    x: number;
    y: number;
    color: string;
    label: string;
    src: string; // ./images/hextiles/foresttile_W.png
}

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [
        CommonModule,
        TileComponent,
    ],
    templateUrl: './map.component.html',
    styleUrl: './map.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent { 
    tileSize: number = 50;
    mapWidth: number = 500;
    mapHeight: number = 500;

    //tiles = [
    //    { x: 0, y: 0, color: 'red', label: 'A1' },
    //    //{ x: 200, y: 0, color: 'green', label: 'A2' },
    //    { x: 150, y: 50, color: 'green', label: 'A2' },
    //    { x: 0, y: 100, color: 'blue', label: 'B1' },
    //    //{ x: 200, y: 100, color: 'yellow', label: 'B2' },
    //    { x: 150, y: 150, color: 'yellow', label: 'B2' },
    //];
    //tiles = [
    //    { x: 0, y: 0, color: 'yellow', label: 'A1' },
    //    { x: 2, y: 0, color: 'yellow', label: 'C1' },
    //    { x: 1, y: 0, color: 'yellow', label: 'B1' },
    //    { x: 3, y: 0, color: 'yellow', label: 'D1' },
    //
    //    { x: 0, y: 1, color: 'yellow', label: 'A2' },
    //    { x: 2, y: 1, color: 'yellow', label: 'C2' },
    //    { x: 1, y: 1, color: 'yellow', label: 'B2' },
    //    { x: 3, y: 1, color: 'yellow', label: 'D2' },
    //
    //    { x: 0, y: 2, color: 'yellow', label: 'A3' },
    //    { x: 2, y: 2, color: 'yellow', label: 'C3' },
    //    { x: 1, y: 2, color: 'yellow', label: 'B3' },
    //    { x: 3, y: 2, color: 'yellow', label: 'D3' },
    //] as MapTile[];
    //];
    tiles = [] as MapTile[];

    constructor(private mapService : MapService) {
        this.tiles = [] as MapTile[];
        var rawTiles = mapService.getTiles(); // [x][y]
        var intermediateArray = [] as Tile[][]; // [y][x]

        // chunk size
        let chunkSize = rawTiles.length;

        // this.tiles.push({ x: x, y: y, color: "red", label: `(${x}|${y})` });

        // create map via loop
        // we do need to draw every second row first, then the other rows
        // calculate the pos in the tiles array; (0,0) and (0,1) need to be rendered before (1,0) and (1,1)
        for (let x = 0; x < rawTiles.length; x++) {
            for (let y = 0; y < rawTiles[x].length; y++) {
                intermediateArray[y] = intermediateArray[y] || [];
                intermediateArray[y][x] = rawTiles[x][y];
            }
        }

        //for (let y = intermediateArray.length * 2; y > 0; y--) {
        let y = 0;
        for (let row = 0; row < intermediateArray.length * 2; row++) {

            for (let x = 0; x < intermediateArray[row % intermediateArray.length].length; x++) {
                let coordY = y * -1 + (chunkSize-1);
                let tile = rawTiles[x][coordY];

                // skip every second row
                //if(x % 2 == 1) {
                if(x % 2 == row % 2) {
                    this.tiles.push({ x: x, y: y, color: "red", label: `(${x}|${coordY})`, src: tile.type });
                }
                else {
                    continue;
                }
            }

            // increment y only every second row
            if(row % 2 == 1) {
                y++;
            }
        }
        

    }
}
