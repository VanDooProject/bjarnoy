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
    
    get transform(): string {
        return `translate(${this.x}, ${this.y})`;
    }
}
