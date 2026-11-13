import { expect, type Page } from '@playwright/test';

/**
 * Opens the phone HUD drawer (TopBar.vue's `.hud-grip`) and waits until it
 * has finished opening. Tap anything inside the drawer only after this.
 *
 * While the drawer grows open (a 180ms height transition), the rows inside
 * don't move, they are only uncovered. Playwright's stability check passes on
 * a row that is still clipped, and its scroll-into-view then scrolls
 * `.hud-drawer-scroll` to bring it out. The still-growing drawer clamps that
 * scroll back on every frame, so the row slides while the click is under way.
 * Playwright hit-checks only the press: when the release lands on another
 * element, the browser sends the click to their common ancestor and the
 * row's handler never runs (seen as "Later" on the profile nudge doing
 * nothing on a 320x568 phone).
 */
export async function openHudDrawer(page: Page): Promise<void> {
  const grip = page.locator('.hud-grip');
  if ((await grip.getAttribute('aria-expanded')) !== 'true') await grip.click();
  await expect(grip).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() => page.locator('.hud-drawer').evaluate((el) => el.getAnimations().length))
    .toBe(0);
}
