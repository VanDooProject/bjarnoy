import { Routes } from '@angular/router';
import { LandingPageComponent } from '../pages/components/landingPage/landingPage.component';
import { GamePageComponent } from '../pages/components/gamePage/gamePage.component';
import { EditorPageComponent } from '../pages/components/editorPage/editorPage.component';

export const routes: Routes = [
    {
      path: '',
      title: 'Landing Page',
      component: LandingPageComponent,
    },
    {
      path: 'game',
      title: 'Game Screen',
      component: GamePageComponent,
    },
    {
      path: 'editor',
      title: 'Map Editor',
      component: EditorPageComponent,
    },
];
