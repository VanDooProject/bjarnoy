import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapComponent } from '../../../components/map/map.component';

@Component({
    selector: 'app-game-page',
    standalone: true,
    imports: [
        CommonModule,
        MapComponent,
    ],
    templateUrl: './gamePage.component.html',
    styleUrl: './gamePage.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePageComponent { }
