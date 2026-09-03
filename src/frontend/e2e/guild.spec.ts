import { expect, test } from './fixtures';

test('the Alliance nav link opens the guild view', { tag: '@g2' }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Alliance' }).click();
  await expect(page).toHaveURL(/\/guild$/);
  await expect(page.getByRole('heading', { name: 'Guild', exact: true })).toBeVisible();
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
