import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage, SettlementPage } from './pages';
import { doubleTap } from './helpers';

// The map canvases suppress the browser's own double-tap zoom (touch-action:
// none + touchstart preventDefault, which pinch needs), so the renderer
// recognises a double tap itself (src/lib/map/doubleTap.ts) and zooms 2x
// around it through the same zoomBy() seam as wheel and pinch. Real touch
// events via CDP (helpers.ts's `doubleTap`), since it keys on pointerType 'touch'.
async function cameraZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const win = window as unknown as { __settlementRenderer?: () => { cameraZoom: number } };
    return win.__settlementRenderer!().cameraZoom;
  });
}

test.describe('double tap to zoom on touch', { tag: '@g3' }, () => {
  test.use({ hasTouch: true });

  test('a double tap on the world map zooms in', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const centre = await world.centre();
    const zoomBefore = await cameraZoom(page);

    await doubleTap(page, centre);

    await expect.poll(() => cameraZoom(page)).toBeCloseTo(zoomBefore * 2, 2);
  });

  test('a double tap in the settlement zooms in without opening the ring menu', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const box = await settlement.canvasBox();
    const zoomBefore = await cameraZoom(page);

    await doubleTap(page, { x: box.x + target.screen.x, y: box.y + target.screen.y });

    await expect.poll(() => cameraZoom(page)).toBeGreaterThan(zoomBefore * 1.5);
    // Past the single-tap hold: neither tap may have reached the tile.
    await page.waitForTimeout(500);
    await expect(settlement.ring.backdrop).toHaveCount(0);
  });
});
