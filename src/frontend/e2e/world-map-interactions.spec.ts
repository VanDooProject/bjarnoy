import { expect, test } from '@playwright/test';
import { foundSettlement } from './helpers';

// Mirrors settlement-interactions.spec.ts but for the world map: hover
// highlighting and panning both go through the same HexMapRenderer code
// paths (one renderer, one isometric lattice, per the zip 7 mockup's own
// "same hex lattice as the settlement view, flattened"), so both views need
// the same regression coverage.
//
// zip 6a: founding now only ever happens on the landing page — /world
// requires an already-founded settlement (see router/index.ts's guard), so
// every test here founds one first via the shared helper.
test.describe('world map interactions', () => {
  test('world map drifts on its own before any input', async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    await page.goto('/world');
    await page.waitForTimeout(500);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);

    // zip 4: the camera drifts on its own before any interaction — confirm
    // the canvas is actually being redrawn, not a static frame.
    const before = await canvas.screenshot();
    await page.waitForTimeout(1200);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test('hovering an island renders a highlight that follows the cursor', async ({ page }) => {
    test.setTimeout(90_000);
    await foundSettlement(page);
    await page.goto('/world');
    await page.waitForTimeout(800);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    // top-left corner of the canvas is open sea far from any island in the
    // starting view — a reliable "nothing hovered" baseline
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.waitForTimeout(150);
    const idle = await canvas.screenshot();

    // an island is reliably on screen near the centre at the default zoom
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy, { steps: 6 });
    await page.waitForTimeout(150);
    const hoverA = await canvas.screenshot();
    expect(Buffer.compare(idle, hoverA)).not.toBe(0);

    await page.mouse.move(cx + 80, cy + 40, { steps: 6 });
    await page.waitForTimeout(150);
    const hoverB = await canvas.screenshot();
    expect(Buffer.compare(hoverA, hoverB)).not.toBe(0);
  });

  test('panning the world map does not error and moves the camera', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await foundSettlement(page);
    await page.goto('/world');
    await page.waitForTimeout(800);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await canvas.screenshot();

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(cx - i * 30, cy - i * 15);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
    expect(errors).toEqual([]);
  });

  test('zooming with the wheel does not error', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await foundSettlement(page);
    await page.goto('/world');
    await page.waitForTimeout(800);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });
});
