import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Input } from '@angular/core';
import { Tile } from '../../models/tile';
import { NgFor } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TileComponent } from '../tile/tile.component';
import { Inject } from '@angular/core';
import { Chunk } from '../../models/chunk';
import { HexCoord } from '../../models/hexCoord';

@Component({
  selector: '[app-chunk]',
  standalone: true,
  imports: [
    CommonModule,
    TileComponent,
  ],
  templateUrl: './chunk.component.svg',
  styleUrl: './chunk.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChunkComponent {
  //baseCoordS : number = 0;
  //baseCoordR : number = 0;

  //chunkSize : number = 3;

  //@Input() tiles = [] as Tile[][];
  
  @Input({alias: 'chunk', required: true})
  public chunk: Chunk = {} as Chunk;


  //chunkHeight: number = 3050;
  //chunkWidth: number = 2000;

  // constructor(
  //   @Inject('baseCoordX') public baseCoordX: number,
  //   @Inject('baseCoordY') public baseCoordY: number
  // ) {
  //   console.log(`chunk created ${this.baseCoordX}|${this.baseCoordY}`);
  // }
  constructor( ) {
  }

  ngOnInit() {
    console.log(`chunk component inited sr=${this.chunk?.s}|${this.chunk?.r}, size: ${this.chunk?.size}`, this.chunk?.tiles);
  }

  

  get transform(): string {
    //var coord = this.chunk.tiles[0][0].offsetCoord;
    var coord = new HexCoord(this.chunk.s, this.chunk.r).axialToOddQ();

    // image and tile hight do not match
    var tileHeight = 92; // of tile, image is 300
    // width is also different since they are offset
    var tileWidth = 150; // of tile image is 200

    //return `translate(${coord.x * tileWidth + 2000}, ${coord.y * tileHeight})`;
    return `translate(0,0)`;
}
}
