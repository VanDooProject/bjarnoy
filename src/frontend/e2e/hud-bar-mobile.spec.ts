// Mobile-only HUD bar: collapsed pills cycle stock/rate/max, the collapsed
// bar pulls down into a drawer (Android-notification-shade style), and a
// stored top/bottom docking preference is honoured. Desktop gets none of
// this — see the final test.
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { loginTestUser } from './helpers';
import { SettlementPage } from './pages';

test.describe('mobile HUD bar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('tapping any collapsed pill cycles ALL pills together, fill bar always visible', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    const pills = page.locator('.resource-bar .resource--compact');
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

    // A tap on a *different* pill still advances the one shared stage.
    await stone.click();
    await expect(wood.locator('.value-compact')).toContainText('max');
    await expect(stone.locator('.value-compact')).toContainText('max');
    await expect(wood.locator('.fill-track')).toBeVisible();

    await wood.click();
    await expect(wood.locator('.value-compact')).not.toContainText('/h');
    await expect(wood.locator('.value-compact')).not.toContainText('max');
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
    await expect(page.locator('.resource-bar.expanded')).toBeVisible();
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
    await expect(page.locator('.resource-bar .resource--compact').first()).toBeVisible();
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
});

test('desktop renders no compact pills and no drag grip', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await loginTestUser(page);
  await SettlementPage.found(page);

  await expect(page.locator('.resource--compact')).toHaveCount(0);
  await expect(page.locator('.hud-grip')).toHaveCount(0);
  await expect(page.locator('.hud-bar')).not.toHaveClass(/hud-bar--bottom/);
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
