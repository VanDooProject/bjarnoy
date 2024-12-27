import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ElementRef } from '@angular/core';
import { NgIf } from '@angular/common';
import { Tile } from '../../models/tile';
import { HexCoord } from '../../models/hexCoord';



// ori image is 200x300

// image and tile hight do not match
export const TILE_HEIGHT = 92; // of tile, image is 300
// width is also different since they are offset
export const TILE_WIDTH = 150; // of tile image is 200

@Component({
    selector: '[app-tile]',
    standalone: true,
    imports: [
        CommonModule,
        //NgIf,
    ],
    templateUrl: './tile.component.svg',
    styleUrl: './tile.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent {
    @Input() height: number = 300;
    @Input() width: number = 200;
    @Input() label: string = '';

    @Input() tile: Tile | null = {} as Tile;

    constructor() {
    }

    get x(): number {
        return this.tile?.x || 0;
    }

    get y(): number {
        return this.tile?.y || 0;
    }
    
    get axial(): HexCoord | null {
        return this.tile?.offsetCoord.oddQToAxial() || null;
    }

    get type_src(): string {
      let variant = this.tile?.variant == null ? '' : `_variant${String(this.tile?.variant).padStart(3, '0')}`;
  
      if(this.tile?.level == null)
        return `${this.tile?.type}_${this.tile?.orientation}${variant}`;
      else
        return `${this.tile?.type}_${this.tile?.orientation}_level${String(this.tile?.level).padStart(3, '0')}${variant}`;
    }

    get href(): string {
        if(this.hrefTopping != null)
            return `./images/tiles/hextiles/base/${this.tile?.type}_${this.tile?.orientation}_base.png`;

        return `./images/tiles/hextiles/${this.type_src}.png`;
    }

    get hrefTopping(): string | null{
        if(
            this.tile?.type != 'grasstile' &&
            this.tile?.type != 'vikinghut' &&
            this.tile?.type != 'foresttile' &&
            this.tile?.type != 'farm_crop' &&
            this.tile?.type != 'farm_pumpkin' &&
            this.tile?.type != 'rivertile' &&
            this.tile?.type != 'rivertile_bend' &&
            this.tile?.type != 'rivertile_spring' &&
            this.tile?.type != 'rivertile_y_narrow'
        )
            return null;

        
        return `./images/tiles/hextiles/top/${this.type_src}.png`;
    }

    get transform(): string {
        //return `translate(${this.x}, ${this.y})`;


        if(this.axial == null)
            return '';
        
        //return `translate(${this.axial.s * tileWidth + 600}, ${this.y * tileHeight + (tileHeight / 2) * this.axial.s})`;
        //return `translate(${this.axial.q * tileWidth +300}, ${-this.axial.s * tileHeight + (tileHeight / 2) * -this.axial.q})`;
        //return `translate(${this.axial.q * tileWidth +600}, ${this.axial.r * tileHeight + 300})`;
        
        //return `translate(${this.axial.q * tileWidth + 600}, ${this.axial.s * tileHeight + 300})`;

        //if(this.axial.q % 2 == 1 || this.axial.q % 2 == -1) {
        //    return `translate(${this.axial.q * tileWidth +450}, ${this.axial.r * tileHeight + 250 - (tileHeight / 2)})`;
        //} else {
        //    return `translate(${this.axial.q * tileWidth +450}, ${this.axial.r * tileHeight + 250})`;
        //}

        //return `translate(${this.axial.q * tileWidth +450}, ${this.y * tileHeight + 250 + this.axial.q * (tileHeight / 2)})`;
        //return `translate(${this.axial.q * tileWidth +450}, ${this.y * tileHeight + 250})`;
        

        // convert x and y coordinates to actual pixel values; every second tile is offset by half the width and height
        //return `translate(${this.x * tileWidth + 600}, ${this.y * tileHeight + (tileHeight / 2) * this.x})`;
        
        if(this.x % 2 == 1 || this.x % 2 == -1) {
            return `translate(${this.x * TILE_WIDTH}, ${this.y * TILE_HEIGHT + TILE_HEIGHT / 2})`;
        } else {
            return `translate(${this.x * TILE_WIDTH}, ${this.y * TILE_HEIGHT})`;
        }
    }
}
