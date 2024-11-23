import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-editor-page',
    standalone: true,
    imports: [
        CommonModule,
    ],
    templateUrl: './editorPage.component.html',
    styleUrl: './editorPage.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPageComponent { }
