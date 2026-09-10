import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage } from './pages';

/**
 * docs/design/ship-movement.md §5: a fleet's waypoints/orders must work at
 * world zoom, not just settlement zoom — a ship's whole journey happens on
 * open water the settlement view never renders, so routing it can't require
 * a detour through `/settlement`.
 *
 * Before this, `MapView.onHexClick`'s world-mode branch (`router.push('/settlement')`)
 * ran unconditionally, ahead of the dispatch-draft check — so a click while
 * composing a dispatch at world zoom navigated away instead of plotting a
 * waypoint. This is the regression guard for reordering those two checks.
 *
 * Same store-driven seeding + `__settlementRenderer().hexCenterScreen()`
 * click-point pattern as army-overlay.spec.ts (that file's own docstring
 * explains why: the overlay lives inside a WebGL canvas).
 */

type FleetOrdersWindow = Window & {
  __demoWorld: () => { model: any; selectedSettlementId: string; dispatchDraft: { route: { q: number; r: number }[] } | null; startDispatch: () => void };
  __settlementRenderer: () => {
    hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
  };
};

test.describe('fleet orders on the world map', { tag: '@g3' }, () => {
  test('a click while composing a dispatch plots a waypoint instead of navigating to /settlement', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const box = await world.box();

    const target = await page.evaluate(() => {
      const store = (window as unknown as FleetOrdersWindow).__demoWorld();
      const settlement = store.model.getSettlement(store.selectedSettlementId);
      const at = { q: settlement.q + 2, r: settlement.r };
      store.startDispatch();
      const screen = (window as unknown as FleetOrdersWindow).__settlementRenderer().hexCenterScreen(at);
      return { at, screen };
    });

    await page.mouse.click(box.x + target.screen.x, box.y + target.screen.y);

    // Stayed on the world map — a plain click-to-enter would have navigated
    // to /settlement instead.
    await expect(page).toHaveURL(/\/world$/);

    const route = await page.evaluate(
      () => (window as unknown as FleetOrdersWindow).__demoWorld().dispatchDraft?.route,
    );
    expect(route).toEqual([target.at]);
  });

  test('a click with no dispatch in progress still enters the settlement as before', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const centre = await world.centre();

    await page.mouse.click(centre.x, centre.y);

    await expect(page).toHaveURL(/\/settlement$/);
  });
});
