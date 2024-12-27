import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, NgZone } from '@angular/core';
import { MapService } from '../../services/map.service';
import { ChunkComponent } from '../chunk/chunk.component';
import { ComponentRef, ViewChild, ViewContainerRef } from '@angular/core';
import { Injector } from '@angular/core';
import { NgFor } from '@angular/common';

import { TileComponent } from '../tile/tile.component';
import { Tile } from '../../models/tile';
import { Chunk } from '../../models/chunk';
import { TILE_WIDTH, TILE_HEIGHT } from '../tile/tile.component';
import { OffsetCoord } from '../../models/offsetCoord';

import { HostListener } from '@angular/core';

import { ElementRef, ChangeDetectorRef } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

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
    centerPosition$ = new BehaviorSubject<{ x: number; y: number }>({ x: 69, y: 69 });

    boundingBox$ = new BehaviorSubject<{ width: number; height: number; x: number; y: number }>({ width: 420, height: 420, x: 69, y: 69 });

    svgBoundingBox = { x: 0, y: 0, width: 0, height: 0 };
    //svgBoundingBox : DOMRect | null = null;

    centerPosition: { x: number, y: number } = { x: 69, y: 69 };

    // getter for centerPosition
    get centerPositionX(): number {
        return this.centerPosition.x;
    }
    get centerPositionY(): number {
        return this.centerPosition.y;
    }

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

    zone: NgZone = new NgZone({ enableLongStackTrace: false });

    ngAfterViewInit() {
        let minZoom = 0.05;
        let maxZoom = 0.30;

        // adopt min and max by DPI; and device resolution
        let dpi = window.devicePixelRatio;
        console.log("dpi", dpi);
        let resolution = window.screen.availWidth;
        console.log("resolution", resolution, window.innerWidth);
        // screen of 1080p is default, if the screen is bigger we need to reduce the zoom by a caclulated FACTOR
        let factor = 1920 / window.screen.availWidth;
        console.log("factor", factor);
        minZoom = minZoom / factor / dpi;
        maxZoom = maxZoom / factor / dpi;

        console.log("zoom", minZoom, maxZoom);
       
        
        

        this.panZoomInstance = svgPanZoom(this.mapElem.nativeElement, {
            zoomEnabled: true,
            panEnabled: true,
            controlIconsEnabled: false,
            dblClickZoomEnabled: true,
            mouseWheelZoomEnabled: true,
            fit: true,
            center: true,
            minZoom,
            maxZoom,
            zoomScaleSensitivity: 0.5,
            preventMouseEventsDefault: true,
            //beforePan: this.panHandler,
            beforePan: (oldPan, newPan) => { this.panHandler(oldPan, newPan); },
            //beforePan: (oldPan, newPan) => {
            //    this.centerPosition = this.panHandler(oldPan, newPan);
            //
            //    // set center position in default NgZone
            //    this.zone.run(() => {
            //        this.centerPosition = { ...this.centerPosition }//{ x: this.centerPosition.x, y: this.centerPosition.y };
            //        //self.centerPosition = { x: 420, y: 420 }
            //    });
            //},
        });
        console.log("initial.zoom", this.panZoomInstance.getZoom());
        this.panZoomInstance.pan({ x: 0, y: 0 });
        this.panZoomInstance.zoom(0.10);

        //this.clickLoadChunks();
        let viewportBoundingBox = this.calculateViewportBoundingBox(this.panZoomInstance.getSizes(), this.panZoomInstance.getPan());
        let visibleTiles = this.calculateVisibleTiles(viewportBoundingBox);
        console.log("initial visibleTiles", visibleTiles);
        this.loadChunks(visibleTiles);

        this.cdr.markForCheck();
        this.cdr.detectChanges();
    }  

    constructor(
        private mapService: MapService,
        private viewContainer: ViewContainerRef,
        private cdr: ChangeDetectorRef) {    
        
            
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

        
        let size = 4;

        this.chunks = [];

        // this.chunks.push(this.mapService.getChunkHex(0, -size, size));
        // this.chunks.push(this.mapService.getChunkHex(0, 0, size));
        // this.chunks.push(this.mapService.getChunkHex(0, size, size));
        // //this.chunks.push(this.mapService.getChunkHex(0, size*2, size));
        // this.chunks.push(this.mapService.getChunkHex(0, size*3, size));

        
        
        //this.svgBoundingBox = this.svgBoundingBox ?? this.mapElem.nativeElement.getBoundingClientRect();
        // set bounding box initially to browser window size
        this.svgBoundingBox = {
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight
        }
    }

    clickLoadChunks() {
        this.loadChunks(this.visibleTiles);
    }


    // x and y are offsets
    loadChunks( tiles: {width: number, height: number, x: number, y: number} ) {
        let size = 4;

        let chunkCountWidth = Math.ceil(tiles.width / size)+1;
        let chunkCountHeight = Math.ceil(tiles.height / size)+1;

        tiles.x = Math.floor(tiles.x);
        tiles.y = Math.floor(tiles.y);
        
        let offsetCoord = new OffsetCoord(tiles.x, tiles.y);
        let hexCoord = offsetCoord.oddQToAxial();

        // add new chunks
        for(let s = 0; s > -chunkCountWidth; s--) {
            for(let r = 0; r < chunkCountHeight; r++) {
                let chunk = this.mapService.getChunkHex(hexCoord.s + s * size, hexCoord.r + r * size, size);
                this.chunks.push(chunk);
            }
        }
    }



    panHandler(oldPan: SvgPanZoom.Point, newPan: SvgPanZoom.Point) : void | boolean | SvgPanZoom.PointModifier {
    //panHandler(oldPan: SvgPanZoom.Point, newPan: SvgPanZoom.Point) : { x: number, y: number } {
        //let zoom = (this as any).getZoom();
        let zoom = this.panZoomInstance.getZoom();

        //this.svgBoundingBox = this.svgBoundingBox ?? this.mapElem.nativeElement.getBoundingClientRect();
        console.log("svgBoundingBox", this.svgBoundingBox);

        this.panZoomInstance.updateBBox(); // Update viewport bounding box
        let sizes = this.panZoomInstance.getSizes();
        console.log("panHandler",
                //this.centerPosition,
                zoom,
                sizes,
                sizes.viewBox,
            //{            
            //    xo: oldPan.x / zoom, 
            //    yo: oldPan.y / zoom
            //},
            //{
            //    x: newPan.x / zoom, 
            //    y: newPan.y / zoom
            //}
        );

        // https://stackoverflow.com/questions/28490814/using-svg-js-and-svg-pan-zoom-how-can-i-get-current-viewport-center-point
        // var positionX = -1*svgPanZoom.getPan.x/svgPanZoom.getSizes.realZoom;
        // var positionY = -1*svgPanZoom.getPan.y/svgPanZoom.getSizes.realZoom;

        this.centerPosition$.next({ x: newPan.x, y: newPan.y });
        this.boundingBox$.next(this.calculateViewportBoundingBox(sizes, newPan));

        //return { x: newPan.x / zoom, y: newPan.y / zoom };
    }

    private calculateViewportBoundingBox(sizes: SvgPanZoom.Sizes, newPan: SvgPanZoom.Point): { width: number; height: number; x: number; y: number; } {
        return {
            width: this.svgBoundingBox.width / sizes.realZoom,
            height: this.svgBoundingBox.height / sizes.realZoom,
            x: -1 * newPan.x / sizes.realZoom,
            y: -1 * newPan.y / sizes.realZoom,
        };
    }

    // reset center position
    resetCenterPosition() {
        //this.centerPosition = { x: 0, y: 0 };
        this.centerPosition = { x: this.centerPosition.x, y: this.centerPosition.y };

        
        //this.ngModel.update.emit(value);
    }

    // on window resize; save svg `this.mapElem` bounding box
    @HostListener('window:resize', ['$event'])
    windowResize(event: Event) {
        this.svgBoundingBox = this.mapElem.nativeElement.getBoundingClientRect();

        console.log("windowResize", this.svgBoundingBox);
    }

    get visibleTiles(): {width: number, height: number, x: number, y: number} {
        return this.calculateVisibleTiles(this.boundingBox$.value);
    }

    private calculateVisibleTiles(tiles : { width: number; height: number; x: number; y: number; }):
        { width: number; height: number; x: number; y: number; }
    {
        return {
            width: tiles.width / TILE_WIDTH,
            height: tiles.height / TILE_HEIGHT,
            x: tiles.x / TILE_WIDTH,
            y: tiles.y / TILE_HEIGHT,
        };
    }
}
