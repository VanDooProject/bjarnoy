import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * The settlement name badge gives way: it fades out while the mouse is over it (so the hex under it can be read) and comes back
 * when the mouse leaves, and it is hidden while the building HUD markers are shown. The decision is unit-tested
 * (markerOcclusion.test.ts); this is the wiring from the real mouse and the HUD toggle to the badge in the label overlay.
 */
// DOM and game state only: water and fog pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({ mapLayers: { water: false, fog: false } });

test.describe('settlement badge', { tag: '@g2' }, () => {
  test('fades out under the mouse, returns when it leaves, and hides while building info is on', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const { hud } = settlement;
    const settlementId = await page.evaluate(() => (window.__demoWorld() as { selectedSettlementId: string }).selectedSettlementId);
    const badge = page.locator(`[data-map-label="badge:${settlementId}"]`);
    // Hidden (visibility) counts as 0: the overlay hides a badge once its fade has run out.
    const badgeAlpha = async () => {
      if (!(await badge.isVisible())) return 0;
      return Number(await badge.evaluate((el) => getComputedStyle(el).opacity));
    };

    // Building info starts off: the badge shows.
    await expect.poll(badgeAlpha).toBe(1);

    const box = (await badge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(badgeAlpha).toBe(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 120);
    await expect.poll(badgeAlpha).toBe(1);

    // Building info on (levels and details, or levels only) covers the settlement: no badge.
    await hud.switchTo('full');
    await expect.poll(badgeAlpha).toBe(0);
    await hud.switchTo('levels');
    await expect.poll(badgeAlpha).toBe(0);
    await hud.switchTo('off');
    await expect.poll(badgeAlpha).toBe(1);
  });
});
