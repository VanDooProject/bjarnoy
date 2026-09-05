import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { WorldMapPage } from './pages';

// Mirrors settlement-interactions.spec.ts but for the world map: hover
// highlighting and panning both go through the same HexMapRenderer code
// paths (one renderer, one isometric lattice, per the zip 7 mockup's own
// "same hex lattice as the settlement view, flattened"), so both views need
// the same regression coverage.
//
// zip 6a: founding now only ever happens on the landing page — /world
// requires an already-founded settlement (see router/index.ts's guard), so
// every test here founds one first via `WorldMapPage.open()`, then still has
// to pan/zoom/hover through a second real render. 120s (not the 90s these
// used before founding was added to them) matches settlement-interactions
// .spec's own panning test — the same "found a settlement, then drive real
// interaction through a render" shape that's been observed needing the
// extra headroom under this suite's software-rendered headless Chromium.
test.describe('world map interactions', () => {
  test('world map drifts on its own before any input', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);

    await expect(world.canvas).toBeVisible();
    const box = await world.box();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);

    // zip 4: the camera drifts on its own before any interaction — confirm
    // the canvas is actually being redrawn, not a static frame. Poll for the
    // diff instead of sleeping a fixed 1200ms then checking once: on a slow
    // CI runner the drift may simply need longer than that to become
    // visible, and polling finds it as soon as it happens on a fast one too.
    const before = await world.screenshot();
    await expect.poll(async () => Buffer.compare(before, await world.screenshot()), { timeout: 10_000 }).not.toBe(
      0,
    );
  });

  test('hovering an island renders a highlight that follows the cursor', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);

    // top-left corner of the canvas is open sea far from any island in the
    // starting view — a reliable "nothing hovered" baseline. World mode has
    // no DOM tooltip to wait on (unlike settlement mode's `.hex-tooltip`),
    // so poll the canvas itself for the pixel diff that hovering causes,
    // rather than sleeping a guessed frame duration.
    await world.moveTo(await world.pointAt(10, 10));
    const idle = await world.screenshot();

    // an island is reliably on screen near the centre at the default zoom
    const { x: cx, y: cy } = await world.centre();
    await world.moveTo({ x: cx, y: cy }, { steps: 6 });
    let hoverA!: Buffer;
    await expect
      .poll(
        async () => {
          hoverA = await world.screenshot();
          return Buffer.compare(idle, hoverA);
        },
        { timeout: 5_000 },
      )
      .not.toBe(0);

    await world.moveTo({ x: cx + 80, y: cy + 40 }, { steps: 6 });
    await expect
      .poll(async () => Buffer.compare(hoverA, await world.screenshot()), { timeout: 5_000 })
      .not.toBe(0);
  });

  test('panning the world map does not error and moves the camera', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const { x: cx, y: cy } = await world.centre();

    const before = await world.screenshot();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(cx - i * 30, cy - i * 15);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();

    await expect.poll(async () => Buffer.compare(before, await world.screenshot()), { timeout: 5_000 }).not.toBe(0);
  });

  test('zooming with the wheel does not error', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);

    await world.moveTo(await world.centre());
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(20);
    }
    // Let the last zoom step's frame(s) actually render before the test
    // ends — the fixture's autouse forbidConsoleErrors check only sees
    // errors that fired before teardown, and a rendering error from the
    // final wheel event could otherwise land after this test has already
    // passed.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
    );
  });
});
