import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-landing-page',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './landingPage.component.html',
    styleUrl: './landingPage.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent { }
