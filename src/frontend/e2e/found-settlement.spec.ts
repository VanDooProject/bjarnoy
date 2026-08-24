import { expect, test } from '@playwright/test';
import { foundSettlement } from './helpers';

test('clicking an island founds a settlement and opens the village view', async ({ page }) => {
  await foundSettlement(page);
  await expect(page).toHaveURL(/\/settlement$/);

  // realm panel: the settlement is real state, not a placeholder screen
  await expect(page.getByText('Unnamed realm')).toBeVisible();
  await expect(page.getByText('Lv 1')).toBeVisible();
  await expect(page.getByText(/Longhouse claims a border-\d+ realm/)).toBeVisible();

  // resource bar: four resources, each a positive, growing number
  const values = page.locator('.resource-bar .resource .value');
  await expect(values).toHaveCount(4);
  for (const text of await values.allTextContents()) {
    expect(Number(text.replace(/[^\d]/g, ''))).toBeGreaterThan(0);
  }
  const rates = page.locator('.resource-bar .resource .rate');
  for (const text of await rates.allTextContents()) {
    expect(text).toMatch(/^\+\d+\/h$/);
  }

  await page.getByRole('button', { name: /World map/ }).click();
  await expect(page).toHaveURL(/\/$/);
});
