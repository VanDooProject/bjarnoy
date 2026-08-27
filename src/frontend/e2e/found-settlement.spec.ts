import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

test('clicking an island founds a settlement and opens the village view', async ({ page }) => {
  // foundSettlement() alone — page load plus a real PixiJS/texture mount —
  // has been observed crossing the global 45s default on a loaded CI
  // runner (43.7s one run, 46.0s the next, same code): CI's own run-to-run
  // variance is wider than the margin 45s leaves for this test, even before
  // its own assertions run. See settlement-interactions.spec.ts's matching
  // comments for the other tests that share this same root cause.
  test.setTimeout(90_000);
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

  // the realm panel's own back button, not HudNav's identically-labelled
  // debug pill — both go to /world, but this is the in-context control
  await page.getByRole('button', { name: '← World map' }).click();
  await expect(page).toHaveURL(/\/world$/);
});
