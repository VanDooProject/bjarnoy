import { expect, test } from '@playwright/test';
import { foundSettlement } from './helpers';

test('landing page is the village view, not a marketing page in front of it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // zip 6a: a real plot of terrain is on screen immediately — no world map,
  // no click-through, no separate marketing page.
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /put your longhouse somewhere/i })).toBeVisible();
  await expect(page.getByText('Longhouse & yard')).toBeVisible();

  // Founding, then the 2 guided onboarding buildings, then the nickname
  // prompt, then the full game — all without ever visiting a world map.
  await foundSettlement(page);
  await expect(page).toHaveURL(/\/settlement$/);
});

test('impressum page is reachable and links back', async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});
