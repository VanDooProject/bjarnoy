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

import { NgxDrag, type NgxInjectDrag } from 'ngxtension/gestures';
import { HostListener } from '@angular/core';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [
        CommonModule,
        ChunkComponent,
        NgxDrag,
    ],
    hostDirectives: [
        { directive: NgxDrag, outputs: ['ngxDrag'] },
    ],
    templateUrl: './map.component.html',
    styleUrl: './map.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent { 
    tileSize: number = 50;
    mapWidth: number = 500;
    mapHeight: number = 200;

    tiles = [] as Tile[];
    chunkTiles = [] as Tile[][];
    //chunks = [] as Tile[][][]; // List<List<List<Tile>>>
    chunks = [] as Chunk[]; // List<List<List<Tile>>>

    @ViewChild('chunkContainerRef', { read: ViewContainerRef, static: true })
    container!: ViewContainerRef;

    private offsetX = -300;
    private offsetY = -900;

    private startX = 0;
    private startY = 0;
    private scale = 0.33;
    
    transform: string = `scale(${this.scale}) translate(${this.offsetX} ${this.offsetY})`;

    positionX: number = this.offsetX;
    positionY: number = this.offsetY;

    


    @HostListener('ngxDrag', ['$event'])
    onDrag(state: NgxInjectDrag['state']) {
        // fire every time a drag event happens
        let x = 0;
        console.log("move peter enis", state);

        if (state.first) {
            let boundingBox = (state.currentTarget as HTMLElement).getBoundingClientRect();

            console.log("boundingBox", boundingBox);

            // honor element scaling
            let computedStyle = window.getComputedStyle(state.currentTarget as HTMLElement);
            let scaleX = parseFloat(computedStyle.transform.split(',')[0].slice(7));
            let scaleY = parseFloat(computedStyle.transform.split(',')[3]);
            console.log("scale", computedStyle.transform, scaleX, scaleY);

            this.startX = this.positionX;
            this.startY = this.positionY;

            console.log("start", this.startX, this.startY);
        }

        console.log("movement1", this.positionX, this.positionY, state.movement[0], state.movement[1]);

        this.positionX = this.startX + (state.movement[0]) / this.scale;
        this.positionY = this.startY + (state.movement[1]) / this.scale;

        this.transform = `scale(${this.scale}) translate(${this.positionX} ${this.positionY})`;

        console.log("movement2", this.positionX, this.positionY, state.movement[0], state.movement[1]);

        state.event.preventDefault();
        state.event.stopPropagation();
    }

    // Store references to dynamically created components
    private componentRefs: ComponentRef<ChunkComponent>[] = [];
    

    //@ViewChild('chunkContainerRef', { read: ViewContainerRef })
    //@ViewChild('chunkContainer')
    //chunkContainerRef: ViewContainerRef;

    // ngAfterViewInit() {
    //     console.log('Values on ngAfterViewInit():');
    //     //console.log("chunkContainerRef:", this.chunkContainerRef);
    //     console.log("chunkContainerRef:", this.container);

    //     //const injector = Injector.create({
    //     //    providers: [
    //     //        { provide: 'baseCoordX', useValue: 0 },
    //     //        { provide: 'baseCoordY', useValue: 0 },
    //     //    ]
    //     //});

    //     // create a list of injectors so we can use another for each component
    //     const injectors = [] as Injector[];
    //     // each injector should move 10 tiles (first by row then by column)
    //     for (let x = 0; x < 3; x++) {
    //         for (let y = 0; y < 3; y++) {
    //             const injector = Injector.create({
    //                 providers: [
    //                     { provide: 'baseCoordX', useValue: x*10 },
    //                     { provide: 'baseCoordY', useValue: y*10 },
    //                 ],
    //             }) as Injector;
    //             injectors.push(injector);
    //         }
    //     }

    //     // for each injector create a component
    //     injectors.forEach(injector =>
    //     {
    //         //this.componentRefs.push(this.container.createComponent(ChunkComponent, { injector }));
    //     });
        

        
    //     //this.componentRefs.push(this.container.createComponent(ChunkComponent, { injector }));

    //     // set tiles for each comp
    //     for (let i = 0; i < this.componentRefs.length; i++) {
    //         //this.componentRefs[i].instance.tiles = this.tiles;

    //         let comp = this.componentRefs[i].instance
    //         comp.tiles = this.mapService.getChunk(comp.baseCoordS, comp.baseCoordR, 10)[0];
    //     }


    //     //const componentRef2 = this.componentRefs[2];
    //     //componentRef2.destroy();

    // }  

    constructor(private mapService : MapService, private viewContainer: ViewContainerRef) {
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
