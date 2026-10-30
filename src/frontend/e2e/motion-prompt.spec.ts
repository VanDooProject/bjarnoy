import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { waitForMapReady } from './helpers';

// The landing page's one-time "Play with animations?" bubble. The suite
// emulates `prefers-reduced-motion: reduce` (playwright.config.ts), which is
// exactly the situation the bubble is for; `motionPrompt: 'unset'` only
// stops the fixtures from pre-answering it.
test.use({ motionPrompt: 'unset' });

const KEYS = ['bjarnoy.animations', 'bjarnoy.motion.water', 'bjarnoy.motion.fog', 'bjarnoy.motion.hud'];

async function openLanding(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForMapReady(page);
}

const hudMotion = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.hudMotion);

test.describe('landing motion prompt', { tag: '@g3' }, () => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);

  test('is offered when the device asks for reduced motion', async ({ page }) => {
    await openLanding(page);
    await expect(page.getByTestId('motion-prompt')).toBeVisible();
    await expect(page.getByTestId('motion-prompt')).toContainText('Play with animations?');
    expect(await hudMotion(page)).toBe('reduced');
  });

  test('"Turn on" turns every animation on and never comes back', async ({ page }) => {
    await openLanding(page);
    await page.getByTestId('motion-prompt-on').click();
    await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
    expect(await hudMotion(page)).toBe('full');

    const stored = await page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), KEYS);
    expect(stored).toEqual(['on', 'on', 'on', 'on']);
    expect(await page.evaluate(() => localStorage.getItem('bjarnoy.motionPrompt'))).toBe('on');

    await page.reload();
    await waitForMapReady(page);
    await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
    expect(await hudMotion(page)).toBe('full');
  });

  test('"Keep reduced" leaves the settings alone and never comes back', async ({ page }) => {
    await openLanding(page);
    await page.getByTestId('motion-prompt-dismiss').click();
    await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
    expect(await hudMotion(page)).toBe('reduced');
    expect(await page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), KEYS)).toEqual([null, null, null, null]);

    await page.reload();
    await waitForMapReady(page);
    await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
  });

  test('the close button dismisses it too', async ({ page }) => {
    await openLanding(page);
    await page.getByTestId('motion-prompt-close').click();
    await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('bjarnoy.motionPrompt'))).toBe('dismissed');
  });

  test.describe('without a reduced-motion preference', () => {
    // `contextOptions` (not the `reducedMotion` option): the config's own contextOptions.reducedMotion takes priority over it.
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('never shows', async ({ page }) => {
      await openLanding(page);
      await expect(page.getByTestId('motion-prompt')).toHaveCount(0);
      expect(await hudMotion(page)).toBe('full');
    });
  });
});
