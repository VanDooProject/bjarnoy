import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-tile',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './tile.component.html',
    styleUrl: './tile.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent { }
