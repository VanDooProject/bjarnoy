import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { claimLandfall, enterSettlementAfterOnboarding, placeGuidedBuildings } from './helpers';
import { waitForMapReady } from './support/render';

// After a deploy an open tab's lazy chunks 404. Entering the settlement used
// to do nothing then; now the tab loads the new build.
test.describe('lazy chunk gone after a deploy', () => {
  test.use({
    expectedConsoleErrors: /Failed to load resource|dynamically imported module|Importing a module script failed/i,
  });

  test('"Enter your settlement" reloads the page instead of silently failing', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/#no-intro');
    await waitForMapReady(page);
    await claimLandfall(page);
    await placeGuidedBuildings(page);

    let mapChunkRequests = 0;
    await page.route('**/assets/MapView-*.js', async (route) => {
      mapChunkRequests++;
      if (mapChunkRequests === 1) await route.fulfill({ status: 404, body: 'gone' });
      else await route.continue();
    });
    await page.evaluate(() => {
      (window as unknown as { __marker: boolean }).__marker = true;
    });

    await enterSettlementAfterOnboarding(page);

    // The marker only disappears with a full page load.
    await page.waitForFunction(() => !(window as unknown as { __marker?: boolean }).__marker);
    // Demo mode keeps its world in memory, so the fresh load starts at the landing page.
    await expect(page.getByRole('heading', { name: /choose where your realm begins/i })).toBeVisible();
    expect(mapChunkRequests).toBe(1);
  });
});
