import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { claimLandfall, layoutOverflow, loginTestUser, openRingOnGuidedHex, waitForMapReady } from './helpers';

// Mobile-readiness audit: every one of these was a real defect at phone width
// — the onboarding checklist's third card and the guidance chip clipped past
// the screen edge, the landscape checklist sitting on top of the plot so the
// founding tap never reached the map, and pages running into the screen
// edge. The desktop suite's fixed 1280x800 viewport can't see any of it, so
// these run at a phone size. The in-game header (HudNav/ResourceBar/demo
// badge) at phone width is covered alongside the mobile HUD bar work, not
// here — pages that mount it are left out of the static-pages sweep below.
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'element has no box — not rendered?').not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectNothingOffscreen(page: Page, where: string): Promise<void> {
  const { pageScrollsSideways, offscreen } = await layoutOverflow(page);
  expect(pageScrollsSideways, `${where}: page scrolls sideways`).toBe(false);
  expect(offscreen, `${where}: interactive elements outside the viewport`).toEqual([]);
}

/** Whether the preview plot's own screen point hits the canvas, not an overlay on top of it. */
async function plotHitsCanvas(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const renderer = (
      window as unknown as {
        __settlementRenderer: () => {
          previewCenter?: { q: number; r: number };
          hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
        };
      }
    ).__settlementRenderer();
    const canvas = document.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    const plot = renderer.hexCenterScreen(renderer.previewCenter!);
    return document.elementFromPoint(box.x + plot.x, box.y + plot.y) === canvas;
  });
}

async function expectNoOverlap(a: Locator, b: Locator, what: string): Promise<void> {
  const boxA = (await a.boundingBox())!;
  const boxB = (await b.boundingBox())!;
  const overlaps =
    boxA.x < boxB.x + boxB.width &&
    boxB.x < boxA.x + boxA.width &&
    boxA.y < boxB.y + boxB.height &&
    boxB.y < boxA.y + boxA.height;
  expect(overlaps, what).toBe(false);
}

/**
 * The minimal phone hero (title + one-line facts) must leave the preview
 * island's "click this plot" chip and the demo-mode badge uncovered — the
 * full desktop hero ran into both on a phone.
 */
async function expectHeroClear(page: Page): Promise<void> {
  const settlement = await SettlementPage.openLanding(page);
  const hero = page.locator('.hero--founding');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.lede')).toBeHidden();
  await expectNoOverlap(hero, settlement.guidancePointer.locator('.chip'), 'hero covers the "click this plot" chip');
  const badge = page.locator('.demo-badge');
  if (await badge.isVisible()) await expectNoOverlap(hero, badge, 'hero covers the demo badge');
  await expectInsideViewport(page, hero);
}

/**
 * Where `top` and `under` overlap on screen, the element actually hit there
 * must belong to `top` — i.e. `top` really paints above `under`, not just
 * sits next to it. Fails if they don't overlap at all, so the test can't
 * pass vacuously after a layout change moves them apart.
 */
async function expectPaintsAbove(top: Locator, under: Locator, what: string): Promise<void> {
  const a = (await top.boundingBox())!;
  const b = (await under.boundingBox())!;
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const upper = Math.max(a.y, b.y);
  const lower = Math.min(a.y + a.height, b.y + b.height);
  expect(right > left && lower > upper, `${what}: the two don't overlap, nothing to check`).toBe(true);
  // The HUD bar and its popovers are `pointer-events: none` (only real
  // controls take taps), and elementFromPoint skips such elements. Paint
  // order doesn't depend on pointer-events, so switch hit-testing on for
  // just these two while asking which one is on top.
  const underHandle = await under.elementHandle();
  const hitInsideTop = await top.evaluate(
    (el, args) => {
      const other = args.under as HTMLElement;
      const saved = [(el as HTMLElement).style.pointerEvents, other.style.pointerEvents];
      (el as HTMLElement).style.pointerEvents = 'auto';
      other.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(args.x, args.y);
      [(el as HTMLElement).style.pointerEvents, other.style.pointerEvents] = saved;
      return el.contains(hit);
    },
    { x: (left + right) / 2, y: (upper + lower) / 2, under: underHandle },
  );
  expect(hitInsideTop, what).toBe(true);
}

test.describe('phone layout', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('static pages fit a phone viewport with every control on screen', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // '/leaderboards' and '/guild' render as a modal over the settlement
    // background now (App.vue's modal-route pattern, lib/modalRoute.ts) —
    // covered separately below (modal-routes.spec.ts-style checks) rather
    // than in this plain-page sweep.
    for (const path of ['/login', '/register', '/worlds', '/reports', '/impressum']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNothingOffscreen(page, path);
    }
  });

  test('a directly-loaded leaderboards modal fits a phone viewport with every control on screen', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/leaderboards');
    await page.waitForLoadState('networkidle');
    await expectNothingOffscreen(page, '/leaderboards');
  });

  test('the leaderboards modal keeps a side gutter instead of running its heading into the screen edge', async ({ page }) => {
    await page.goto('/leaderboards');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.x).toBeGreaterThanOrEqual(12);
  });

  test('the minimal landing hero leaves the plot chip and demo badge uncovered', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await expectHeroClear(page);
  });

  test('onboarding overlays stay on screen before and after landfall', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await expectInsideViewport(page, settlement.checklist);
    await expectInsideViewport(page, settlement.guidancePointer.locator('.chip'));
    await expectNothingOffscreen(page, 'landing before founding');

    await settlement.claimLandfall();
    await expect(settlement.banner).toBeVisible();
    await expect(settlement.checklist).toContainText('Step 2 of 3');
    await expectInsideViewport(page, settlement.banner);
    await expectInsideViewport(page, settlement.checklist);
    await expectInsideViewport(page, settlement.guidancePointer.locator('.chip'));
  });
});

test.describe('phone layout, landscape', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE_LANDSCAPE, hasTouch: true, isMobile: true });

  test('the minimal landing hero leaves the plot chip and demo badge uncovered', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await expectHeroClear(page);
  });

  test('the onboarding checklist leaves the landing plot tappable', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/');
    await waitForMapReady(page);

    // The plot's own screen point must hit the canvas, not an overlay sitting
    // on top of it — otherwise the founding tap silently does nothing.
    const hitsCanvas = await plotHitsCanvas(page);
    expect(hitsCanvas).toBe(true);

    await claimLandfall(page);
    await expect(page.getByTestId('onboarding-checklist')).toContainText('Step 2 of 3');
  });
});

test.describe('phone layout, narrow (320px)', { tag: '@g1' }, () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  // The founding tap used to miss at this width (the onboarding overlays
  // sat over the plot); the plot's own screen point must reach the canvas
  // and a tap there must found the settlement.
  test('the founding tap reaches the plot and founds the settlement', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    const hitsCanvas = await plotHitsCanvas(page);
    expect(hitsCanvas).toBe(true);

    await settlement.claimLandfall();
    await expect(settlement.checklist).toContainText('Step 2 of 3');
  });

  test('the minimal landing hero leaves the plot chip and demo badge uncovered', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await expectHeroClear(page);
  });

  // guidance-chip-edge: at 320px the chip used to sit to the side of the
  // arrow (CSS `chipSide`) and ran off the right edge of the viewport once
  // the ring opened frame 3's "This one fits {terrain}" chip near the screen
  // edge.
  test('the guidance chip stays fully on screen once the ring opens', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await openRingOnGuidedHex(settlement);
    await expectInsideViewport(page, settlement.guidancePointer.locator('.chip'));
  });
});

test.describe('phone layout, landscape (667x375)', { tag: '@g1' }, () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  // The corner-docked checklist used to stand ~150px tall here and cover
  // the landfall plot, so the founding tap hit the tray. The plot's own
  // screen point must reach the canvas, and a tap there must found.
  test('the slim checklist leaves the landing plot tappable', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/');
    await waitForMapReady(page);
    expect(await plotHitsCanvas(page)).toBe(true);

    await claimLandfall(page);
    await expect(page.getByTestId('onboarding-checklist')).toContainText('Step 2 of 3');
  });

  // guidance-chip-edge: this short-but-wide viewport is where "centred
  // above the arrow" (the old mobile CSS fallback) pushed the chip up under
  // the HUD bar, off the top of the screen entirely.
  test('the guidance chip stays fully on screen and clear of the HUD bar once the ring opens', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await openRingOnGuidedHex(settlement);
    const chip = settlement.guidancePointer.locator('.chip');
    await expectInsideViewport(page, chip);
    const chipBox = (await chip.boundingBox())!;
    const hudBar = page.locator('.hud-bar');
    if (await hudBar.isVisible()) {
      const hudBarBox = (await hudBar.boundingBox())!;
      expect(chipBox.y).toBeGreaterThanOrEqual(hudBarBox.y + hudBarBox.height - 1);
    }
    // The settlement bubble and demo badge stack in rows under the bar here;
    // the chip must not end up behind them either.
    for (const [selector, what] of [
      ['.settlement-bubble', 'chip covered by the settlement bubble'],
      ['.demo-badge', 'chip covered by the demo badge'],
    ] as const) {
      const overlay = page.locator(selector);
      if (await overlay.isVisible()) await expectNoOverlap(chip, overlay, what);
    }
  });
});

// Mobile tutorial focus (owner decision): on phones, once a settlement is
// founded the top HUD bar (and the settlement-name bubble/pull-down drawer
// it carries) is unmounted entirely for as long as the guided build steps
// are running, so nothing else on screen competes with the tutorial — it
// reappears the moment onboarding completes. The progress checklist itself
// also steps aside while the ring menu is open, since the two would
// otherwise fight for the same strip of screen near the bottom.
test.describe('mobile tutorial focus', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('hides the header for the guided build steps and brings it back on completion', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);

    // Before founding: the pre-founding bar (locale switcher + "I already
    // have a realm") is untouched by this feature.
    await expect(page.locator('.hud-bar')).toBeVisible();

    await settlement.claimLandfall();

    // Once founded, the header (and everything it carries) is gone, not
    // merely hidden — both must be truly absent from the DOM.
    await expect(page.locator('.hud-bar')).toHaveCount(0);
    await expect(page.locator('.settlement-bubble')).toHaveCount(0);

    // On phones the demo badge is a small tag in the bottom-left corner,
    // well away from the landfall banner at the top.
    const badge = page.locator('.demo-badge');
    if (await badge.isVisible()) {
      const badgeBox = (await badge.boundingBox())!;
      expect(badgeBox.x, 'demo tag should hug the left edge').toBeLessThan(12);
      expect(badgeBox.y + badgeBox.height, 'demo tag should hug the bottom edge').toBeGreaterThan(PHONE.height - 30);
      await expect(settlement.banner).toBeVisible();
      await expectNoOverlap(settlement.banner, badge, 'demo badge covers the landfall banner');
    }

    // Opening the ring on a guided hex hides the progress checklist so it
    // doesn't fight the ring for the same strip of screen.
    const target = await settlement.findHex({ terrain: 'grass' });
    await settlement.clickHex(target);
    await settlement.ring.waitForOpen();
    await expect(settlement.checklist).toHaveCount(0);

    // Closing the ring (Escape) brings the checklist straight back.
    await page.keyboard.press('Escape');
    await expect(settlement.checklist).toBeVisible();

    // Completing onboarding brings the header back.
    await settlement.placeGuidedBuildings();
    await expect(page.locator('.hud-bar')).toBeVisible();
  });
});

// z-layering: the phone settlement bubble is a fixed layer outside the HUD
// bar. It used to sit at z 41 and painted over the bar's own popovers
// (ProfileNudge) and over the open queue drawer.
test.describe('phone overlay layering', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('the profile nudge paints above the settlement bubble', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await settlement.placeGuidedBuildings();
    await expect(settlement.profileNudge).toBeVisible();

    await expectPaintsAbove(settlement.profileNudge, page.locator('.settlement-bubble'), 'settlement bubble paints over the profile nudge');
  });

  test('the open queue drawer paints above the settlement bubble', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    // Any queued order mounts the drawer (see queue-drawer.spec.ts's seed).
    await page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => any }).__demoWorld();
      world.hud.garrison = [{ unit: 'spearman', count: 5 }];
      world.hud.tick += 1;
      world.syncHud();
    });
    await page.locator('.queue-drawer-handle').click();
    const panel = page.locator('.queue-drawer-panel');
    await expect(page.locator('#queue-drawer-body')).toHaveAttribute('aria-hidden', 'false');

    await expectPaintsAbove(panel, page.locator('.settlement-bubble'), 'settlement bubble paints over the open queue drawer');
  });
});

// Leaderboards/guild-as-modal (owner decision): both open as a modal over
// whatever page is currently showing, exactly like the profile modal — see
// App.vue's modal-route pattern and lib/modalRoute.ts.
test.describe('leaderboards/guild open as modals on a phone', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('opening Leaderboards from the drawer shows the modal over the map, and closing returns to a bare /settlement', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    // Leaderboards is gated on auth.isAuthenticated (HudNav.vue) — see
    // leaderboard.spec.ts's own "is reachable via the HUD nav link" test.
    await loginTestUser(page);
    await SettlementPage.found(page);

    await page.locator('.hud-grip').click();
    await page.getByRole('button', { name: 'Leaderboards' }).click();
    await expect(page).toHaveURL(/\/leaderboards$/);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
    // The map underneath is still there, not unmounted/remounted.
    await expect(page.locator('canvas')).toBeVisible();

    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/\/settlement$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('opening Guild from the drawer shows the modal over the map, and closing returns to a bare /settlement', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    await page.locator('.hud-grip').click();
    await page.getByRole('button', { name: 'Alliance' }).click();
    await expect(page).toHaveURL(/\/guild$/);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Guild', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();

    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/\/settlement$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a direct load of /leaderboards shows the modal over the settlement fallback background', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/leaderboards');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
  });
});
