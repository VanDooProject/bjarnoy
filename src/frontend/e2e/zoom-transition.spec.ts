import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage } from './pages';
import { clickHudMenuEntry, gotoWorldMap } from './helpers';
import { waitForMapReady } from './support/render';
import { DEFAULT_ENTER_SETTLEMENT_ZOOM } from '../src/lib/map/zoomTransition';

// docs/design/zoom-transition.md: a wheel/pinch zoom crossing a threshold
// switches world<->settlement mode in place — one persistent HexMapRenderer
// (MapView.vue serves both on `/settlement`, world mode as `#world`), not a route-driven
// remount, so the camera never snaps and fog never flashes. These specs
// exercise that against the real app (the zoom-transition debug panel's
// tuning, ?debug=1) rather than only the pure transitionForZoom() unit
// tests, which can't see the renderer/route/camera actually agreeing.
//
// Demo mode never persists `hasFoundedSettlement` across a hard reload
// (player.ts's own remarks — its WorldModel is pure in-memory) — every
// navigation here that needs to stay founded uses a real client-side click
// (HudNav), never `page.goto`, for the same reason gotoWorldMap now does
// (see helpers.ts).
async function cameraZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const win = window as unknown as { __settlementRenderer?: () => { cameraZoom: number } };
    return win.__settlementRenderer!().cameraZoom;
  });
}

async function clickNav(page: Page, label: string): Promise<void> {
  await page.locator('.hud-nav a.link', { hasText: label }).click();
}

test.describe('zoom-driven world/settlement transition', { tag: '@g3' }, () => {
  test('zooming in on the world map crosses the enter threshold into settlement view, and back out again', async ({
    page,
  }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    await world.moveTo(await world.centre());

    await expect(page).toHaveURL(/\/settlement#world(&.*)?$/);
    const zoomBefore = await cameraZoom(page);

    // Zoom in until the enter-settlement threshold is crossed (the shipped
    // default is 0.5 — see zoomTransition.ts's DEFAULT_ENTER_SETTLEMENT_ZOOM).
    // Bounded loop rather than a fixed step count: this only needs to prove
    // the transition fires on a real sustained gesture, not pin the exact
    // number of wheel events it takes.
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(15);
      if (!page.url().includes('#world')) break;
    }
    await expect(page).toHaveURL(/\/settlement(#q=[^#]*)?$/, { timeout: 10_000 });

    // Continuity: the camera crossed the threshold mid-gesture, not via a
    // reset — it should be somewhere past where it started, not snapped to
    // the settlement's own default framing.
    const zoomAfterIn = await cameraZoom(page);
    expect(zoomAfterIn).toBeGreaterThan(zoomBefore);

    // The settlement's own HUD should be live (ring-menu-capable view, not
    // just the URL) — confirms setMode actually swapped rendering, not just
    // that a route push happened to fire.
    await expect(page.locator('.hud-scrim')).toBeVisible();

    // Zoom back out past the exit-to-world threshold (default 0.4).
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(15);
      if (page.url().includes('#world')) break;
    }
    await expect(page).toHaveURL(/\/settlement#world(&.*)?$/, { timeout: 10_000 });

    const zoomAfterOut = await cameraZoom(page);
    expect(zoomAfterOut).toBeLessThan(zoomAfterIn);
  });

  test('the zoom-transition debug panel reflects and can tune the live thresholds', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);

    // Same-document query-string change (Vue Router reacts to it without a
    // reload) — a hard `page.goto('...?debug=1')` would reload and lose the
    // founded-settlement state, same reason gotoWorldMap avoids it.
    await page.evaluate(() => {
      history.replaceState(history.state, '', location.pathname + '?debug=1' + location.hash);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await world.moveTo(await world.centre());

    const panel = page.locator('.zoom-debug');
    await expect(panel).toBeVisible();
    const enabledCheckbox = panel.getByText('Zoom-driven transition enabled');
    await expect(enabledCheckbox).toBeVisible();

    // Turn the whole feature off from the panel (on by default —
    // zoomTransitionTuning.enabled), then confirm a zoom-in gesture that
    // would otherwise cross the enter threshold does nothing — checks that
    // the checkbox actually reaches the live tuning object, not just that
    // the panel renders.
    await panel.locator('input[type="checkbox"]').uncheck();

    // uncheck() leaves the pointer parked over the checkbox in the debug
    // panel — every wheel event below would scroll the panel instead of
    // reaching the canvas (and the loop below would spin its full budget
    // without the camera ever moving) unless the pointer is put back over
    // the map first.
    await world.moveTo(await world.centre());

    // Bounded by "clearly crossed the enter threshold" rather than a fixed
    // count of 60: on a bigger/slower-to-render world (see this PR's world
    // generation change) each wheel event costs a full render frame, so a
    // fixed large count risks the heavy-spec timeout for no extra signal —
    // once the zoom is well past where the (enabled) transition would have
    // fired, further wheeling proves nothing new.
    for (let i = 0; i < 20; i++) {
      if ((await cameraZoom(page)) > DEFAULT_ENTER_SETTLEMENT_ZOOM * 1.2) break;
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(15);
    }
    await page.waitForTimeout(300);

    // The gesture actually reached the canvas and crossed the threshold the
    // (enabled) transition would react to...
    expect(await cameraZoom(page)).toBeGreaterThan(DEFAULT_ENTER_SETTLEMENT_ZOOM);
    // ...and yet, with the panel's checkbox unchecked, no transition fired.
    await expect(page).toHaveURL(/\/settlement\?debug=1#world(&.*)?$/);
  });

  test('opening Reports from the world map keeps the world map behind the modal', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const rendererMode = () =>
      page.evaluate(() => {
        // `options` is private in TS; read at runtime only, as a test probe.
        const win = window as unknown as { __settlementRenderer?: () => { options: { mode: string } } };
        return win.__settlementRenderer!().options.mode;
      });
    expect(await rendererMode()).toBe('world');

    await clickHudMenuEntry(page, 'Reports');
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByTestId('reports-modal')).toBeVisible();
    // Give a wrong mode switch the frames it would need to happen.
    await page.waitForTimeout(500);
    expect(await rendererMode()).toBe('world');
    await expect(world.canvas).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/settlement#world(&.*)?$/);
    expect(await rendererMode()).toBe('world');
  });

  test('leaving both map routes tears down the renderer instead of leaking a second canvas', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    await expect(world.canvas).toHaveCount(1);

    await clickNav(page, 'Settlement');
    await expect(page).toHaveURL(/\/settlement(#q=[^#]*)?$/);
    await waitForMapReady(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    await gotoWorldMap(page);
    await expect(page.locator('canvas')).toHaveCount(1);

    // Navigate away from both map routes entirely — the renderer must tear
    // down, not just sit hidden (see useHexMapRenderer's onBeforeUnmount).
    // Docs, not a modal route (reports/leaderboards/guild/profile): those
    // open over the map and deliberately keep it mounted underneath.
    await clickHudMenuEntry(page, 'Docs');
    await expect(page).toHaveURL(/\/docs/);
    await page.waitForTimeout(300);
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
