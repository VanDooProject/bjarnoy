// Mobile-only HUD bar: collapsed pills cycle stock/rate/max, the collapsed
// bar pulls down into a drawer (Android-notification-shade style), and a
// stored top/bottom docking preference is honoured. Desktop gets none of
// this — see the final test.
//
// Mobile HUD bar rework, phase 2 (owner's annotated screenshot): the
// chevron and the avatar/account-menu leave every phone bar entirely (a
// thin drag handle, `.hud-grip`, replaces the chevron — Profile/Log out move
// into the drawer's own account section); the anonymous ReturningPlayerMenu
// trigger only moves into the drawer on a bar that also carries
// ResourceBar (in-game), since that's the one case it would push pills
// off — everywhere else (docs-style pages) it stays inline, just shrunk to
// a single compact line. Pills themselves must never be half-cut: the old
// horizontal scroller is gone, and each pill's fill-track can never be wider
// than the numbers text above it.
//
// Mobile HUD bar rework, phase 3 (owner's decision): the row must never wrap
// onto a second line either — a wrapped population pill at 320px with the
// drawer open was flagged as bad, not fixed by giving it more room. With no
// second line to fall back to, the row instead switches every pill to short
// "k"/"M" notation together (`lib/hud/compactNumber.ts`) once full notation
// genuinely doesn't fit, and pills spread evenly across the bar's full width
// (centred within their own equal-width slot) instead of packing to the
// left.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { loginTestUser } from './helpers';
import { SettlementPage } from './pages';

/**
 * ResourceBar.vue mounts a second, hidden `.resource-bar` alongside the real
 * one purely to measure whether full notation would fit (`data-measure` on
 * its root) — off-screen (`position: fixed`, far outside the viewport) and
 * `aria-hidden`/`inert`, but still real DOM sharing the same classes, so
 * every locator below that means "the pills the player actually sees" has
 * to exclude it explicitly or it silently doubles counts and pulls
 * bounding-box assertions off into space.
 */
const REAL_BAR = '.resource-bar:not([data-measure])';

/**
 * Every `.resource-bar .resource` box must lie fully inside `.hud-bar`
 * horizontally (never half-cut), and the pill row itself must not scroll or
 * wrap — a single row, always. Shared by the collapsed and drawer-open
 * (expanded) checks below, at every phone width this spec cares about.
 */
async function expectPillsNotClipped(page: Page): Promise<void> {
  const bar = await page.locator('.hud-bar').boundingBox();
  const row = page.locator(REAL_BAR);
  const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const pills = page.locator(`${REAL_BAR} .resource`);
  const count = await pills.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const pillBox = await pills.nth(i).boundingBox();
    expect(pillBox).not.toBeNull();
    expect(pillBox!.x).toBeGreaterThanOrEqual(bar!.x - 1);
    expect(pillBox!.x + pillBox!.width).toBeLessThanOrEqual(bar!.x + bar!.width + 1);
  }
}

/** Each pill's `.fill-track` must never be wider than its own `.numbers`/`.numbers-compact` text above it. */
async function expectFillTracksMatchNumbers(page: Page): Promise<void> {
  const pills = page.locator(`${REAL_BAR} .resource`);
  const count = await pills.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const pill = pills.nth(i);
    const trackBox = (await pill.locator('.fill-track').boundingBox())!;
    const numbersBox = (await pill.locator('.numbers, .numbers-compact').boundingBox())!;
    expect(trackBox.width).toBeLessThanOrEqual(numbersBox.width + 1);
  }
}

/** Owner's decision, phase 3: the row must never wrap — every pill's own top edge must land on the same line. */
async function expectSingleRow(page: Page): Promise<void> {
  const pills = page.locator(`${REAL_BAR} .resource`);
  const count = await pills.count();
  expect(count).toBeGreaterThan(1);
  const tops = await Promise.all(
    Array.from({ length: count }, (_, i) => pills.nth(i).boundingBox().then((box) => box!.y)),
  );
  const first = tops[0];
  for (const top of tops) expect(top).toBeCloseTo(first, 0);
}

/**
 * Owner: pills evenly distributed across the bar's full width — the same
 * visible gap before the first pill, between every pair, and after the last
 * (the row is `justify-content: space-evenly`), and never so small that the
 * pills read as stuck together (the row switches to short notation, and as
 * a last resort a smaller font, before that happens).
 */
async function expectPillsEvenlySpaced(page: Page): Promise<void> {
  const gaps = await page.locator(REAL_BAR).evaluate((row) => {
    const r = row.getBoundingClientRect();
    const pills = Array.from(row.children).map((el) => el.getBoundingClientRect());
    const out = [pills[0].left - r.left];
    for (let i = 1; i < pills.length; i++) out.push(pills[i].left - pills[i - 1].right);
    out.push(r.right - pills[pills.length - 1].right);
    return out;
  });
  expect(gaps.length).toBeGreaterThan(2);
  // Evenly spread *across the screen*, not just within the row: the row's
  // own box can end short of the bar (a leftover empty element beside it
  // once pushed the pills left of centre while their in-row gaps still
  // looked perfectly even), so also require the first pill's distance from
  // the screen's left edge to match the last pill's from the right edge.
  const screen = await page.locator(REAL_BAR).evaluate((row) => {
    const pills = Array.from(row.children).map((el) => el.getBoundingClientRect());
    return { left: pills[0].left, right: window.innerWidth - pills[pills.length - 1].right };
  });
  expect(Math.abs(screen.left - screen.right), `screen edges L=${Math.round(screen.left)} R=${Math.round(screen.right)}`).toBeLessThanOrEqual(2);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  expect(max - min, `gaps ${gaps.map(Math.round).join(',')}`).toBeLessThanOrEqual(2);
  expect(min, `gaps ${gaps.map(Math.round).join(',')}`).toBeGreaterThanOrEqual(6);
}

test.describe('mobile HUD bar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('tapping any collapsed pill cycles ALL pills together, fill bar always visible', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const pills = page.locator(`${REAL_BAR} .resource--compact`);
    await expect(pills.first()).toBeVisible();

    const wood = pills.nth(0);
    const stone = pills.nth(1);

    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).toContainText('/h');
    // Tapping wood switched stone too — they move together, in sync.
    await expect(stone.locator('.value-compact')).toContainText('/h');
    await expect(wood.locator('.fill-track')).toBeVisible();

    // A tap on a *different* pill still advances the one shared stage — the
    // cap stage now reads the same "/{n}" the expanded view's cap line
    // shows (owner's call), not a "max ..." label.
    await stone.click();
    await expect(wood.locator('.value-compact')).toContainText('/');
    await expect(stone.locator('.value-compact')).toContainText('/');
    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.value-compact')).not.toContainText('/');
  });

  test('dragging the collapsed bar down opens the pull-down drawer, dragging up closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    const box = (await bar.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 220, { steps: 10 });
    await page.mouse.up();

    // Assert on the drawer's own actual height, not its content's mere
    // presence in the DOM — a child inside `overflow: hidden` still reports
    // a non-zero bounding box to Playwright's visibility check even while
    // the parent has clipped it down to 0, which would make this pass
    // whether or not the drag actually opened anything.
    await expect(async () => {
      const openBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(openBox.height).toBeGreaterThan(100);
    }).toPass();
    await expect(page.locator('.hud-drawer .drawer-links')).toBeVisible();
    // ResourceBar's pills switch to their expanded (desktop-style stacked)
    // rendering while the drawer is open, instead of the collapsed
    // single-line cycle — that stacked content happens to still fit inside
    // the same 64px bar with room to spare, so the bar's own height is not
    // guaranteed to grow (TopBar.vue's dynamic height measurement is a
    // safety net for if it ever doesn't, not something to assert on here).
    // Finding E-g: a plain `expandedBarBox.height >= box.height` here would
    // be vacuously true (the bar can only grow, never shrink, once the
    // drawer opens) and catch nothing — assert on the actual expanded
    // markup/class instead.
    const expandedBarBox = (await page.locator('.hud-bar').boundingBox())!;
    await expect(page.locator(`${REAL_BAR}.expanded`)).toBeVisible();
    await expect(page.locator('.resource--compact')).toHaveCount(0); // expanded, not the single-line cycle
    await expect(page.locator('.hud-bar .resource .rate').first()).toBeVisible();

    // Closing drags from within the now-open drawer itself, not from the
    // collapsed bar's own position — the bar (and its grip) stays pinned to
    // the screen's physical top edge even while open, so there is no room
    // above it to keep dragging "up" from there (exactly like a real
    // fingertip can't move past the top bezel). The open drawer has real
    // travel space below the bar instead.
    const openBox = (await page.locator('.hud-drawer').boundingBox())!;
    const closeX = openBox.x + openBox.width / 2;
    const closeStartY = openBox.y + openBox.height - 20;
    await page.mouse.move(closeX, closeStartY);
    await page.mouse.down();
    await page.mouse.move(closeX, expandedBarBox.y + expandedBarBox.height + 4, { steps: 10 }); // up to just under the (expanded) bar
    await page.mouse.up();

    // Closed height is a hairline border, not necessarily an exact "0px" —
    // what matters is the drawer container itself has collapsed back down
    // (its content is clipped by `overflow: hidden`, see TopBar.vue).
    await expect(async () => {
      const closedBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(closedBox.height).toBeLessThanOrEqual(2);
    }).toPass();
    // The bar itself shrinks back down and the single-line cycle returns.
    await expect(async () => {
      const collapsedBarBox = (await page.locator('.hud-bar').boundingBox())!;
      expect(collapsedBarBox.height).toBeCloseTo(box.height, 0);
    }).toPass();
    await expect(page.locator(`${REAL_BAR} .resource--compact`).first()).toBeVisible();
  });

  test('releasing short of the open threshold snaps the drawer back closed', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    const box = (await bar.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 20, { steps: 5 }); // well short of the ~30% threshold
    await page.mouse.up();

    await expect(async () => {
      const closedBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(closedBox.height).toBeLessThanOrEqual(2);
    }).toPass();
  });

  test('a stored bottom docking preference lands the bar at the bottom edge, clear of ArmyPanel', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.addInitScript(() => window.localStorage.setItem('bjarnoy.hudBarPosition', 'bottom'));
    await loginTestUser(page);
    await SettlementPage.found(page);

    const bar = page.locator('.hud-bar');
    await expect(bar).toHaveClass(/hud-bar--bottom/);

    const barBox = (await bar.boundingBox())!;
    expect(barBox.y).toBeGreaterThan(700); // near the bottom of an 844px-tall viewport

    // RealmPanel was removed on main (zoom now drives settlement<->world
    // switching); ArmyPanel is the panel that now sits bottom-right and must
    // still clear a bottom-docked bar via the same --hud-inset-bottom.
    const armyBox = (await page.locator('.army-panel.status-card').boundingBox())!;
    expect(armyBox.y + armyBox.height).toBeLessThanOrEqual(barBox.y);
  });

  // Owner's annotated screenshot: the chevron and the avatar/account trigger
  // must not be in the in-game phone bar at all, and no pill may sit
  // half-cut at the bar's edge — see this file's own top-of-file comment.
  test('the in-game phone bar is resource pills only: no avatar, no account trigger, no locale switcher, a clear grip handle', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    // All three stay mounted (HudNav.vue/LocaleSwitcher.vue hide them with a
    // plain CSS media query, not a `v-if`) — a DOM-presence check like
    // `toHaveCount(0)` would pass for the wrong reason here, so assert on
    // actual visibility instead (same reasoning as the existing "no page
    // shows the language switcher outside the drawer" test below).
    await expect(page.locator('.hud-bar .account-menu')).toBeHidden();
    await expect(page.locator('.hud-bar .returning-player-menu')).toBeHidden();
    await expect(page.locator('.hud-bar .locale-switcher')).toBeHidden();

    const grip = page.locator('.hud-grip');
    await expect(grip).toBeVisible();
    const gripBox = (await grip.boundingBox())!;
    const pills = page.locator(`${REAL_BAR} .resource`);
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const pillBox = (await pills.nth(i).boundingBox())!;
      const overlaps = !(
        gripBox.x + gripBox.width <= pillBox.x
        || pillBox.x + pillBox.width <= gripBox.x
        || gripBox.y + gripBox.height <= pillBox.y
        || pillBox.y + pillBox.height <= gripBox.y
      );
      expect(overlaps, `grip must not overlap pill ${i}`).toBe(false);
    }

    await grip.click();
    await expect(async () => {
      const openBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(openBox.height).toBeGreaterThan(100);
    }).toPass();
  });

  test('collapsed pills fit fully inside the bar with no clipping or scrolling, and fill-tracks never overhang their numbers', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    await expectPillsNotClipped(page);
    await expectFillTracksMatchNumbers(page);
    await expectSingleRow(page);
    await expectPillsEvenlySpaced(page);

    // Same checks again once the drawer is open, where ResourceBar switches
    // every pill to its expanded (stacked value/rate/fill) rendering.
    await page.locator('.hud-grip').click();
    await expect(page.locator(`${REAL_BAR}.expanded`)).toBeVisible();
    await expectPillsNotClipped(page);
    await expectFillTracksMatchNumbers(page);
    await expectSingleRow(page);
    await expectPillsEvenlySpaced(page);
  });

  // Owner: short notation only *when needed*. At the suite's default 390px
  // width the default demo numbers fit in full with an even gap in every
  // stage and in the drawer-open row, so nothing may be abbreviated there
  // (a regression that always abbreviates would fail here); short notation
  // itself is exercised below with seeded large numbers at 320px.
  test('at 390px the default numbers stay in full notation in every stage', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const row = page.locator(REAL_BAR);
    const wood = page.locator(`${REAL_BAR} .resource--compact`).nth(0);
    await expect(row).not.toContainText(/\d(k|M)\b/);
    await wood.click(); // rate
    await expect(wood.locator('.value-compact')).toContainText('/h');
    await expect(row).not.toContainText(/\d(k|M)\b/);
    await wood.click(); // cap
    await expect(wood.locator('.value-compact')).toContainText('/3,000');
    await expectPillsEvenlySpaced(page);

    await page.locator('.hud-grip').click();
    await expect(page.locator(`${REAL_BAR}.expanded`)).toBeVisible();
    await expect(page.locator(`${REAL_BAR} .resource`).first().locator('.cap')).toContainText('/3,000');
    await expectPillsEvenlySpaced(page);
  });

  test('drawer account section: logged in shows Profile + Log out, Profile navigates', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    await page.locator('.hud-grip').click();
    const profile = page.locator('[data-testid="drawer-account-profile"]');
    const logout = page.locator('[data-testid="drawer-account-logout"]');
    await expect(profile).toBeVisible();
    await expect(logout).toBeVisible();

    await profile.click();
    await expect(page).toHaveURL('/profile');
  });

  test('drawer account section: anonymous shows the log-in entry (the trigger itself stays out of this bar)', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page); // anonymous — no loginTestUser

    await expect(page.locator('.hud-bar .returning-player-menu')).toBeHidden();
    await page.locator('.hud-grip').click();
    await expect(page.locator('[data-testid="drawer-account-login"]')).toBeVisible();
    await expect(page.locator('[data-testid="drawer-account-worlds"]')).toBeVisible();
  });
});

// [BUG] `SettlementPage.found`'s landfall click (helpers.ts's
// `claimLandfall`, which asks the renderer for the preview plot's own screen
// coordinate rather than guessing one) times out waiting for
// `__demoWorld().selectedSettlementId` at a 320px-wide viewport — it
// reproduces identically on `main`/this branch's own pre-existing code, with
// none of this PR's HUD-bar changes applied, so it's a real, separate bug in
// the founding flow at that width, not something this spec should paper
// over or fix inline. Founding at the suite's usual 390px width (where it
// works) and resizing down afterward is not a workaround for that bug —
// these tests' own job is only to check the HUD bar's own pill layout at a
// narrow width, not to re-prove founding works at every width, and this way
// the bar still genuinely renders/measures at that width, same as if
// founding itself had happened there.
for (const width of [375, 320]) {
  test.describe(`mobile HUD bar at a narrower phone width (${width}px)`, () => {
    test('collapsed and drawer-open pills still fit fully inside the bar, in a single row, evenly spaced, with no clipping, scrolling, or fill-track overhang', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await loginTestUser(page);
      await SettlementPage.found(page);
      await page.setViewportSize({ width, height: 568 });

      await expectPillsNotClipped(page);
      await expectFillTracksMatchNumbers(page);
      await expectSingleRow(page);
      await expectPillsEvenlySpaced(page);

      await page.locator('.hud-grip').click();
      await expect(page.locator(`${REAL_BAR}.expanded`)).toBeVisible();
      await expectPillsNotClipped(page);
      await expectFillTracksMatchNumbers(page);
      await expectSingleRow(page);
      await expectPillsEvenlySpaced(page);
    });
  });
}

test.describe('mobile HUD bar short notation', () => {
  test('seeding very large resources forces short "k"/"M" notation at 320px, and the row still fits on one line', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    const settlement = await SettlementPage.found(page);
    await settlement.setStorageCaps({ wood: 36_000_000, stone: 20_000_000, food: 40_000_000, iron: 10_000_000 });
    await settlement.setResources({ wood: 12_345_678, stone: 9_800_000, food: 15_200_000, iron: 4_300_000 });
    await page.setViewportSize({ width: 320, height: 568 });

    const pills = page.locator(`${REAL_BAR} .resource--compact`);
    // Stock stage (default) — a full "12,345,678" would never fit a 320px
    // pill, so this alone pins that the switch actually happened.
    await expect(pills.first().locator('.value-compact')).toContainText(/[kM]/);
    await expectPillsNotClipped(page);
    await expectFillTracksMatchNumbers(page);
    await expectSingleRow(page);

    await pills.first().click(); // rate
    await pills.first().click(); // cap
    await expect(pills.first().locator('.value-compact')).toContainText(/\/[\d.,]+[kM]/);

    await page.locator('.hud-grip').click();
    await expect(page.locator(`${REAL_BAR}.expanded`)).toBeVisible();
    const expandedWood = page.locator(`${REAL_BAR} .resource`).first();
    await expect(expandedWood.locator('.value')).toContainText(/[kM]/);
    await expect(expandedWood.locator('.cap')).toContainText(/\/[\d.,]+[kM]/);
    await expectPillsNotClipped(page);
    await expectFillTracksMatchNumbers(page);
    await expectSingleRow(page);
  });
});

test('desktop renders no compact pills and no drag grip; the account menu stays inline in HudNav', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await loginTestUser(page);
  await SettlementPage.found(page);

  await expect(page.locator('.resource--compact')).toHaveCount(0);
  await expect(page.locator('.hud-grip')).toHaveCount(0);
  await expect(page.locator('.hud-bar')).not.toHaveClass(/hud-bar--bottom/);
  // Owner's annotated screenshot only asked for these gone on a phone —
  // desktop keeps the avatar inline in HudNav exactly as before.
  await expect(page.locator('.hud-nav .account-menu')).toBeVisible();
});

// Group E (a): desktop — a dropdown anywhere inside the bar must be
// genuinely hit-testable, not merely present in the DOM under a clipped
// scroller (finding #1's own regression), and HudNav must still hug the
// bar's right edge on desktop (finding #2's own regression).
test.describe('desktop dropdowns and nav alignment', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ReturningPlayerMenu opens and its panel is actually hit-testable at its own centre', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/');
    await page.locator('[data-testid="returning-player-trigger"]').click();

    const menu = page.locator('[data-testid="returning-player-menu"]');
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Finding #1: `.hud-bar-scroll`'s `overflow-x: auto` used to clip this
    // panel to the scroller's own ~30px height — it would still report a
    // non-zero bounding box (a clipped element's box is unaffected), so the
    // real regression check is whether the point at its own centre actually
    // hit-tests inside it, not merely that Playwright can compute a box for
    // it.
    const hitInsideMenu = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid="returning-player-menu"]'),
      centre,
    );
    expect(hitInsideMenu).toBe(true);
  });

  test('HudNav sits flush against the bar\'s right edge, not packed against the middle', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // A docked page (docs hub) is the simplest way to get a bare
    // TopBar+HudNav on screen with nothing else contending for the row.
    await page.goto('/docs');

    const bar = page.locator('.hud-bar');
    const nav = page.locator('.hud-nav');
    await expect(nav).toBeVisible();
    const barBox = (await bar.boundingBox())!;
    const navBox = (await nav.boundingBox())!;

    // `.hud-bar` has 20px of horizontal padding (see its own `padding: 0
    // 20px`) — finding #2's regression packed HudNav against the *left*
    // side of the trailing flex box instead of the bar's own right edge, so
    // this would have failed by hundreds of pixels, not a rounding error.
    const rightGap = barBox.x + barBox.width - (navBox.x + navBox.width);
    expect(rightGap).toBeLessThanOrEqual(21);
  });
});

// Group E (b)/(c)/(d): the drawer now exists wherever HudNav does (finding
// #8), not just on the in-game map, and must behave correctly there too.
test.describe('mobile HUD drawer on non-map pages', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('on /docs: the grip opens the drawer, its nav links are visible, and tapping one navigates', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/docs');

    // Finding #10: a docs page names itself via `title` and must never get
    // the in-game settlement bubble ("Docs · Lv 1 · 0 hexes").
    await expect(page.locator('.settlement-bubble')).toHaveCount(0);

    const grip = page.locator('.hud-grip');
    await expect(grip).toBeVisible();
    await grip.tap();

    const drawerLinks = page.locator('.hud-drawer .drawer-links .link');
    await expect(drawerLinks.first()).toBeVisible();

    // Finding #8: MobileHudDrawer gained the Home/Landing link that was
    // previously missing entirely — tapping it must actually navigate.
    await page.getByRole('button', { name: 'Landing' }).tap();
    await expect(page).toHaveURL('/');
  });

  // Owner's clarification: a bar with no ResourceBar (every docs-style page)
  // keeps the anonymous ReturningPlayerMenu trigger inline instead of moving
  // it into the drawer — only an in-game bar (ResourceBar present) does
  // that, since only there would the trigger push pills off. The avatar
  // still leaves every phone bar regardless of ResourceBar.
  test('on /docs: the returning-player trigger stays in the bar (compact), and the title still has room', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/docs');

    const trigger = page.locator('.hud-bar [data-testid="returning-player-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(page.locator('.hud-bar .account-menu')).toHaveCount(0);

    // Not crushed to a single-letter ellipsis: with the avatar/chevron gone
    // and the trigger shrunk to one compact line, "Docs" fits with room to
    // spare — its own scrollWidth must not exceed what's actually rendered.
    const title = page.locator('.mobile-title-text');
    await expect(title).toHaveText('Docs');
    const overflow = await title.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // A longer title (vs. "Docs") makes the "not crushed" regression concrete:
  // /showcase's "Bjarnoy" is exactly the kind of title that used to get
  // ellipsis-cut down to "B…" once the avatar + chevron ate the row's width.
  test('on /showcase: a longer title still renders in full next to the compact trigger', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/showcase');

    await expect(page.locator('.hud-bar [data-testid="returning-player-trigger"]')).toBeVisible();
    const title = page.locator('.mobile-title-text');
    await expect(title).toHaveText('Bjarnoy');
    const overflow = await title.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // On a phone the language switcher never sits in a bar — the locale
  // already follows the browser, and the bar has no room for it. Every
  // mount outside the HUD drawer hides itself at phone width.
  test('no page shows the language switcher outside the drawer', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    for (const path of ['/', '/login', '/register', '/worlds', '/reports', '/impressum', '/docs', '/tech-tree']) {
      await page.goto(path);
      // Mounted (so this can't pass just because the page hadn't rendered
      // yet), but not shown.
      await expect(page.locator('.locale-switcher:not(.in-drawer)').first(), path).toBeAttached();
      await expect(page.locator('.locale-switcher:not(.in-drawer):visible'), path).toHaveCount(0);
    }
  });

  test('the drawer carries the language switcher, and it switches the locale', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/docs');
    await page.locator('.hud-grip').tap();

    const switcher = page.locator('.hud-drawer .locale-switcher');
    await expect(switcher).toBeVisible();
    await switcher.getByRole('button', { name: 'DE' }).tap();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('the pre-founding landing page gets no grip at all', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/');
    await expect(page.locator('.hud-grip')).toHaveCount(0);
    await expect(page.locator('.hud-drawer')).toHaveCount(0);
  });

  test('after a mouse-drag opens the drawer, the very first tap on a link inside navigates', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    // Findings #5/#6: a drag's own follow-up synthetic click used to be
    // left unsuppressed on the bar (only the open drawer swallowed it), and
    // touch drags in particular left `suppressNextClick` stuck true with
    // nothing to ever clear it, either of which could eat this first tap.
    const bar = page.locator('.hud-bar');
    const box = (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 220, { steps: 10 });
    await page.mouse.up();

    await expect(async () => {
      const openBox = (await page.locator('.hud-drawer').boundingBox())!;
      expect(openBox.height).toBeGreaterThan(100);
    }).toPass();

    await page.getByRole('button', { name: /Reports/ }).first().click();
    await expect(page).toHaveURL(/\/reports/);
  });
});

// Group E (e): DemoModeBadge and the settlement bubble must never overlap —
// finding #13's own regression ("Docs · Lv 1 · 0 hexes"-style badge sitting
// on top of "Lv 1 · 17 hexes").
test('demo badge never overlaps the settlement bubble on a phone settlement view', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginTestUser(page);
  await SettlementPage.found(page);

  const badge = page.locator('.demo-badge');
  const bubble = page.locator('.settlement-bubble');
  await expect(badge).toBeVisible();
  await expect(bubble).toBeVisible();

  const badgeBox = (await badge.boundingBox())!;
  const bubbleBox = (await bubble.boundingBox())!;
  const overlaps = !(
    badgeBox.x + badgeBox.width <= bubbleBox.x
    || bubbleBox.x + bubbleBox.width <= badgeBox.x
    || badgeBox.y + badgeBox.height <= bubbleBox.y
    || bubbleBox.y + bubbleBox.height <= badgeBox.y
  );
  expect(overlaps).toBe(false);
});

// Group E (f): a bottom-docked bar must not cover the queue rail — finding
// #12's own regression (QueueDrawer never read `--hud-inset-bottom`).
test('bottom docking clears the QueueDrawer rail', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem('bjarnoy.hudBarPosition', 'bottom'));
  await loginTestUser(page);
  await SettlementPage.found(page);

  // A minimal seed (mirrors queue-drawer.spec.ts's own seedQueues) — just
  // enough for QueueDrawer to actually mount its rail (it renders nothing
  // at all when there's no queue/garrison/guest to show, per its own
  // `hasAnything` guard).
  await page.evaluate(() => {
    const world = (
      window as unknown as {
        __demoWorld: () => {
          hud: { queueFetchedAt: number; queue: unknown[]; construction: { slots: number; slotsUsed: number; maxWaitingOrders: number; waitingOrders: number; maxOrdersPerHex: number }; tick: number };
          selectedSettlementId: string;
          model: { getSettlement: (id: string) => { q: number; r: number } };
          syncHud: () => void;
        };
      }
    ).__demoWorld();
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      {
        id: 'seed',
        q: settlement.q + 1,
        r: settlement.r,
        building: 'farm',
        targetLevel: 2,
        state: 'building',
        slotCost: 1,
        completesAtGameTime: new Date(Date.now() + 500_000).toISOString(),
        completesInSeconds: 500,
        totalSeconds: 500,
      },
    ];
    world.hud.construction = { slots: 3, slotsUsed: 1, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1 };
    world.hud.tick += 1;
    world.syncHud();
  });

  const bar = page.locator('.hud-bar');
  await expect(bar).toHaveClass(/hud-bar--bottom/);
  const rail = page.locator('.queue-drawer-rail');
  await expect(rail).toBeVisible();

  const barBox = (await bar.boundingBox())!;
  const railBox = (await rail.boundingBox())!;
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(barBox.y);
});
