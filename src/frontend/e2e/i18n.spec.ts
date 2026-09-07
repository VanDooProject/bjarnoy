import { expect, test } from './fixtures';

// The suite's `pinnedLocale` fixture (fixtures.ts) forces `en` for every
// other spec; this one is the sole place that exercises `de` and the
// `?lang` boot override.
test('applies the locale requested via ?lang and reflects it on <html lang>', async ({ page }) => {
  await page.goto('/?lang=de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('defaults to English when no locale is requested', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
