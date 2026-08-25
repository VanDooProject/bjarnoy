import { expect, test } from '@playwright/test';

test('landing page is real marketing copy, not the game canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Fjørdhold')).toBeVisible();
  await expect(page.getByRole('heading', { name: /raise a realm/i })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  await expect(page.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');

  await page.getByRole('button', { name: /enter the world/i }).click();
  await page.waitForURL('**/world');
  await expect(page.locator('canvas')).toBeVisible();
});

test('impressum page is reachable and links back', async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});
