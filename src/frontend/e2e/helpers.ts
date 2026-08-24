import type { Page } from '@playwright/test';

// The world map drifts on its own (zip 4's "already moving" hook) and the
// archipelago is randomly shaped, so no single fixed click reliably lands
// on land — try a small spread of points instead, same as the manual
// smoke-testing this mirrors.
const LANDFALL_SPOTS: Array<[number, number]> = [
  [640, 400],
  [700, 380],
  [580, 420],
  [720, 440],
  [600, 360],
  [660, 460],
  [500, 400],
  [780, 400],
];

/** Clicks around until landfall is made, confirms the nickname prompt, and waits for /settlement. */
export async function foundSettlement(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForTimeout(800);

  for (const [x, y] of LANDFALL_SPOTS) {
    await page.mouse.click(x, y);
    const visible = await page
      .getByText('Landfall made.')
      .isVisible()
      .catch(() => false);
    if (visible) break;
    await page.waitForTimeout(200);
  }

  await page.locator('button.confirm').click();
  await page.waitForURL('**/settlement');
  await page.waitForTimeout(1000); // let the renderer mount and settle
}
