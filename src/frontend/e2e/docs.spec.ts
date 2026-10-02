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
    const cards = page.locator('.wildlife-camps .card');
    const lastCard = cards.last();
    await lastCard.waitFor();
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await view.wheel(100_000);
    await expect(lastCard).toBeInViewport();
    expect(await view.noHorizontalOverflow()).toBe(true);

    // A card only exists once its art is in the atlas, so every card shows art.
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(9);
    // (a still frame, or the animated guarded camp)
    await expect(page.locator('.wildlife-camps .card .art-box > *')).toHaveCount(count);

    // The eyrie's guarded state only ships its SW rotation; cleared, it turns every way.
    const eyrie = page.locator('#camp-eagleeyrie');
    await expect(eyrie.getByRole('button', { name: 'SW', exact: true })).toBeEnabled();
    await expect(eyrie.getByRole('button', { name: 'SE', exact: true })).toBeDisabled();
    await eyrie.getByRole('button', { name: 'Cleared' }).click();
    await expect(eyrie.getByRole('button', { name: 'SE', exact: true })).toBeEnabled();
  });

  test('wildlife camps page filters by strength and ground', async ({ page }) => {
    await page.goto('/docs/wildlife-camps');
    const cards = page.locator('.wildlife-camps .card');
    await cards.first().waitFor();
    const total = await cards.count();

    const strength = page.getByTestId('strength-filter');
    await strength.getByRole('button', { name: 'Strong', exact: true }).click();
    const strong = await cards.count();
    expect(strong).toBeGreaterThan(0);
    await expect(cards.locator('[data-strength="weak"]')).toHaveCount(0);
    await strength.getByRole('button', { name: 'Weak', exact: true }).click();
    await expect(cards.locator('[data-strength="strong"]')).toHaveCount(0);
    expect(strong + (await cards.count())).toBe(total);

    await strength.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByTestId('ground-filter').getByRole('button', { name: 'Bog', exact: true }).click();
    await expect(cards).toHaveCount(3);
    await expect(page.locator('#camp-wolfden')).toHaveCount(0);
  });

  test('wildlife camps page animates guarded camps and switches every camp at once', async ({ page }) => {
    await page.goto('/docs/wildlife-camps');
    const cards = page.locator('.wildlife-camps .card');
    await cards.first().waitFor();
    const total = await cards.count();

    // Guarded by default: every camp with a clip plays it — once the animation
    // manifests have arrived (they load lazily, after the cards render).
    const animated = page.locator('.wildlife-camps .card .animated-camp[data-animated="true"]');
    await expect.poll(() => animated.count()).toBeGreaterThan(0);
    await expect(page.locator('.wildlife-camps .card [data-testid="guard-range"]')).toHaveCount(total);
    // Every camp gives food and every strong camp iron; the camps' own extras and larger shares come on top.
    await expect(page.locator('.wildlife-camps .card [data-loot="food"]')).toHaveCount(total);
    const strongCards = page.locator('.card:has([data-strength="strong"])');
    await expect(strongCards.locator('[data-loot="iron"]')).toHaveCount(await strongCards.count());
    await expect(page.locator('#camp-beaverlodge [data-loot="wood"]')).toHaveCount(1);
    await expect(page.locator('#camp-boarwallow [data-loot="food"][data-more="true"]')).toHaveCount(1);

    const all = page.getByTestId('state-switch');
    await all.getByRole('button', { name: 'Cleared', exact: true }).click();
    await expect(animated).toHaveCount(0);
    await expect(cards.getByRole('button', { name: 'Cleared', exact: true }).and(page.locator('.active'))).toHaveCount(
      total,
    );

    await all.getByRole('button', { name: 'Guarded', exact: true }).click();
    await expect.poll(() => animated.count()).toBeGreaterThan(0);

    // A camp's own pill takes it out of step, so the page-wide switch shows neither state.
    await page.locator('#camp-wolfden').getByRole('button', { name: 'Cleared', exact: true }).click();
    await expect(all.locator('.active')).toHaveCount(0);
  });

  // Regression: without an account the animation setting (profile page) is out of reach, so a device
  // that asks for reduced motion only ever saw still camps. The docs page now says why and offers a button.
  test('wildlife camps page offers to play animations when the device asks for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/docs/wildlife-camps');
    const frame = page.locator('#camp-wolfden .animated-camp .layer').nth(1);
    await frame.waitFor();

    const note = page.getByTestId('animation-paused');
    await expect(note).toBeVisible();
    const still = await frame.getAttribute('style');
    await page.waitForTimeout(1000);
    expect(await frame.getAttribute('style')).toBe(still);

    await note.getByRole('button', { name: 'Play animations' }).click();
    await expect(note).toBeHidden();
    await expect.poll(async () => frame.getAttribute('style')).not.toBe(still);
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

    // Ground + eight water shapes + four buildings, each its own entry with a thumbnail.
    await expect(page.locator('.bog-lands .tile .thumb .atlas-sprite')).toHaveCount(13);
    await expect(page.locator('#hammerschmiede .atlas-sprite')).toBeVisible();
    const oreWorks = page.locator('#bogoreworks');
    await expect(oreWorks.locator('.variant-button', { hasText: /^\d+$/ })).toHaveCount(7);
    await oreWorks.getByRole('button', { name: '1', exact: true }).click();
    await expect(oreWorks.locator('.atlas-sprite')).toBeVisible();

    // The example island is drawn, and the page links back to the docs hub.
    await expect(page.locator('#example-map canvas')).toBeVisible();
    await page.getByRole('link', { name: '← Docs' }).click();
    await expect(page).toHaveURL(/\/docs$/);
  });

  // Every docs page sits on the shared DocsPageLayout: the same top bar, a breadcrumb back to the hub
  // (the hub itself has none), a title and the lede.
  for (const path of ['/tech-tree', '/docs/tiles', '/docs/wasted-lands', '/docs/wildlife-camps', '/docs/bog-lands']) {
    test(`${path} shows its breadcrumb back to the docs hub`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.docs-page h1')).toBeVisible();
      await expect(page.locator('.docs-page .intro')).toBeVisible();
      await page.locator('.docs-page .breadcrumb').click();
      await expect(page).toHaveURL(/\/docs$/);
      await expect(page.locator('.docs-page h1')).toBeVisible();
      await expect(page.locator('.docs-page .breadcrumb')).toHaveCount(0);
    });
  }

  test('walls page shows the six pieces with stage and facing pickers, the example wall and the hub links to it', async ({
    page,
  }) => {
    await page.goto('/docs');
    await page.getByRole('button', { name: /^Walls/ }).click();
    await expect(page).toHaveURL(/\/docs\/walls$/);

    const cards = page.locator('.walls .tile');
    await expect(cards).toHaveCount(6);
    await expect(page.locator('.walls .tile .thumb .animated-building')).toHaveCount(6);
    for (const id of ['straight180', 'bend60', 'bend120', 'gate180', 'end', 'end_coast']) {
      await expect(page.locator(`#piece-${id}`)).toBeVisible();
    }

    // Stages are read off the atlas: the construction site and at least two finished stages.
    const straight = page.locator('#piece-straight180');
    await expect(straight.getByRole('button', { name: 'Under construction' })).toBeVisible();
    await expect(straight.getByRole('button', { name: 'Level 1', exact: true })).toBeVisible();
    await straight.getByRole('button', { name: 'Under construction' }).click();
    await expect(straight.getByRole('button', { name: 'Under construction' })).toHaveClass(/active/);
    await straight.getByRole('button', { name: 'NW', exact: true }).click();
    await expect(straight.getByRole('button', { name: 'NW', exact: true })).toHaveClass(/active/);
    await expect(straight.locator('.animated-building')).toBeVisible();

    // The example wall, drawn by the game's own map renderer, and the four grounds.
    await expect(page.locator('.wall-example canvas')).toBeVisible();
    await expect(page.locator('.walls figure.ground')).toHaveCount(4);
    await expect(page.getByTestId('wall-movement-diagram').locator('figure')).toHaveCount(4);
    await expect(page.getByTestId('wall-movement-legend').locator('li')).toHaveCount(6);

    await page.locator('.docs-page .breadcrumb').click();
    await expect(page).toHaveURL(/\/docs$/);
  });
});

/**
 * Hover must land on the hex under the cursor even where the docs column is
 * scaled with CSS `zoom` (`.docs-scale`, style.css: 1.2x from 1600px wide).
 * Under that zoom the pointer and `getBoundingClientRect()` are in zoomed
 * pixels while the renderer's viewport is in layout pixels, so hit-tests used
 * to land `zoom` times too far from the canvas origin (the hover highlight sat
 * beside the cursor). 1280 is the unscaled control, 1920 the zoomed case.
 *
 * Probe points are fractions of the map host: the locked preview camera fits
 * the island to the canvas, so the same fraction is the same hex at any size.
 */
test.describe('docs island maps hover under the docs zoom', { tag: '@g2' }, () => {
  const islands = [
    {
      path: '/docs/wasted-lands',
      island: '.wasted-island',
      caption: 'island-caption',
      probes: [
        { fx: 0.2, fy: 0.4, name: 'Fire-mountain' },
        { fx: 0.5, fy: 0.2, name: 'Wasteland' },
      ],
    },
    {
      path: '/docs/bog-lands',
      island: '.bog-island',
      caption: 'bog-island-caption',
      probes: [
        { fx: 0.2, fy: 0.4, name: 'River' },
        { fx: 0.75, fy: 0.5, name: 'Grass' },
      ],
    },
  ];

  for (const width of [1280, 1920]) {
    for (const { path, island, caption, probes } of islands) {
      test(`${path} names the hovered hex at ${width}px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1080 });
        await page.goto(path);
        const mapHost = page.locator(`${island} .map-host[data-map-ready="true"]`);
        await mapHost.waitFor();
        await mapHost.scrollIntoViewIfNeeded();

        const box = (await mapHost.boundingBox())!;
        for (const { fx, fy, name } of probes) {
          await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
          await expect(page.getByTestId(caption)).toHaveText(name);
        }
      });
    }
  }
});
