import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS, MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage, SettlementPage } from './pages';
import { pinch, touchDrag } from './helpers';

// docs/design/zoom-transition.md §9.2: two-finger pinch zooms (and pans) the
// map on touch, through the exact same zoomBy() seam mouse-wheel zoom always
// used — so it also drives the world<->settlement transition, exactly like a
// wheel gesture does. These specs drive a real multi-touch-point gesture via
// CDP (see helpers.ts's `pinch`), not a synthetic dispatchEvent, since the
// renderer's pinch handling is keyed on genuinely distinct pointerIds
// reaching the canvas.
async function cameraZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const win = window as unknown as { __settlementRenderer?: () => { cameraZoom: number } };
    return win.__settlementRenderer!().cameraZoom;
  });
}

async function cameraView(page: Page): Promise<{ coord: { q: number; r: number }; zoom: number }> {
  return page.evaluate(() => {
    const win = window as unknown as { __settlementRenderer?: () => { cameraView: { coord: { q: number; r: number }; zoom: number } } };
    return win.__settlementRenderer!().cameraView;
  });
}

test.describe('pinch-to-zoom on touch', { tag: '@g3' }, () => {
  test.use({ hasTouch: true });

  test('spreading two fingers zooms in, closing them zooms back out', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const centre = await world.centre();
    const zoomBefore = await cameraZoom(page);

    await pinch(page, centre, 60, 220);
    const zoomAfterSpread = await cameraZoom(page);
    expect(zoomAfterSpread).toBeGreaterThan(zoomBefore);

    await pinch(page, centre, 220, 60);
    const zoomAfterClose = await cameraZoom(page);
    expect(zoomAfterClose).toBeLessThan(zoomAfterSpread);
  });

  test('a pinch that spreads far enough crosses into settlement view', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const centre = await world.centre();

    await expect(page).toHaveURL(/\/settlement#world$/);
    // Bounded loop rather than a fixed gap: this only needs to prove the
    // transition fires on a sustained pinch gesture, not pin the exact gap
    // it takes to cross DEFAULT_ENTER_SETTLEMENT_ZOOM.
    let gap = 40;
    for (let i = 0; i < 8; i++) {
      const nextGap = gap * 1.8;
      await pinch(page, centre, gap, nextGap, 4);
      gap = nextGap;
      if (!page.url().includes('#world')) break;
    }
    await expect(page).toHaveURL(/\/settlement(#q=[^#]*)?$/, { timeout: 10_000 });
  });

  test('a pinch never opens the ring menu, even one that ends within click-slop distance', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const box = await settlement.canvasBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Spreads out and back to almost the same gap it started at — a pinch
    // whose net camera pan/zoom is tiny, the case most likely to slip past
    // the click-slop check and accidentally open a ring on the hex beneath.
    await pinch(page, centre, 80, 160, 6);
    await pinch(page, centre, 160, 84, 6);

    await expect(settlement.ring.bubbles).toHaveCount(0);
  });

  test('the landing page preview ignores pinch (lockCamera)', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    const box = await settlement.canvasBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const zoomBefore = await cameraZoom(page);

    await pinch(page, centre, 60, 220);

    expect(await cameraZoom(page)).toBe(zoomBefore);
  });

  test('a single-finger touch drag still pans the world map', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const before = await world.screenshot();

    const centre = await world.centre();
    const viewBefore = await cameraView(page);
    await touchDrag(page, centre, { x: centre.x - 150, y: centre.y - 80 });

    // The drag reached the renderer and moved the camera — checked apart from
    // the pixels so a failure says whether the input was dropped or the move
    // was never drawn (`screenshot()` waits for a rendered frame).
    expect(await cameraView(page)).not.toEqual(viewBefore);
    const after = await world.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});
