import { test } from '../fixtures';
import { DocsPage, LandingPage } from '../pages';
import { expectScreen, freezeClock } from './screen';

test.use({ mapLayers: { water: false, fog: false }, mapMotion: { hud: 'off' } });

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test('landing', async ({ page }) => {
  await LandingPage.open(page);
  await expectScreen(page, 'landing');
});

test('docs-hub', async ({ page }) => {
  await DocsPage.openHub(page);
  await expectScreen(page, 'docs-hub');
});
