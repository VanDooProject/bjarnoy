import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const SCREENSHOT_CSS = fileURLToPath(new URL('./screenshot.css', import.meta.url));

/**
 * The only way a visual spec takes a screenshot: fonts loaded, map canvas hidden
 * (screenshot.css), exact comparison from playwright.config.ts.
 */
export async function expectScreen(page: Page, name: string, opts?: { fullPage?: boolean }): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    stylePath: SCREENSHOT_CSS,
    fullPage: opts?.fullPage ?? false,
  });
}

/**
 * Pins Date to one instant so clocks and countdowns render the same every run. setFixedTime only: `clock.install()`
 * would fake requestAnimationFrame and freeze the Pixi loop. Call before the first navigation.
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-01T12:00:00Z'));
}
