import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ElementRef } from '@angular/core';
import { NgIf } from '@angular/common';
import { Tile } from '../../app/models/tile';

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
    @Input() x: number = 0;
    @Input() y: number = 0;
    @Input() height: number = 300;
    @Input() width: number = 200;
    @Input() label: string = '';

    @Input() tile: Tile | null = null;

    constructor() {
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
            this.tile?.type != 'vikinghut' &&
            this.tile?.type != 'foresttile' &&
            this.tile?.type != 'farm_crop' &&
            this.tile?.type != 'farm_pumpkin' &&
            this.tile?.type != 'rivertile' &&
            this.tile?.type != 'rivertile_bend' &&
            this.tile?.type != 'rivertile_spring'
        )
            return null;

        
        return `./images/tiles/hextiles/top/${this.type_src}.png`;
    }

    get transform(): string {
        //return `translate(${this.x}, ${this.y})`;

        // image and tile hight do not match
        var tileHeight = 92;
        // width is also different since they are offset
        var tileWidth = 150;
        
        // convert x and y coordinates to actual pixel values; every second tile is offset by half the width and height
        if(this.x % 2 == 1) {
            return `translate(${this.x * tileWidth}, ${this.y * tileHeight + tileHeight / 2})`;
        } else {
            return `translate(${this.x * tileWidth}, ${this.y * tileHeight})`;
        }
    }
}
