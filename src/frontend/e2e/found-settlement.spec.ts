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
  await SettlementPage.found(page);
  await expect(page).toHaveURL(/\/settlement$/);

  // resource bar: the settlement is real state, not a placeholder screen —
  // four resources plus the population pill, each a positive, growing
  // number. RealmPanel (a bottom-left level/hexes readout + a manual
  // "← World map" button) used to also assert this, but it's gone now that
  // zoom drives settlement<->world switching and the manual override was
  // redundant (see docs/design/zoom-transition.md) — this check alone
  // already covers "real state, not a placeholder".
  const values = page.locator('.resource-bar .resource .value');
  await expect(values).toHaveCount(5);
  for (const text of await values.allTextContents()) {
    expect(Number(text.replace(/[^\d]/g, ''))).toBeGreaterThan(0);
  }
  const rates = page.locator('.resource-bar .resource .rate');
  for (const text of await rates.allTextContents()) {
    expect(text).toMatch(/^\+\d+\/h$/);
  }
});
