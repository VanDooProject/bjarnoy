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
    constructor(private mapService : MapService) {
    }
}
