import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    // selector - https://github.com/angular/angular/issues/1632
    selector: 'g[app-tile]',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './tile.component.svg',
    styleUrl: './tile.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent { }
