import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ElementRef } from '@angular/core';

@Component({
    selector: '[app-tile]',
    standalone: true,
    imports: [
        CommonModule,
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
    @Input() src: string = '';
    //href: string = '';

    constructor() {
        // src = ./images/hextiles/foresttile_W.png
        //this.href = `./images/hextiles/${this.src}`;
    }

    get href(): string {
        return `./images/hextiles/${this.src}`;
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
