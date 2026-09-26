import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage } from './pages';
import { RingMenuComponent } from './pages/RingMenuComponent';

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
 *
 * Issue: mobile army dispatch (decision 2) — a plain world-map tap no
 * longer navigates to `/settlement` at all, on any viewport. Zoom (wheel or
 * pinch) is now the only way in; a tap with no draft in progress opens the
 * same ring menu the settlement view uses instead, so a fleet's target
 * (open water the settlement view never shows) can be picked by tapping it.
 * The second test below used to assert the old click-to-enter behaviour;
 * it now asserts the ring opens and the URL stays on `/world`.
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

  test('a click with no dispatch in progress opens the ring instead of entering the settlement', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const centre = await world.centre();
    const ring = new RingMenuComponent(page);

    await page.mouse.click(centre.x, centre.y);

    // Stayed on the world map — zoom is the only way into /settlement now.
    await expect(page).toHaveURL(/\/world$/);
    await expect(ring.bubbles.first()).toBeVisible();
    await expect(ring.action('Send army here')).toBeVisible();
    await expect(ring.bubbles).toHaveCount(1);
  });
});
