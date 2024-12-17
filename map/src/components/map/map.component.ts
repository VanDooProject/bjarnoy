import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapService } from '../../services/map.service';
import { ChunkComponent } from '../components/chunk/chunk.component';
import { ComponentRef, ViewChild, ViewContainerRef } from '@angular/core';
import { Injector } from '@angular/core';
import { NgFor } from '@angular/common';

import { TileComponent } from '../tile/tile.component';
import { Tile } from '../../models/tile';
import { Chunk } from '../../models/chunk';

import { HostListener } from '@angular/core';

import { ElementRef } from '@angular/core';

// import svg-pan-zoom mdoule
//import * as svgPanZoom from 'svg-pan-zoom';
import svgPanZoom from 'svg-pan-zoom';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [
        CommonModule,
        ChunkComponent,
    ],
    templateUrl: './map.component.html',
    styleUrl: './map.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent {     
    panZoomInstance!: SvgPanZoom.Instance;
    
    tileSize: number = 50;
    mapWidth: number = 500;
    mapHeight: number = 200;

    tiles = [] as Tile[];
    chunkTiles = [] as Tile[][];
    //chunks = [] as Tile[][][]; // List<List<List<Tile>>>
    chunks = [] as Chunk[]; // List<List<List<Tile>>>

    @ViewChild('chunkContainerRef', { read: ViewContainerRef, static: true })
    container!: ViewContainerRef;

    @ViewChild('svgMap')
    private mapElem!: ElementRef<SVGElement>;

    private offsetX = -300;
    private offsetY = -900;

    private startX = 0;
    private startY = 0;
    private scale = 0.33;
    
    transform: string = `scale(${this.scale}) translate(${this.offsetX} ${this.offsetY})`;

    positionX: number = this.offsetX;
    positionY: number = this.offsetY;

    ngAfterViewInit() {
        this.panZoomInstance = svgPanZoom(this.mapElem.nativeElement, {
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: true,
            center: true,
            minZoom: 0.5,
            maxZoom: 10,
        });
    }  

    constructor(private mapService: MapService, private viewContainer: ViewContainerRef) {        
        this.tiles = [] as Tile[];
        let tiles  = [] as Tile[];
        var rawTiles = mapService.getTiles(); // [x][y]
        var intermediateArray = [] as Tile[][]; // [y][x]


        //this.viewContainer.createComponent(ChunkComponent);
        //this.viewContainer.createComponent(ChunkComponent);

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
                //let coordY = y * -1 + (chunkSize-1); // invert Y
                let coordY = y;
                let tile = rawTiles[x][coordY];

                // skip every second row
                //if(x % 2 == 1) {
                if(x % 2 == row % 2) {
                    //tiles.push({ x: x, y: y, color: tile.color, label: `(${x}|${coordY})`, src: tile.type_src });
                    tiles.push(tile);
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
        
        // set in the end to replace references to trigger change detection only once
        this.tiles = tiles;

        
        let size = 15;

        //this.chunkTiles = this.mapService.getChunk(0, 0, 10);
        this.chunks = [];
        //this.chunks[0] = this.mapService.getChunk(-3, 0, 7);
        
        //this.chunks.push(this.mapService.getChunkHex(size-2, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(size-2, size-2, size));
        //this.chunks.push(this.mapService.getChunkHex(0, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(0, size-2, size));



        //this.chunks.push(this.mapService.getChunkHex(size, -size-1, size));
        //this.chunks.push(this.mapService.getChunkHex(size, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(size, size, size));
        //
        //this.chunks.push(this.mapService.getChunkHex(0, -size-1, size));
        //this.chunks.push(this.mapService.getChunkHex(0, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(0, size, size));
        //
        //this.chunks.push(this.mapService.getChunkHex(-size-1, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(-size-1, size, size));
        //
        //this.chunks.push(this.mapService.getChunkHex(-size*2-1, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(-size*2-1, size, size));
        //
        //this.chunks.push(this.mapService.getChunkHex(-size*3-1, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(-size*3-1, size, size));
        //
        //this.chunks.push(this.mapService.getChunkHex(-size*4-1, 0, size));
        //this.chunks.push(this.mapService.getChunkHex(-size*4-1, size, size));


        
        this.chunks.push(this.mapService.getChunkHex(0, -size, size));
        this.chunks.push(this.mapService.getChunkHex(0, 0, size));
        this.chunks.push(this.mapService.getChunkHex(0, size, size));
        //this.chunks.push(this.mapService.getChunkHex(0, size*2, size));
        this.chunks.push(this.mapService.getChunkHex(0, size*3, size));



        //this.chunks[0] = this.mapService.getChunkHex(size-2, 0, size);
        //this.chunks[1] = this.mapService.getChunkHex(size-2, size-2, size);
        //this.chunks[2] = this.mapService.getChunkHex(0, 0, size);
        //this.chunks[4] = this.mapService.getChunkHex(0, size-2, size);
        //this.chunks[5] = this.mapService.getChunkHex(0, size-2, size);
        
        
        //this.chunks.push(this.mapService.getChunkHex(size, 0, 2));
        //this.chunks.push(this.mapService.getChunkHex(size, 0, size+2));
        //this.chunks.push(this.mapService.getChunkHex(size, size, size+2));

        //let chunk = this.mapService.getChunkHex(0,0,3);
        //let chunk = this.mapService.getChunkHex(0,0,3);
        //console.log("chunk", chunk);
        //this.chunks[0] = chunk;


        // let chunk = this.mapService.getChunkHex(0,0,3);
        // console.log("chunk0", chunk);
        // this.chunks[0] = chunk;
        // this.chunks[1] = this.mapService.getChunkHex(0,-4,3);
        // console.log("chunk1", this.chunks[1]);
        // this.chunks[2] = this.mapService.getChunkHex(4,0,3);
        // console.log("chunk1", this.chunks[2]);
        // this.chunks[3] = this.mapService.getChunkHex(4,-4,3);
        // console.log("chunk1", this.chunks[3]);
    }
}
