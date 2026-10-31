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

type HeroHook = {
  renderer: {
    hexCenterScreen(c: { q: number; r: number }): { x: number; y: number };
    cameraZoom: number;
  };
  frame: { center: { q: number; r: number }; radius: number };
};
declare global {
  interface Window {
    __showcaseHero: () => HeroHook;
  }
}

/** Where the capped area's centre hex sits relative to the hero canvas centre, in screen px. */
async function heroCapCenterOffset(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const { renderer, frame } = window.__showcaseHero();
    const at = renderer.hexCenterScreen(frame.center);
    const box = document.querySelector('#hero .map-container canvas')!.getBoundingClientRect();
    return { x: at.x - box.width / 2, y: at.y - box.height / 2 };
  });
}

/** The farthest the cap centre can sit from the canvas centre: the camera centre may reach the disc's bounding box, which is as wide/tall as the disc's extreme hexes. */
async function heroCapHalfExtent(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const { renderer, frame } = window.__showcaseHero();
    const mid = renderer.hexCenterScreen(frame.center);
    const east = renderer.hexCenterScreen({ q: frame.center.q + frame.radius, r: frame.center.r });
    const south = renderer.hexCenterScreen({ q: frame.center.q, r: frame.center.r + frame.radius });
    // q+radius moves right and down, r+radius straight down (hex columns), so the box is as tall as the r run.
    return { x: Math.abs(east.x - mid.x), y: Math.abs(south.y - mid.y) };
  });
}

async function heroZoom(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__showcaseHero().renderer.cameraZoom);
}

async function dragHero(page: import('@playwright/test').Page, dx: number, dy: number): Promise<void> {
  const frame = page.locator('#hero .map-frame');
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  if (!box) throw new Error('hero map frame has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
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
    // Wheel with the pointer over the hero map on purpose: it passes `allow-page-scroll`,
    // so the renderer leaves a plain wheel to the page.
    await page.locator('#hero .map-frame').hover();
    await page.mouse.wheel(0, 100_000);
    await expect(engineering).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test('the hero map is interactive from the start: no explore button, a drag moves the camera', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    await expect(page.locator('#hero .map-frame').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /explore/i })).toHaveCount(0);

    const before = await heroCapCenterOffset(page);
    await dragHero(page, 80, 40);
    const after = await heroCapCenterOffset(page);
    // The camera moved with the drag: the cap centre slid across the screen by about the drag distance.
    expect(after.x - before.x).toBeGreaterThan(40);
  });

  test('panning stops at the cap: dragging far leaves the camera inside the capped area', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const limit = await heroCapHalfExtent(page);
    for (const [dx, dy] of [
      [3000, 0],
      [-6000, 0],
      [0, 3000],
      [0, -6000],
    ] as const) {
      await dragHero(page, dx, dy);
      const offset = await heroCapCenterOffset(page);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(limit.x + 8);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(limit.y + 8);
    }
    // Dragging the same way again does not move it: the camera sits on the bound, not short of it.
    const stuck = await heroCapCenterOffset(page);
    await dragHero(page, 0, -3000);
    const again = await heroCapCenterOffset(page);
    expect(again.x).toBeCloseTo(stuck.x, 0);
    expect(again.y).toBeCloseTo(stuck.y, 0);
    // And the camera was really on the bound, not stuck at the start.
    expect(Math.abs(stuck.y)).toBeGreaterThan(limit.y - 8);
  });

  test('the wheel over the hero map scrolls the page and does not zoom the map', async ({ page }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const view = new ScrollableView(page, '.showcase');
    const zoomBefore = await heroZoom(page);
    await page.locator('#hero .map-frame').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => view.scrollTop()).toBeGreaterThan(0);
    expect(await heroZoom(page)).toBe(zoomBefore);
  });

  test('the village frame is always explorable: no opt-in button, the wheel and drag go to the map', async ({
    page,
  }) => {
    await page.goto('/showcase');
    await waitForBothMapsReady(page);

    const frame = page.locator('#one-view .one-view-frame');
    await expect(frame.getByRole('button')).toHaveCount(0);

    const view = new ScrollableView(page, '.showcase');
    await frame.hover(); // scrolls the frame into view first
    const before = await view.scrollTop();
    await page.mouse.wheel(0, 400);
    const box = await frame.boundingBox();
    if (!box) throw new Error('village frame has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 2000, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    // Give a would-be page scroll a frame to land before asserting it didn't.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(await view.scrollTop()).toBe(before);
  });
});
