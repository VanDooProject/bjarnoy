import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ScrollableView } from "./pages";

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

/**
 * The wasted-lands island toy is an admin note: hidden from players, shown to
 * an admin who has switched "Show admin notes" on (stored in localStorage).
 */
async function asAdminWithNotes(
  page: Page,
  adminAuth: { login: () => Promise<void> },
) {
  await adminAuth.login();
  await page.addInitScript(() => {
    window.localStorage.setItem("docs.adminNotes", "1");
  });
}

test.describe("docs pages scrolling", { tag: "@g2" }, () => {
  test("tech tree page scrolls to reveal content below the fold", async ({
    page,
  }) => {
    await page.goto("/tech-tree");
    // Catalogue load is async even against the bundled fallback — wait for
    // a real building section before measuring the page.
    const lastSection = page.locator("section.building").last();
    await lastSection.waitFor();

    const view = new ScrollableView(page, ".tech-tree");
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

  test("tile docs page scrolls to reveal content below the fold", async ({
    page,
  }) => {
    await page.goto("/docs/tiles");
    const lastSection = page.locator("#mountain");
    await lastSection.waitFor();

    const view = new ScrollableView(page, ".tile-docs");
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await expect(lastSection).not.toBeInViewport();

    await view.wheel(5000);
    await expect(lastSection).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);

    // New quarries can no longer be placed, so mountain ground lists no buildings to build.
    await expect(lastSection).not.toContainText("Quarry");
  });

  test("wasted lands page scrolls to reveal content below the fold", async ({
    page,
  }) => {
    await page.goto("/docs/wasted-lands");
    // The turning island is an admin note, so a player's page starts at the
    // pairs; wait for its first art before measuring the page.
    await page.locator(".wasted-lands .atlas-sprite").first().waitFor();

    const view = new ScrollableView(page, ".wasted-lands");
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    const lastSection = page.locator("#pair-sea");
    await expect(lastSection).not.toBeInViewport();

    await view.wheel(100_000);
    await expect(lastSection).toBeInViewport();

    expect(await view.noHorizontalOverflow()).toBe(true);
  });

  test("wasted lands endgame section lists the garrisons with their defense power", async ({
    page,
  }) => {
    await page.goto("/docs/wasted-lands");
    const endgame = page.locator("#endgame");
    await expect(
      endgame.getByRole("heading", { name: "How the endgame plays" }),
    ).toBeVisible();
    // Defense power is derived from the tier table (count x tier defense), so a drifted tier or count shows here.
    const utgard = endgame.getByRole("row", { name: /^Utgard/ });
    await expect(utgard).toContainText("38,000");
    await expect(
      endgame.getByRole("row", { name: /^Watchtower/ }),
    ).toContainText("4,650");
  });

  test("wasted lands island slider shows the all-living stage", async ({
    page,
    adminAuth,
  }) => {
    await asAdminWithNotes(page, adminAuth);
    await page.goto("/docs/wasted-lands");
    const mapHost = page.locator(
      '.wasted-island .map-host[data-map-ready="true"]',
    );
    await mapHost.waitFor();

    const slider = page.getByTestId("blight-slider");
    await slider.fill("0");

    await expect(page.locator(".wasted-island .stage-label")).toHaveText(
      "All living",
    );
    const caption = page.getByTestId("island-caption");
    await expect(caption).toHaveText("Point at a hex to see what it is.");

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
    await expect(caption).toHaveText("Stone ring (giant shrine)");
  });

  // Regression: in the fixed-height art boxes a tall frame used to keep the
  // box's full width while max-height squeezed it, stretching it sideways.
  test("wasted lands art keeps each frame aspect ratio", async ({ page }) => {
    await page.goto("/docs/wasted-lands");
    await page.locator(".wasted-lands .atlas-sprite").first().waitFor();

    const sprites = page.locator(".wasted-lands .atlas-sprite");
    expect(await sprites.count()).toBeGreaterThan(0);
    const mismatches = await sprites.evaluateAll((els) =>
      els.flatMap((el) => {
        const [w, h] = getComputedStyle(el).aspectRatio.split("/").map(Number);
        const box = el.getBoundingClientRect();
        if (!w || !h || box.height === 0) return [];
        const drift = Math.abs(box.width / box.height - w / h) / (w / h);
        return drift > 0.02
          ? [`${box.width.toFixed(0)}x${box.height.toFixed(0)} vs ${w}/${h}`]
          : [];
      }),
    );
    expect(mismatches).toEqual([]);
  });
  test("wildlife camps page scrolls and shows guarded art only for kept rotations", async ({
    page,
  }) => {
    await page.goto("/docs/wildlife-camps");
    const view = new ScrollableView(page, ".wildlife-camps");
    const cards = page.locator(".wildlife-camps .card");
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
    await expect(
      page.locator(".wildlife-camps .card .art-box > *"),
    ).toHaveCount(count);

    // The eyrie's guarded state only ships its SW rotation; cleared, it turns every way.
    const eyrie = page.locator("#camp-eagleeyrie");
    await expect(
      eyrie.getByRole("button", { name: "SW", exact: true }),
    ).toBeEnabled();
    await expect(
      eyrie.getByRole("button", { name: "SE", exact: true }),
    ).toBeDisabled();
    await eyrie.getByRole("button", { name: "Cleared" }).click();
    await expect(
      eyrie.getByRole("button", { name: "SE", exact: true }),
    ).toBeEnabled();
  });

  test("wildlife camps page filters by strength and ground", async ({
    page,
  }) => {
    await page.goto("/docs/wildlife-camps");
    const cards = page.locator(".wildlife-camps .card");
    await cards.first().waitFor();
    const total = await cards.count();

    const strength = page.getByTestId("strength-filter");
    await strength.getByRole("button", { name: "Strong", exact: true }).click();
    const strong = await cards.count();
    expect(strong).toBeGreaterThan(0);
    await expect(cards.locator('[data-strength="weak"]')).toHaveCount(0);
    await strength.getByRole("button", { name: "Weak", exact: true }).click();
    await expect(cards.locator('[data-strength="strong"]')).toHaveCount(0);
    expect(strong + (await cards.count())).toBe(total);

    await strength.getByRole("button", { name: "All", exact: true }).click();
    await page
      .getByTestId("ground-filter")
      .getByRole("button", { name: "Bog", exact: true })
      .click();
    await expect(cards).toHaveCount(3);
    await expect(page.locator("#camp-wolfden")).toHaveCount(0);
  });

  test("wildlife camps page animates guarded camps and switches every camp at once", async ({
    page,
  }) => {
    await page.goto("/docs/wildlife-camps");
    const cards = page.locator(".wildlife-camps .card");
    await cards.first().waitFor();
    const total = await cards.count();

    // Guarded by default: every camp with a clip plays it — once the animation
    // manifests have arrived (they load lazily, after the cards render).
    const animated = page.locator(
      '.wildlife-camps .card .animated-camp[data-animated="true"]',
    );
    await expect.poll(() => animated.count()).toBeGreaterThan(0);
    await expect(
      page.locator('.wildlife-camps .card [data-testid="guard-range"]'),
    ).toHaveCount(total);
    // Every camp gives food and every strong camp iron; the camps' own extras and larger shares come on top.
    await expect(
      page.locator('.wildlife-camps .card [data-loot="food"]'),
    ).toHaveCount(total);
    const strongCards = page.locator('.card:has([data-strength="strong"])');
    await expect(strongCards.locator('[data-loot="iron"]')).toHaveCount(
      await strongCards.count(),
    );
    await expect(
      page.locator('#camp-beaverlodge [data-loot="wood"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('#camp-boarwallow [data-loot="food"][data-more="true"]'),
    ).toHaveCount(1);

    const all = page.getByTestId("state-switch");
    await all.getByRole("button", { name: "Cleared", exact: true }).click();
    await expect(animated).toHaveCount(0);
    await expect(
      cards
        .getByRole("button", { name: "Cleared", exact: true })
        .and(page.locator(".active")),
    ).toHaveCount(total);

    await all.getByRole("button", { name: "Guarded", exact: true }).click();
    await expect.poll(() => animated.count()).toBeGreaterThan(0);

    // A camp's own pill takes it out of step, so the page-wide switch shows neither state.
    await page
      .locator("#camp-wolfden")
      .getByRole("button", { name: "Cleared", exact: true })
      .click();
    await expect(all.locator(".active")).toHaveCount(0);
  });

  // Regression: without an account the animation setting (profile page) is out of reach, so a device
  // that asks for reduced motion only ever saw still camps. The docs page now says why and offers a button.
  test("wildlife camps page offers to play animations when the device asks for reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/docs/wildlife-camps");
    const frame = page.locator("#camp-wolfden .animated-camp .layer").nth(1);
    await frame.waitFor();

    const note = page.getByTestId("animation-paused");
    await expect(note).toBeVisible();
    const still = await frame.getAttribute("style");
    await page.waitForTimeout(1000);
    expect(await frame.getAttribute("style")).toBe(still);

    await note.getByRole("button", { name: "Play animations" }).click();
    await expect(note).toBeHidden();
    await expect.poll(async () => frame.getAttribute("style")).not.toBe(still);
  });

  test("bog lands page scrolls and every stage and look has art", async ({
    page,
  }) => {
    await page.goto("/docs/bog-lands");
    // Players see no admin notes and no toggle to reveal them.
    await expect(page.getByTestId("admin-note")).toHaveCount(0);
    await expect(page.getByTestId("docs-admin-toggle")).toHaveCount(0);
    const view = new ScrollableView(page, ".bog-lands");
    const lastSection = page.locator("#claybrickworks");
    await lastSection.waitFor();
    const { scrollHeight, clientHeight } = await view.metrics();
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await view.wheel(100_000);
    await expect(lastSection).toBeInViewport();
    expect(await view.noHorizontalOverflow()).toBe(true);

    // The example island comes first, above the separate tiles.
    expect(
      await page.evaluate(() => {
        const map = document.querySelector("#example-map")!;
        const ground = document.querySelector("#ground")!;
        return Boolean(map.compareDocumentPosition(ground) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    ).toBe(true);

    // Bog ground never draws the plain moss, so the docs only offer its decorated looks.
    const ground = page.locator("#ground");
    await expect(ground.locator(".variant-button", { hasText: "Open mire 1" })).toBeVisible();
    await expect(ground.locator(".variant-button", { hasText: "Plain moss" })).toHaveCount(0);

    // Ground + eight water shapes + four buildings, each its own entry with a thumbnail.
    await expect(
      page.locator(".bog-lands .tile .thumb .atlas-sprite"),
    ).toHaveCount(13);
    await expect(page.locator("#hammerschmiede .atlas-sprite")).toBeVisible();
    const oreWorks = page.locator("#bogoreworks");
    await expect(
      oreWorks.locator(".variant-button", { hasText: /^\d+$/ }),
    ).toHaveCount(7);
    await oreWorks.getByRole("button", { name: "1", exact: true }).click();
    await expect(oreWorks.locator(".atlas-sprite")).toBeVisible();

    // The example island is drawn, and the page links back to the docs hub.
    await expect(page.locator("#example-map canvas")).toBeVisible();
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
  });

  // Every docs page sits on the shared DocsPageLayout: the same top bar, a breadcrumb (the hub itself has none),
  // a title, the lede, header art and the related/previous/next footer.
  const DOCS_PATHS = [
    "/tech-tree",
    "/docs/tiles",
    "/docs/wasted-lands",
    "/docs/wildlife-camps",
    "/docs/bog-lands",
    "/docs/shrines",
    "/docs/production",
    "/docs/founding",
    "/docs/land-movement",
    "/docs/ships",
    "/docs/walls",
  ];
  for (const path of DOCS_PATHS) {
    test(`${path} shows its breadcrumb back to the docs hub and its footer`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator(".docs-page h1")).toBeVisible();
      await expect(page.locator(".docs-page .intro")).toBeVisible();
      const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumb.locator("[aria-current=page]")).toBeVisible();
      await expect(page.getByTestId("docs-header-art").locator(".atlas-sprite:visible").first()).toBeVisible();
      const related = page.locator("[data-related]");
      expect(await related.count()).toBeGreaterThan(0);
      await crumb.getByRole("link", { name: "Docs", exact: true }).click();
      await expect(page).toHaveURL(/\/docs$/);
      await expect(page.locator(".docs-page h1")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
      await expect(page.getByTestId("docs-footer")).toHaveCount(0);
    });
  }

  test.describe("docs navigation", () => {
    test("the page crumb lists the pages of its group and navigates", async ({ page }) => {
      await page.goto("/docs/shrines");
      const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await crumb.getByRole("button", { name: /^Shrines/ }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveText(["Tech tree", "Resource production", "Shrines", "Walls"]);
      await expect(menu.getByRole("menuitem", { name: "Shrines" })).toHaveAttribute("aria-current", "page");
      await menu.getByRole("menuitem", { name: "Walls" }).click();
      await expect(page).toHaveURL(/\/docs\/walls$/);
      await expect(page.getByRole("menu")).toHaveCount(0);
    });

    test("Escape closes the menu and returns focus to its crumb", async ({ page }) => {
      await page.goto("/docs/shrines");
      const trigger = page.getByRole("button", { name: /^Shrines/ });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test("the group crumb lists the four groups and goes to the hub scrolled to that group", async ({ page }) => {
      await page.goto("/docs/shrines");
      await page.getByRole("button", { name: /^Building up/ }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveText(["Your island", "Building up", "On the move", "Beyond your shores"]);
      await menu.getByRole("menuitem", { name: "Your island" }).click();
      await expect(page).toHaveURL(/\/docs#group-island$/);
      await expect(page.locator("#group-island")).toBeInViewport();
      // A lower group scrolls the hub too.
      await page.goto("/docs/shrines");
      await page.getByRole("button", { name: /^Building up/ }).click();
      await page.getByRole("menuitem", { name: "Beyond your shores" }).click();
      await expect(page).toHaveURL(/\/docs#group-beyond$/);
      await expect(page.locator("#group-beyond")).toBeInViewport();
    });

    test("the footer links to the related pages and to the previous and next page", async ({ page }) => {
      await page.goto("/docs/shrines");
      const footer = page.getByTestId("docs-footer");
      await expect(footer.getByRole("heading", { name: "Related" })).toBeVisible();
      await expect(footer.locator("[data-related]")).toHaveCount(3);
      await expect(footer.locator("[data-related=techTree]")).toContainText("Costs and build times of every shrine level.");
      await expect(page.getByTestId("docs-prev")).toHaveAttribute("href", "/docs/production");
      await expect(page.getByTestId("docs-next")).toHaveAttribute("href", "/docs/walls");
      await page.getByTestId("docs-next").click();
      await expect(page).toHaveURL(/\/docs\/walls$/);
    });

    for (const path of DOCS_PATHS) {
      test(`${path} has no horizontal overflow at 390px`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto(path);
        await expect(page.locator(".docs-page h1")).toBeVisible();
        await expect(page.getByTestId("docs-footer")).toBeAttached();
        const view = new ScrollableView(page, ".docs-page");
        expect(await view.noHorizontalOverflow()).toBe(true);
        // Backdrop pages swap to the icon on a phone.
        await expect(page.getByTestId("docs-header-backdrop")).toBeHidden();
        await expect(page.getByTestId("docs-header-icon")).toBeVisible();
      });
    }

    test("a backdrop header bleeds out of the column without causing overflow at desktop widths", async ({ page }) => {
      for (const width of [800, 1280, 1920]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/docs/ships");
        await expect(page.getByTestId("docs-header-backdrop")).toBeVisible();
        await expect(page.getByTestId("docs-header-icon")).toBeHidden();
        const view = new ScrollableView(page, ".docs-page");
        expect(await view.noHorizontalOverflow(), `${width}px`).toBe(true);
      }
    });
  });

  test.describe("docs hub", () => {
    test("shows the four groups and eleven art cards, and the cards and footer link through", async ({
      page,
    }) => {
      await page.goto("/docs");
      await expect(
        page.getByRole("heading", { level: 1, name: "The Bjarnøy handbook" }),
      ).toBeVisible();
      await expect(page.getByTestId("docs-hero-art").getByRole("img")).toBeVisible();

      for (const name of [
        "Your island",
        "Building up",
        "On the move",
        "Beyond your shores",
      ]) {
        await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      }
      await expect(page.locator(".groups .group")).toHaveCount(4);
      await expect(page.locator(".groups .group a.card")).toHaveCount(11);
      for (const [group, count] of [
        ["island", 2],
        ["building", 4],
        ["move", 3],
        ["beyond", 2],
      ] as const) {
        await expect(page.locator(`.group[data-group=${group}] a.card`)).toHaveCount(count);
      }

      const cards = page.locator(".groups a.card");
      await expect(cards).toHaveCount(11);
      for (const title of [
        "Tiles",
        "Bog lands",
        "Tech tree",
        "Resource production",
        "Shrines",
        "Walls",
        "Founding settlements",
        "Land movement",
        "Ships and water",
        "Wildlife camps",
        "Wasted lands",
      ]) {
        await expect(
          page.locator(".groups a.card .title", { hasText: new RegExp(`^${title}$`) }),
        ).toBeVisible();
      }
      // Every card's art is drawn from the atlas: a sprite with a background
      // image, or the animated camp's layers.
      const arts = page.getByTestId("docs-card-art");
      await expect(arts).toHaveCount(11);
      for (let i = 0; i < 11; i++) {
        const layer = arts
          .nth(i)
          .locator(".atlas-sprite, .animated-camp .layer, .animated-building .layer")
          .first();
        await expect(layer).toBeVisible();
        const bg = await layer.evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(bg).toContain("url(");
      }

      await page.getByRole("link", { name: /^Bog lands/ }).click();
      await expect(page).toHaveURL(/\/docs\/bog-lands$/);

      await page.goto("/docs");
      await page.getByRole("link", { name: "See the game in pictures" }).click();
      await expect(page).toHaveURL(/\/showcase$/);
    });

    test("does not overflow horizontally on a phone", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/docs");
      await expect(page.locator(".groups a.card")).toHaveCount(11);
      const overflow = await page
        .locator(".docs-page")
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });

  test("shrines page lists the five gods, hides the runes from players and its building links preview and lead to the tech tree", async ({
    page,
  }) => {
    await page.goto("/docs/shrines");
    await expect(page.getByRole("heading", { level: 1, name: "Shrines" })).toBeVisible();

    const rows = page.locator('[data-testid="gods-table"] tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Shrine of Thor");
    await expect(rows.nth(0)).toContainText("+22%");
    await expect(rows.nth(4)).toContainText("Odin Statue");

    // Players see neither the runes nor the toggle that would reveal them.
    await expect(page.getByTestId("admin-note")).toHaveCount(0);
    await expect(page.getByTestId("docs-admin-toggle")).toHaveCount(0);
    await expect(page.getByText("Work in progress")).toHaveCount(0);

    // Keyboard focus opens the preview card; Escape closes it.
    const link = rows.nth(0).locator("th.god a.link");
    await link.focus();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Shrine of Thor");
    await expect(tip).toContainText("levels 1–5");
    await expect(tip).toContainText("Costs and levels in the tech tree");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);

    await link.click();
    await expect(page).toHaveURL(/\/tech-tree#shrineofthor$/);
    await expect(page.locator("#shrineofthor")).toBeInViewport();
  });

  /**
   * A reference page for players: its main table is there, no admin note or toggle shows for the demo player, and on a
   * phone the page does not scroll sideways (wide tables scroll inside their own box).
   */
  async function expectPlayerPage(page: Page, h1: string, table: string) {
    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    await expect(page.locator(`[data-testid="${table}"] tbody tr`).first()).toBeVisible();
    await expect(page.getByTestId("admin-note")).toHaveCount(0);
    await expect(page.getByTestId("docs-admin-toggle")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page
      .locator(".docs-page")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  test("production page lists the producers and mills from the catalogue and hides the admin note", async ({
    page,
  }) => {
    await page.goto("/docs/production");
    await expectPlayerPage(page, "Resource production", "producers-table");
    // Seven producers a player can still place (no Quarry) plus the Longhouse.
    await expect(page.locator('[data-testid="producers-table"] tbody tr')).toHaveCount(8);
    await expect(page.locator('[data-producer="quarry"]')).toHaveCount(0);
    await expect(page.locator('[data-producer="lumberjack"]')).toContainText("206");
    await expect(page.locator('[data-mill="cropmill"]')).toContainText("Straight river");
    // The first mention of a building is the link, and that is its row in the first table.
    await expect(
      page.locator('[data-producer="lumberjack"] th [data-building-link="link"]'),
    ).toHaveCount(1);
    // A table's first column always links, even though the Longhouse was already linked in row 1's "Unlocks at" cell.
    await expect(
      page.locator('[data-producer="longhouse"] th').first().locator('a[href="/tech-tree#longhouse"]'),
    ).toHaveCount(1);
    // The header shows the herder's still frame (the hub card plays the clip).
    await expect(page.getByTestId("docs-header-icon").locator(".atlas-sprite")).toBeVisible();
  });

  test("founding page prices the next settlements and hides the admin note", async ({
    page,
  }) => {
    await page.goto("/docs/founding");
    await expectPlayerPage(page, "Founding settlements", "price-table");
    await expect(page.locator('[data-settlement="2"]')).toContainText("55,000");
    await expect(page.locator('[data-settlement="3"]')).toContainText("400 / 300 / 200 / 200");
    await expect(page.getByText("issue #447")).toHaveCount(0);
  });

  test("land movement page shows the example route and the unit speeds, keeps the ground costs for admins and hides the admin note", async ({
    page,
  }) => {
    await page.goto("/docs/land-movement");
    await expectPlayerPage(page, "Land movement", "pace-table");
    // The ground cost table is an admin note: players read the rules and the example map instead.
    await expect(page.getByTestId("ground-table")).toHaveCount(0);
    await expect(page.getByText("Grass is the quickest ground")).toBeVisible();
    await expect(
      page.locator('[data-testid="pace-table"] [data-unit="spearman"]'),
    ).toContainText("4");
    await expect(page.locator("#pace")).toContainText("a Spearman crosses a grass hex in 15 min");
    // The example map: the game's own renderer, with the route's steps and the Spearman's total under it. No horizontal overflow
    // at phone width (expectPlayerPage resized the viewport already).
    const example = page.getByTestId("land-example");
    await expect(example.locator("canvas")).toBeVisible();
    await expect(example.getByTestId("land-example-steps").locator("li")).toHaveCount(9);
    await expect(example.getByTestId("land-example-total")).toContainText("4 h 15 min");
    const box = await example.locator("canvas").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // Wide rivers: with a table of the bridge levels and no admin note about bridges "planned".
    await expect(page.locator('[data-bridge="causeway"]')).toContainText("6");
    await expect(page.locator('[data-bridge="footbridge"]')).toContainText("4");
    await expect(page.locator('[data-bridge="guarded"]')).toContainText("their friends");
    await expect(page.locator("#bridges").getByRole("heading", { name: "Bridges over wide rivers" })).toBeVisible();
    await expect(page.getByText("planned but not in the game")).toHaveCount(0);
  });

  test("ships page compares the Karve and the Longship and hides the admin note", async ({
    page,
  }) => {
    await page.goto("/docs/ships");
    await expectPlayerPage(page, "Ships and water", "ships-table");
    await expect(page.locator('[data-row="attack"]')).toContainText("60");
    await expect(page.locator('[data-row="needs"]')).toContainText("Karve");
    await expect(page.getByText("Under investigation")).toHaveCount(0);
  });

  test("walls page shows the six pieces with stage and facing pickers, the example wall and the hub links to it", async ({
    page,
  }) => {
    await page.goto("/docs");
    await page.getByRole("link", { name: /^Walls/ }).click();
    await expect(page).toHaveURL(/\/docs\/walls$/);

    const cards = page.locator(".walls .tile");
    await expect(cards).toHaveCount(6);
    await expect(
      page.locator(".walls .tile .thumb .animated-building"),
    ).toHaveCount(6);
    for (const id of [
      "straight180",
      "bend60",
      "bend120",
      "gate180",
      "end",
      "end_coast",
    ]) {
      await expect(page.locator(`#piece-${id}`)).toBeVisible();
    }

    // Stages are read off the atlas: the construction site and at least two finished stages.
    const straight = page.locator("#piece-straight180");
    await expect(
      straight.getByRole("button", { name: "Under construction" }),
    ).toBeVisible();
    await expect(
      straight.getByRole("button", { name: "Level 1", exact: true }),
    ).toBeVisible();
    await straight.getByRole("button", { name: "Under construction" }).click();
    await expect(
      straight.getByRole("button", { name: "Under construction" }),
    ).toHaveClass(/active/);
    await straight.getByRole("button", { name: "NW", exact: true }).click();
    await expect(
      straight.getByRole("button", { name: "NW", exact: true }),
    ).toHaveClass(/active/);
    await expect(straight.locator(".animated-building")).toBeVisible();

    // The example wall, drawn by the game's own map renderer, comes before the six-piece showcase,
    // which closes the page after the sieges text.
    await expect(page.locator(".wall-example canvas")).toBeVisible();
    const exampleBox = await page.locator(".wall-example canvas").boundingBox();
    const piecesBox = await straight.boundingBox();
    const siegesBox = await page.locator("#sieges").boundingBox();
    expect(exampleBox!.y).toBeLessThan(piecesBox!.y);
    expect(siegesBox!.y).toBeLessThan(piecesBox!.y);
    await expect(page.getByText("An example: a wall that ends on land")).toHaveCount(0);
    // The four grounds.
    await expect(page.locator(".walls figure.ground")).toHaveCount(4);
    await expect(
      page.getByTestId("wall-movement-diagram").locator("figure"),
    ).toHaveCount(6);
    await expect(
      page.getByTestId("wall-movement-legend").locator("li"),
    ).toHaveCount(11);

    // Sieges are player content now: catapults take one level per won siege, three levels per wall hex.
    const sieges = page.locator("#sieges");
    await expect(sieges.getByRole("heading", { name: "Sieges" })).toBeVisible();
    await expect(sieges.locator("li")).toHaveCount(5);
    await expect(sieges).toContainText("exactly one level");
    await expect(sieges).toContainText("3 levels");
    // The note on what is still not built (fire) stays admin-only.
    await expect(page.locator("#not-built")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Docs", exact: true }).click();
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
test.describe(
  "docs island maps hover under the docs zoom",
  { tag: "@g2" },
  () => {
    const islands = [
      {
        path: "/docs/wasted-lands",
        island: ".wasted-island",
        caption: "island-caption",
        probes: [
          { fx: 0.2, fy: 0.4, name: "Fire-mountain" },
          { fx: 0.5, fy: 0.2, name: "Wasteland" },
        ],
      },
      {
        path: "/docs/bog-lands",
        island: ".bog-island",
        caption: "bog-island-caption",
        probes: [
          { fx: 0.2, fy: 0.4, name: "River" },
          { fx: 0.75, fy: 0.5, name: "Grass" },
        ],
      },
    ];

    for (const width of [1280, 1920]) {
      for (const { path, island, caption, probes } of islands) {
        test(`${path} names the hovered hex at ${width}px wide`, async ({
          page,
          adminAuth,
        }) => {
          // The wasted-lands island is an admin note; the bog island is not.
          if (path === "/docs/wasted-lands")
            await asAdminWithNotes(page, adminAuth);
          await page.setViewportSize({ width, height: 1080 });
          await page.goto(path);
          const mapHost = page.locator(
            `${island} .map-host[data-map-ready="true"]`,
          );
          await mapHost.waitFor();
          await mapHost.scrollIntoViewIfNeeded();

          const box = (await mapHost.boundingBox())!;
          for (const { fx, fy, name } of probes) {
            await page.mouse.move(
              box.x + box.width * fx,
              box.y + box.height * fy,
            );
            await expect(page.getByTestId(caption)).toHaveText(name);
          }
        });
      }
    }
  },
);
