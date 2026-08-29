import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Demo-mode trade flow (PR 2): post an offer, see it land in "My offers",
 * then accept the canned rival offer WorldModel seeds at construction (see
 * `WorldModel`'s constructor / `DEMO_RIVAL_SETTLEMENT_ID`) from "Open
 * offers" and confirm it settles synchronously (no travel time in demo
 * mode — see `WorldModel.acceptTradeOffer`'s doc comment).
 */
test('posting and accepting a trade offer updates the board and resources', async ({ page }) => {
  // Same rationale as found-settlement.spec.ts: founding a settlement is a
  // real page load plus a PixiJS mount, which alone can approach the
  // global 45s default on a loaded CI runner.
  test.setTimeout(90_000);
  await foundSettlement(page);

  const toggle = page.locator('.trade-toggle');
  await toggle.click();

  const panel = page.locator('.trade-panel');
  await expect(panel).toBeVisible();

  const sections = panel.locator('.trade-section');
  const postSection = sections.nth(0);
  const openSection = sections.nth(1);
  const mySection = sections.nth(2);

  // The seeded rival offer ("Ravenshold": 50 wood for 25 iron) should
  // already be on the board before this settlement posts anything.
  const rivalRow = openSection.locator('.trade-row', { hasText: 'Iron' });
  await expect(rivalRow).toBeVisible();
  await expect(rivalRow.getByText('50 Wood')).toBeVisible();
  await expect(rivalRow.getByText('25 Iron')).toBeVisible();

  // Post an offer that doesn't touch iron, so the resource assertions after
  // accepting the rival offer aren't muddied by this settlement's own post.
  await postSection.locator('select.trade-select').nth(0).selectOption('wood');
  await postSection.locator('input.trade-amount').nth(0).fill('100');
  await postSection.locator('select.trade-select').nth(1).selectOption('stone');
  await postSection.locator('input.trade-amount').nth(1).fill('50');
  await postSection.locator('button.trade-submit').click();

  // "My offers": the posted offer shows up, open, with no rejection banner.
  await expect(panel.locator('.trade-error')).toHaveCount(0);
  const myRow = mySection.locator('.trade-row', { hasText: 'Stone' });
  await expect(myRow).toBeVisible();
  await expect(myRow.getByText('100 Wood')).toBeVisible();
  await expect(myRow.getByText('50 Stone')).toBeVisible();
  await expect(myRow.getByText('open')).toBeVisible();

  const before = await page.evaluate(
    () => (window as unknown as { __demoWorld: () => { hud: { resources: { wood: number; iron: number } } } })
      .__demoWorld().hud.resources,
  );

  await rivalRow.getByRole('button', { name: 'Accept' }).click();

  // Demo-mode acceptance settles synchronously: the rival offer is no
  // longer 'open', so it drops out of the board immediately.
  await expect(openSection.locator('.trade-row', { hasText: 'Iron' })).toHaveCount(0);
  await expect(panel.locator('.trade-error')).toHaveCount(0);

  const after = await page.evaluate(
    () => (window as unknown as { __demoWorld: () => { hud: { resources: { wood: number; iron: number } } } })
      .__demoWorld().hud.resources,
  );
  // Accepting "50 wood for 25 iron" credits 50 wood and debits 25 iron.
  // Generous tolerance for the small amount of natural resource accrual
  // that happens between the two reads (production rates keep ticking).
  expect(after.wood).toBeGreaterThan(before.wood + 45);
  expect(after.iron).toBeLessThan(before.iron - 20);
});
