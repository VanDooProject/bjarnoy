import { test, expect } from './fixtures';
import { SettlementPage } from './pages';

/**
 * Settlement expansion (issue #55) and the settlement menu in the top bar.
 *
 * IMPORTANT SCOPE NOTE, read before extending this file: this repo's e2e
 * harness (`playwright.config.ts`) only ever boots the built SPA via `vite
 * preview` — there is no backend `webServer` entry, so every existing spec
 * in this directory (see `helpers.ts`'s `foundSettlement`, which drives
 * `window.__demoWorld` directly rather than a real API call) exercises
 * `DEMO_MODE`'s client-only `WorldModel` simulation, never the real ASP.NET
 * backend. Training settlers, accruing renown and dispatching/resolving a
 * founding convoy are real backend concerns (a training queue that drips
 * over game time, a renown accrual that needs a world clock, a founding
 * mission that needs A* pathing and another settlement row) that the demo
 * simulation has no equivalent of.
 *
 * A genuine golden-path run — train 5 settlers, dispatch a founding
 * mission, fast-forward past arrival, see the second settlement and switch
 * to it through the menu's "Your realms" list — needs an e2e harness that
 * boots the real backend (a `webServer` entry for `Bjarnoy.Api`, a
 * throwaway database, a registered/logged-in test account) the way
 * `Bjarnoy.Api.IntegrationTests` already does at the HTTP level (see
 * `SettlerEndpointsTests.cs`, which *does* cover this golden path end to
 * end). Standing that harness up is a separate piece of work, tracked here
 * instead of silently skipped. Until then, this spec covers what the
 * demo-only harness can: the menu next to the settlement's name, and
 * renaming through it.
 */
test.describe('settlement expansion (issue #55)', { tag: '@g2' }, () => {
  test('the settlement menu offers going home and renaming, and no realm list with one settlement', async ({ page }) => {
    await SettlementPage.found(page);

    const toggle = page.locator('.titles .menu-trigger');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await expect(menu.getByRole('menuitem').nth(1)).toHaveText('Rename…');
    // DEMO_MODE has no account, so there is no list of realms to offer.
    await expect(menu.getByText('Your realms')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('renaming from the menu changes the name in the bar', async ({ page }) => {
    await SettlementPage.found(page);

    await page.locator('.titles .menu-trigger').click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const input = page.getByRole('dialog').getByRole('textbox');
    await input.fill('Nyhavn');
    await input.press('Enter');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.titles .name')).toHaveText('Nyhavn');
  });
});
