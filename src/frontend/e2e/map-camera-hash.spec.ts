import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { foundSettlement } from './helpers';
import { waitForMapReady } from './support/render';

type CameraView = { coord: { q: number; r: number }; zoom: number };
const cameraView = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as unknown as { __settlementRenderer: () => { cameraView: CameraView } }).__settlementRenderer().cameraView,
  );

// The settlement view keeps its camera in the URL hash. Demo mode keeps its world in memory, so a
// reload would land on the landing page; leaving the map and opening its link again mounts a
// fresh MapView that reads the same hash a reload would.
test('panning writes the camera into the URL hash and a fresh map view restores it', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await foundSettlement(page);

  const box = (await page.locator('.map-container canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 220, cy - 120, { steps: 8 });
  await page.mouse.up();

  // The hash trails the camera by a debounce: wait until it names where the camera ended up.
  const hashOf = (v: CameraView) => `#q=${v.coord.q}&r=${v.coord.r}&z=${v.zoom.toFixed(2)}`;
  await expect
    .poll(async () => new URL(page.url()).hash === hashOf(await cameraView(page)))
    .toBe(true);
  expect(page.url()).toMatch(/\/settlement#q=-?\d+&r=-?\d+&z=\d+\.\d{2}$/);
  const saved = await cameraView(page);
  const hash = new URL(page.url()).hash;

  await page.locator('.hud-nav > a.link', { hasText: 'Docs' }).click();
  await page.waitForURL('**/docs');
  // Leaving through the router rewrites the history entry's URL without the hash, so open the link
  // the way the router sees a followed one: a history entry for it, then popstate.
  await page.evaluate((h) => {
    history.pushState(history.state, '', `/settlement${h}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, hash);
  await page.waitForURL('**/settlement#q=*');
  await waitForMapReady(page);

  await expect.poll(() => cameraView(page).then((v) => v.coord)).toEqual(saved.coord);
  expect((await cameraView(page)).zoom).toBeCloseTo(saved.zoom, 1);
});

// Regression: MapView's watcher on the displayed route's hash read `route.hash` off the ref `useDisplayedRoute()` returns, which is
// undefined, so a camera anchor arriving while the map was already mounted (a report's "show on map" link behind a modal) never moved it.
test('a camera hash that arrives while the map is mounted moves the camera', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await foundSettlement(page);
  const before = await cameraView(page);
  const target = { q: before.coord.q + 4, r: before.coord.r - 3 };

  await page.evaluate(
    ({ q, r, z }) => {
      window.location.hash = `q=${q}&r=${r}&z=${z}`;
    },
    { ...target, z: before.zoom },
  );

  await expect.poll(() => cameraView(page).then((v) => v.coord)).toEqual(target);
});

test('an invalid camera hash is ignored', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await foundSettlement(page);
  const before = await cameraView(page);
  await page.evaluate(() => {
    window.location.hash = 'q=abc&r=1&z=2';
  });
  await page.waitForTimeout(500);
  expect(await cameraView(page)).toEqual(before);
});
