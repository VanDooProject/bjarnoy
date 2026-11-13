import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPaletteReport, collectPagePalette, readRootTokenNames } from './palette';

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
  await attachPalette(page, name);
}

/**
 * Report-only palette audit of the screen just compared (see palette.ts); never fails. Written to the test's output
 * folder (test-results/, which CI uploads) and attached from there, so the JSON is also in the HTML report.
 */
async function attachPalette(page: Page, name: string): Promise<void> {
  const raw = await page.evaluate(collectPagePalette, readRootTokenNames());
  const report = buildPaletteReport(name, test.info().project.name, raw);
  const path = test.info().outputPath(`palette-${name}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  await test.info().attach(`palette-${name}.json`, { path, contentType: 'application/json' });
}

/**
 * Pins Date to one instant so clocks and countdowns render the same every run. setFixedTime only: `clock.install()`
 * would fake requestAnimationFrame and freeze the Pixi loop. Call before the first navigation.
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-01T12:00:00Z'));
}
