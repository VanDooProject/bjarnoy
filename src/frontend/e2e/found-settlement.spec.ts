import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

test('clicking an island founds a settlement and opens the village view', async ({ page }) => {
  // foundSettlement() alone — page load plus a real PixiJS/texture mount —
  // has been observed crossing the global 45s default on a loaded CI
  // runner (43.7s one run, 46.0s the next, same code): CI's own run-to-run
  // variance is wider than the margin 45s leaves for this test, even before
  // its own assertions run. See settlement-interactions.spec.ts's matching
  // comments for the other tests that share this same root cause.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.found(page);
  await expect(page).toHaveURL(/\/settlement$/);

  // realm panel: the settlement is real state, not a placeholder screen.
  // Scoped to .realm-panel — TopBar's header also shows the settlement name,
  // so an unscoped text locator matches both and violates Playwright's
  // strict mode.
  const realmPanel = settlement.realmPanel;
  await expect(realmPanel.getByText('Unnamed realm')).toBeVisible();
  await expect(realmPanel.getByText('Lv 1')).toBeVisible();
  await expect(realmPanel.getByText(/Longhouse claims a border-\d+ realm/)).toBeVisible();

  // resource bar: four resources plus the population pill, each a
  // positive, growing number
  const values = page.locator('.resource-bar .resource .value');
  await expect(values).toHaveCount(5);
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
