import { expect, test } from './fixtures';

/**
 * Regression coverage for the docs pages' scroll bug: `.tech-tree`/
 * `.tile-docs` used `min-height: 100vh` with `overflow: auto`, which never
 * gives the element a constrained box to overflow *within* — the real
 * overflow lands on `body`, which `overflow: hidden` (style.css, needed by
 * the map views) then clips entirely. See #101.
 *
 * Both routes work in demo mode: `useBuildingCatalogueStore().load()` falls
 * back to the bundled `data/building-catalogue.json` snapshot with no
 * backend, which is exactly what `npm run test:e2e` runs against.
 */

test.describe('docs pages scrolling', { tag: '@g2' }, () => {
  test('tech tree page scrolls to reveal content below the fold', async ({ page }) => {
    await page.goto('/tech-tree');
    // Catalogue load is async even against the bundled fallback — wait for
    // a real building section before measuring the page.
    const lastSection = page.locator('section.building').last();
    await lastSection.waitFor();

    const root = page.locator('.tech-tree');
    const { scrollHeight, clientHeight } = await root.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await expect(lastSection).not.toBeInViewport();

    await root.hover();
    // A large, deliberately overshooting delta rather than a value sized to
    // the page's current content: the browser clamps scrollTop at the real
    // max either way, and a snug value keeps needing bumping as the tech
    // tree grows another building section (it has three times already).
    await page.mouse.wheel(0, 100_000);
    await expect
      .poll(() => root.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(lastSection).toBeInViewport();

    // Guards the `100vw` -> `100%` fix: a viewport-width element plus the
    // scrollbar gutter that scrolling now needs would push the page wider
    // than the window.
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('tile docs page scrolls to reveal content below the fold', async ({ page }) => {
    await page.goto('/docs/tiles');
    const lastSection = page.locator('#mountain');
    await lastSection.waitFor();

    const root = page.locator('.tile-docs');
    const { scrollHeight, clientHeight } = await root.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await expect(lastSection).not.toBeInViewport();

    await root.hover();
    await page.mouse.wheel(0, 5000);
    await expect
      .poll(() => root.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(lastSection).toBeInViewport();

    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
