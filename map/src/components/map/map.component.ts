import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapService } from '../../services/map.service';
import { ChunkComponent } from '../components/chunk/chunk.component';
import { ComponentRef, ViewChild, ViewContainerRef } from '@angular/core';
import { Injector } from '@angular/core';
import { NgFor } from '@angular/common';

import { TileComponent } from '../tile/tile.component';
import { Tile } from '../../models/tile';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [
        CommonModule,
        ChunkComponent
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
    chunks = [] as Tile[][][]; // List<List<List<Tile>>>

    @ViewChild('chunkContainerRef', { read: ViewContainerRef, static: true })
    container!: ViewContainerRef;

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

        
        //this.chunkTiles = this.mapService.getChunk(0, 0, 10);
        this.chunks = [];
        //this.chunks[0] = this.mapService.getChunk(-3, 0, 7);
        //this.chunks[1] = this.mapService.getChunk(0, 10, 10);
        //this.chunks[2] = this.mapService.getChunk(10, 0, 10);
        //this.chunks[1] = this.mapService.getChunk(10, 10, 10);

        let chunk = this.mapService.getChunkHex(0,0,3);
        console.log("chunk", chunk);
        this.chunks[0] = chunk;
    }
}
