import { expect, test } from './fixtures';
import { ScrollableView } from './pages';

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

    const view = new ScrollableView(page, '.tech-tree');
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await expect(lastSection).not.toBeInViewport();

    // A large, deliberately overshooting delta rather than a value sized to
    // the page's current content: the browser clamps scrollTop at the real
    // max either way, and a snug value keeps needing bumping as the tech
    // tree grows another building section (it has three times already).
    await view.wheel(100_000);
    await expect(lastSection).toBeInViewport();

    // Guards the `100vw` -> `100%` fix: a viewport-width element plus the
    // scrollbar gutter that scrolling now needs would push the page wider
    // than the window.
    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test('tile docs page scrolls to reveal content below the fold', async ({ page }) => {
    await page.goto('/docs/tiles');
    const lastSection = page.locator('#mountain');
    await lastSection.waitFor();

    const view = new ScrollableView(page, '.tile-docs');
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await expect(lastSection).not.toBeInViewport();

    await view.wheel(5000);
    await expect(lastSection).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test('wasted lands page scrolls to reveal content below the fold', async ({ page }) => {
    await page.goto('/docs/wasted-lands');
    // The island's sprites resolve their own atlas frames client-side —
    // wait for the first one before measuring the page, same as the other
    // two specs wait on their own first async-loaded content.
    await page.locator('.island-sprite').first().waitFor();

    const view = new ScrollableView(page, '.wasted-lands');
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    const lastSection = page.locator('#pair-sea');
    await expect(lastSection).not.toBeInViewport();

    await view.wheel(100_000);
    await expect(lastSection).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test('wasted lands island slider shows the all-living stage', async ({ page }) => {
    await page.goto('/docs/wasted-lands');
    await page.locator('.island-sprite').first().waitFor();

    const slider = page.getByTestId('blight-slider');
    await slider.fill('0');

    await expect(page.locator('.wasted-island .stage-label')).toHaveText('All living');
    await expect(page.getByTestId('island-caption')).toHaveText('Point at a hex to see what it is.');
  });
});
