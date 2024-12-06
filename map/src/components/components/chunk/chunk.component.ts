import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Input } from '@angular/core';
import { Tile } from '../../../models/tile';
import { NgFor } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TileComponent } from '../../tile/tile.component';
import { Inject } from '@angular/core';

@Component({
  selector: '[app-chunk]',
  imports: [
    CommonModule,
    TileComponent,
  ],
  templateUrl: './chunk.component.svg',
  styleUrl: './chunk.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChunkComponent {
  baseCoordS : number = 0;
  baseCoordR : number = 0;

  chunkSize : number = 10;

  @Input() tiles = [] as Tile[][];

  chunkHeight: number = 350;
  chunkWidth: number = 2000;

  // constructor(
  //   @Inject('baseCoordX') public baseCoordX: number,
  //   @Inject('baseCoordY') public baseCoordY: number
  // ) {
  //   console.log(`chunk created ${this.baseCoordX}|${this.baseCoordY}`);
  // }
}
