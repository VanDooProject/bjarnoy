import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

// DOM state only: water/fog pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false, fog: false } });

/**
 * docs/design/ui-guidelines.md section 10: on a phone a layer shows alone over the plain map. Every HUD element and every
 * layer beneath it is hidden while it is open, and comes back, with its state, when it closes.
 */
test.describe('one layer at a time on a phone', { tag: '@g3' }, () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the open ring hides the top bar, and closing it brings the bar back', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const bar = page.locator('.hud-bar');
    await expect(bar).toBeVisible();

    const target = await settlement.findHex({ terrain: 'grass' });
    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await expect(bar).toBeHidden();

    // A tap on the ring's own backdrop closes it.
    const box = await settlement.canvasBox();
    await page.mouse.click(box.x + 10, box.y + 300);
    await expect(settlement.ring.bubbles).toHaveCount(0);
    await expect(bar).toBeVisible();
  });

  test('the open player menu hides the top bar and stays tappable, and closing it brings the bar back', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    const bar = page.locator('.hud-bar');
    await expect(bar).toBeVisible();

    await page.getByTestId('returning-player-trigger').tap();
    const menu = page.getByTestId('returning-player-menu');
    await expect(menu).toBeVisible();
    await expect(bar).toBeHidden();

    // A tap on the menu's own row still works: Settings opens the settings modal, and the menu closes with it.
    await page.getByTestId('returning-player-settings').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(bar).toBeVisible();

    // Closing without picking (Escape) brings the bar back too.
    await page.getByTestId('returning-player-trigger').tap();
    await expect(bar).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(bar).toBeVisible();
  });

  test('a route modal opened over the training window hides it, and closing the modal brings it back', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);

    // Open the settings modal from the drawer and close it again, so browser history holds a modal entry to go forward to.
    await page.getByTestId('returning-player-trigger').click();
    await page.getByTestId('returning-player-settings').click();
    const routeModal = page.getByRole('dialog');
    await expect(routeModal).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(routeModal).toHaveCount(0);

    // A barracks' ring offers "Train units", which opens the training window over the map.
    await settlement.standBuildings([{ type: 'barracks', level: 1 }]);
    const barracks = await page.evaluate(() => {
      const world = window.__demoWorld() as { model: any; selectedSettlementId: string };
      const s = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(s);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          const at = { q: s.q + dq, r: s.r + dr };
          if (world.model.getTile(at.q, at.r).buildingType === 'barracks') {
            return { hex: at, screen: window.__settlementRenderer().hexCenterScreen(at) };
          }
        }
      }
      throw new Error('no barracks stood');
    });
    await settlement.clickHex(barracks);
    await settlement.ring.waitForOpen();
    await settlement.ring.action('Train units').first().tap();
    const training = page.locator('.backdrop', { has: page.locator('.modal.panel') });
    await expect(training).toBeVisible();

    // The browser's Forward button reopens the settings modal on top of it.
    await page.goForward();
    await expect(routeModal).toBeVisible();
    await expect(training).toBeHidden();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(training).toBeVisible();
  });
});
