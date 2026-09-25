import { expect, test } from './fixtures';
import { ScrollableView } from './pages';

/**
 * `/showcase` — the public marketing/portfolio page. It mounts two real
 * `HexMapRenderer` canvases (the hero WorldMapCanvas and the "one view"
 * SettlementCanvas), so this reuses the same `data-map-ready` signal every
 * other map spec waits on (`waitForMapReady` in helpers.ts) — just for two
 * containers instead of one, since that helper only waits for the first.
 *
 * No auth/founding needed: the page is public and builds its own
 * standalone, backend-free `WorldModel`s rather than reading player state.
 */

async function waitForBothMapsReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('.map-container[data-map-ready]')).toHaveCount(2, { timeout: 15_000 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
  );
}

test.describe('showcase page', { tag: '@g2' }, () => {
  test('renders the hero and both map frames become ready', async ({ page }) => {
    await page.goto('/showcase');

    await expect(page.locator('#hero h1')).toHaveText('Bjarnoy');
    await waitForBothMapsReady(page);

    await expect(page.locator('#one-view')).toBeVisible();
    await expect(page.locator('#features')).toBeVisible();
    await expect(page.locator('#engineering')).toBeVisible();
  });

  test('"Play now" navigates to the landing page', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    await page.getByRole('button', { name: 'Play now' }).first().click();
    await expect(page).toHaveURL('/');
  });

  test('re-rolling the world changes the seed and the map becomes ready again', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const seedText = page.locator('.seed');
    const before = await seedText.textContent();

    await page.getByRole('button', { name: 'New world' }).click();
    await expect(seedText).not.toHaveText(before ?? '');
    await waitForBothMapsReady(page);
  });

  test('at a narrow viewport there is no horizontal overflow and the page scrolls past the maps', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const view = new ScrollableView(page, '.showcase');
    expect(await view.noHorizontalOverflow()).toBe(true);

    const engineering = page.locator('#engineering');
    await expect(engineering).not.toBeInViewport();
    // Wheel with the pointer over the hero map on purpose: the renderer
    // cancels every wheel event over its canvas (HexMapRenderer.onWheel), so
    // until the visitor opts in via "Explore the map" the frame has to stay
    // pointer-transparent or the page would be unscrollable past it.
    await page.locator('#hero .map-frame').hover();
    await page.mouse.wheel(0, 100_000);
    await expect(engineering).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test('opting in to explore hands the wheel to the map instead of the page', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const view = new ScrollableView(page, '.showcase');
    await page.getByRole('button', { name: 'Explore the map' }).click();
    await page.locator('#hero .map-frame').hover();
    await page.mouse.wheel(0, 400);
    // Give a would-be page scroll a frame to land before asserting it didn't.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(await view.scrollTop()).toBe(0);

    await page.getByRole('button', { name: 'Done exploring' }).click();
    await page.locator('#hero .map-frame').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => view.scrollTop()).toBeGreaterThan(0);
  });
});
