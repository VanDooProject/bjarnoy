import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TileComponent } from '../tile/tile.component';
import { MapService } from '../../services/map.service';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [
        CommonModule,
        TileComponent,
    ],
    templateUrl: './map.component.html',
    styleUrl: './map.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent { 
    tileSize: number = 50;
    mapWidth: number = 500;
    mapHeight: number = 500;

    tiles = [
        { x: 0, y: 0, color: 'red', label: 'A1' },
        { x: 200, y: 0, color: 'green', label: 'A2' },
        { x: 0, y: 100, color: 'blue', label: 'B1' },
        { x: 200, y: 100, color: 'yellow', label: 'B2' },
    ];

    constructor(private mapService : MapService) {
    }
}
