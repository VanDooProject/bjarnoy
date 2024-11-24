import { CommonModule } from '@angular/common';
import { Attribute, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ElementRef } from '@angular/core';

@Component({
    selector: '[app-tile]',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './tile.component.html',
    styleUrl: './tile.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent { 
    @Input() x: number = 0;
    @Input() y: number = 0;
    @Input() size: number = 50;
    @Input() color: string = 'blue';
    @Input() label: string = '';
    
    get transform(): string {
        return `translate(${this.x}, ${this.y})`;
    }
}
