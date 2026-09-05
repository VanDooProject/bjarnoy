import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

test('landing page is the village view, not a marketing page in front of it', { tag: '@g3' }, async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
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

test('onboarding build step offers a ring menu with the tile-appropriate guided building enabled and everything else disabled', { tag: '@g3' }, async ({ page }) => {
  // Regression coverage: the onboarding build step used to pop a
  // BuildingModal with a single "Build here" button hardcoded to a type
  // ('farm') that fails outside grass terrain — "can't actually select the
  // correct building". It now opens the same kind of RingMenu the full
  // settlement view uses, simplified to one flat ring (no build-category
  // drill-down): only the guided type matching the *clicked tile's own
  // terrain* is enabled (Farm needs grass, Lumberjack needs forest) —
  // enabling both regardless of terrain would just reintroduce the same
  // silent-failure bug for whichever one doesn't fit.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  // A guessed pixel offset only happens to land on a real hex at one
  // particular zoom/camera framing — ask the model for a real empty *grass*
  // hex inside the just-founded realm (deterministically exercising Farm's
  // own terrain requirement), then the renderer's own camera math
  // (__settlementRenderer's hexCenterScreen) for that hex's exact screen
  // position. Same technique settlement-interactions.spec.ts uses for the
  // full settlement view's own ring menu.
  const target = await settlement.findHex({ terrain: 'grass' });

  await settlement.clickHex(target);

  const farm = settlement.ring.action('Farm');
  const lumberjack = settlement.ring.action('Lumberjack');
  const quarry = settlement.ring.action('Quarry');
  await expect(farm).toBeVisible();
  await expect(lumberjack).toBeVisible();
  await expect(quarry).toBeVisible();
  await expect(farm).toBeEnabled();
  await expect(lumberjack).toBeDisabled();
  await expect(quarry).toBeDisabled();

  const before = await settlement.countBuildings();
  await farm.click();
  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);
  await expect(page.locator('.tray-item .sub').nth(1)).toHaveText('Placed');
});

test('onboarding ring menu closes on an outside click and on Escape', { tag: '@g3' }, async ({ page }) => {
  // Issue #141: the ring used to make its backdrop opt-in per instance, and
  // LandingView never opted in — so its backdrop rendered with
  // `pointer-events: none`, silently disabling the outside-click close (and
  // right-click) that SettlementView's own ring already had, and Escape had
  // never been wired up anywhere the ring menu is used. There is one ring
  // component per open menu now, and it always owns its backdrop, so there is
  // no longer a way to render one without these.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();

  const target = await settlement.findHex({ notTerrain: 'sea' });

  await settlement.clickHex(target);
  await expect(settlement.ring.bubbles.first()).toBeVisible();

  // Well clear of the ring's own bubbles, elsewhere on the landing page.
  await page.mouse.click(20, 20);
  await expect(settlement.ring.bubbles).toHaveCount(0);

  await settlement.clickHex(target);
  await expect(settlement.ring.bubbles.first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(settlement.ring.bubbles).toHaveCount(0);
});

test('impressum page is reachable and links back', { tag: '@g3' }, async ({ page }) => {
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForURL('**/');
});
