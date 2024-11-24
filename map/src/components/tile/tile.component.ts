import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    // selector - https://github.com/angular/angular/issues/1632
    // https://stackoverflow.com/questions/58927837/can-we-render-angular-components-inside-of-our-svg-templates
    selector: 'g[app-tile]',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './tile.component.svg',
    styleUrl: './tile.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent {

}
