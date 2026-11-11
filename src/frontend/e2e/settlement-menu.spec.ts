import { test, expect } from './fixtures';
import { SettlementPage } from './pages';

/**
 * The settlement menu next to the name in the top bar: going home, renaming, and the realm list.
 *
 * The e2e harness only serves the built SPA in DEMO_MODE (no backend, no account), so the "Your realms" list —
 * which needs an account owning several settlements — is covered by `SettlementMenu.test.ts`, and the rename
 * endpoint by `SettlementRenameEndpointsTests.cs`.
 */
test.describe('settlement menu', { tag: '@g2' }, () => {
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
