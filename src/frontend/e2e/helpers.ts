import type { Page } from '@playwright/test';

// Only the HUD menu flow is left here; it moves into the HUD page objects in a later change.
// Every other multi-step flow lives in a page object (`pages/`), the low-level utilities in `support/`
// (`support/hud.ts` has `openHudDrawer`). Pages never import this file.

/**
 * Clicks a secondary HUD destination (Leaderboards, Messages, Reports,
 * Alliance, Docs, Landing) on a desktop-width bar: those entries live in the
 * avatar's dropdown — the account menu when logged in, the returning-player
 * menu otherwise — except Docs, which sits inline in `.hud-nav` on a wide bar. `label` is the visible row text
 * (a Reports row may carry an unread count after it). One helper so no spec
 * has to know where the entries live; phone specs use the drawer instead.
 */
export async function clickHudMenuEntry(page: Page, label: string): Promise<void> {
  // Docs sits inline on a wide enough bar (lib/breakpoints.ts's HUD_NAV_ROOMY_QUERY).
  const inline = page.locator('.hud-nav > a.link', { hasText: label });
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  const account = page.getByTestId('account-menu-trigger');
  const trigger = (await account.isVisible()) ? account : page.getByTestId('returning-player-trigger');
  await trigger.click();
  await page.locator('[role="menu"] [role="menuitem"]', { hasText: label }).click();
}
