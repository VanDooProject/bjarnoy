import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Input } from '@angular/core';
import { Tile } from '../../../models/tile';
import { NgFor } from '@angular/common';
import { TileComponent } from '../../tile/tile.component';
import { Inject } from '@angular/core';

@Component({
  selector: 'app-chunk',
  imports: [TileComponent],
  templateUrl: './chunk.component.html',
  styleUrl: './chunk.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChunkComponent {
  //baseCoordX : number;
  //baseCoordY : number;

  //chunkSize : number;

  tiles = [] as Tile[];

  chunkHeight: number = 1000;
  chunkWidth: number = 2000;

  constructor(
    @Inject('baseCoordX') public baseCoordX: number,
    @Inject('baseCoordY') public baseCoordY: number
  ) {
    console.log(`chunk created ${this.baseCoordX}|${this.baseCoordY}`);
  }
}
