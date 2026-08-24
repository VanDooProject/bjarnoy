import { expect, test } from '@playwright/test';

test('landing shows the world map already moving, no sign-up wall', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Fjørdhold')).toBeVisible();
  await expect(page.getByText(/already moving/)).toBeVisible();
  await expect(page.getByText(/Click any green island/)).toBeVisible();
  await expect(page.getByText(/no sign-up needed yet/)).toBeVisible();

  // the PixiJS canvas mounted and has a real size, not a 0x0 placeholder
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
