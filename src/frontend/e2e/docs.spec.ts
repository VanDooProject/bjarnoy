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
    // The turning island mounts a real HexMapRenderer (useHexMapRenderer
    // sets data-map-ready once it's drawn its first frame) — wait for that
    // before measuring the page, same as the other two specs wait on their
    // own first async-loaded content.
    await page.locator('.wasted-island .map-host[data-map-ready="true"]').waitFor();

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
    const mapHost = page.locator('.wasted-island .map-host[data-map-ready="true"]');
    await mapHost.waitFor();

    const slider = page.getByTestId('blight-slider');
    await slider.fill('0');

    await expect(page.locator('.wasted-island .stage-label')).toHaveText('All living');
    const caption = page.getByTestId('island-caption');
    await expect(caption).toHaveText('Point at a hex to see what it is.');

    // Hovering the island (its locked preview camera fits the whole island
    // to the canvas, so its own centre — the Utgard shrine, still living at
    // stage 0 — is a safe bet for "somewhere on the island") swaps the
    // caption away from the hint text and to the actual translated name, not
    // a raw i18n key — regression check both for the renderer's real hover
    // pipeline (HexMapRenderer's onHoverChange, not the old DOM version's
    // own SVG hit polygons) being wired up end to end, and for the caption
    // keys themselves resolving (they're missing the `docs.` namespace
    // prefix every other key on this page uses, `t()` falls back to
    // printing the raw key on a miss).
    const box = (await mapHost.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(caption).toHaveText('Stone ring (giant shrine)');
  });

  // Regression: in the fixed-height art boxes a tall frame used to keep the
  // box's full width while max-height squeezed it, stretching it sideways.
  test('wasted lands art keeps each frame aspect ratio', async ({ page }) => {
    await page.goto('/docs/wasted-lands');
    await page.locator('.wasted-island .map-host[data-map-ready="true"]').waitFor();

    const sprites = page.locator('.wasted-lands .atlas-sprite');
    expect(await sprites.count()).toBeGreaterThan(0);
    const mismatches = await sprites.evaluateAll((els) =>
      els.flatMap((el) => {
        const [w, h] = getComputedStyle(el).aspectRatio.split('/').map(Number);
        const box = el.getBoundingClientRect();
        if (!w || !h || box.height === 0) return [];
        const drift = Math.abs(box.width / box.height - w / h) / (w / h);
        return drift > 0.02 ? [`${box.width.toFixed(0)}x${box.height.toFixed(0)} vs ${w}/${h}`] : [];
      }),
    );
    expect(mismatches).toEqual([]);
  });
  test('wildlife camps page scrolls and shows guarded art only for kept rotations', async ({ page }) => {
    await page.goto('/docs/wildlife-camps');
    const view = new ScrollableView(page, '.wildlife-camps');
    const lastCard = page.locator('#camp-cranedance');
    await lastCard.waitFor();
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await view.wheel(100_000);
    await expect(lastCard).toBeInViewport();
    expect(await view.noHorizontalOverflow()).toBe(true);

    // Every camp shows art, guarded by default.
    await expect(page.locator('.wildlife-camps .card .atlas-sprite')).toHaveCount(9);

    // The eyrie's guarded state only ships its SW rotation; cleared, it turns every way.
    const eyrie = page.locator('#camp-eagleeyrie');
    await expect(eyrie.getByRole('button', { name: 'SW', exact: true })).toBeEnabled();
    await expect(eyrie.getByRole('button', { name: 'SE', exact: true })).toBeDisabled();
    await eyrie.getByRole('button', { name: 'Cleared' }).click();
    await expect(eyrie.getByRole('button', { name: 'SE', exact: true })).toBeEnabled();
  });

  test('bog lands page scrolls and every stage and look has art', async ({ page }) => {
    await page.goto('/docs/bog-lands');
    const view = new ScrollableView(page, '.bog-lands');
    const lastSection = page.locator('#map-rules');
    await lastSection.waitFor();
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await view.wheel(100_000);
    await expect(lastSection).toBeInViewport();
    expect(await view.noHorizontalOverflow()).toBe(true);

    // Ground + water + three buildings.
    await expect(page.locator('.bog-lands .art-box .atlas-sprite')).toHaveCount(5);
    const oreWorks = page.locator('#building-bogoreworks');
    await expect(oreWorks.locator('.pill', { hasText: /^\d+$/ })).toHaveCount(7);
    await oreWorks.getByRole('button', { name: '1', exact: true }).click();
    await expect(oreWorks.locator('.atlas-sprite')).toBeVisible();
  });
});
