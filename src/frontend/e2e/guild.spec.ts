import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

test('the Alliance nav link opens the guild view as a modal over the map', { tag: '@g2' }, async ({ page }) => {
  // landing-page-defects.md L1: Alliance is a multiplayer surface with
  // nothing in it for a visitor who hasn't founded anything, so it's no
  // longer offered on the pre-founding landing header — found first, the
  // same way the in-game nav actually becomes reachable for a real player.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await SettlementPage.found(page);
  await page.getByRole('button', { name: 'Alliance' }).click();
  await expect(page).toHaveURL(/\/guild$/);

  // Owner decision: guild opens as a modal over whatever page was showing
  // before (App.vue's modal-route pattern, lib/modalRoute.ts), exactly like
  // the profile modal — not a full-page navigation.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Guild', exact: true })).toBeVisible();
  // The settlement map underneath is still mounted, not swapped out.
  await expect(page.locator('canvas')).toBeVisible();

  // Closing returns to a bare /settlement with no modal left behind.
  await dialog.locator('.close-button').click();
  await expect(page).toHaveURL(/\/settlement$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('demo mode has no live world, so the guild view shows its hint instead of erroring', { tag: '@g2' }, async ({ page }) => {
  // Demo mode's WorldModel is a pure client-side simulation with no real
  // world/backend behind it (see config.ts's DEMO_MODE and stores/world.ts),
  // so `world.worldId` never gets set outside live play — this is the
  // regression test for that path silently trying (and failing) to fetch
  // guild data instead of recognising there is nothing to show.
  await page.goto('/guild');
  await expect(page.getByText('No live world to show guilds for.')).toBeVisible();
});
