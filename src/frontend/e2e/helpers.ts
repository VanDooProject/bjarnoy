import type { Page } from '@playwright/test';

// The world map drifts on its own (zip 4's "already moving" hook) right up
// until the first click, so the exact camera offset at click-time isn't
// predictable — a handful of fixed points isn't reliable. Instead sweep a
// grid covering most of the viewport: with islands covering a meaningful
// fraction of the screen (see docs/design/img/worldmap.png), a few dozen
// candidates spread across it is overwhelmingly likely to include a hit
// regardless of where the drift left the camera.
function landfallGrid(): Array<[number, number]> {
  const spots: Array<[number, number]> = [];
  for (let x = 120; x <= 1160; x += 80) {
    for (let y = 100; y <= 700; y += 75) {
      spots.push([x, y]);
    }
  }
  return spots;
}

/** Clicks around until landfall is made, confirms the nickname prompt, and waits for /settlement. */
export async function foundSettlement(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForTimeout(500);

  const prompt = page.getByText('Landfall made.');
  const grid = landfallGrid();

  // The map's own default zoom is small enough that a single grid sweep
  // should always land on an island, but drag-and-resweep a couple of times
  // as a fallback in case the (unpredictable, drift-dependent) frozen
  // camera position genuinely put no land in view at all.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await page.mouse.move(640, 400);
      await page.mouse.down();
      await page.mouse.move(640 + 500, 400 + 300, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
    for (const [x, y] of grid) {
      if (await prompt.isVisible().catch(() => false)) break;
      await page.mouse.click(x, y);
    }
    if (await prompt.isVisible().catch(() => false)) break;
  }

  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('button.confirm').click();
  await page.waitForURL('**/settlement');
  await page.waitForTimeout(1000); // let the renderer mount and settle
}
