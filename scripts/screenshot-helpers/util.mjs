// Shared helpers for screenshot scripts that mutate WorldModel or
// HexMapRenderer's fogDebugFlags directly (via the demo-mode window hooks
// in src/frontend/src/main.ts) and then need the change to actually render.
//
// HexMapRenderer only rebuilds its terrain/fog/border layers when
// cameraMovedEnough() sees a real camera displacement past its own
// threshold (TILE_W * 0.4, see HexMapRenderer.ts's scheduleCull) — nothing
// else triggers it. A screenshot script that mutates state off-screen (e.g.
// `window.__demoWorld().model.placeBuilding(...)`) and then "nudges" the
// camera by a few pixels to force a redraw can silently do nothing at all:
// an early version of these scripts used a ~4px round-trip drag that never
// crossed the threshold in either direction, so the resulting screenshots
// looked identical to the unmutated state while still reporting success.
// forceRebuild() does a real, large enough drag (150px out, then back) so
// both legs are guaranteed past the threshold regardless of zoom level.
export async function forceRebuild(page, { x = 720, y = 450 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 150, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// Loads `url` and waits for the map to be ready to screenshot — the same
// signal e2e/helpers.ts's waitForMapReady uses (`data-map-ready`, then the
// loading overlay gone). Not `waitUntil: 'networkidle'`: once the map's own
// art is in, the app keeps warming the rest of the atlas in the background
// (atlas.ts's startBackgroundAtlasLoad), so the network can stay busy for a
// long while after the page is ready. Dev-server first loads are slow, hence
// the generous timeout.
export async function gotoMapReady(page, url, { timeout = 120_000 } = {}) {
  await page.goto(url);
  await page.locator('.map-container[data-map-ready]').first().waitFor({ timeout });
  await page.locator('[data-testid="map-status-overlay"]').waitFor({ state: 'detached', timeout });
}
