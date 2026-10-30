// The mobile HUD drawer driven by real touch input, not the mouse.
//
// hud-bar-mobile.spec.ts drags the bar with `page.mouse`, which never
// exercised what made touch drags fail on phones: a touch pointer is
// implicitly captured by whatever it goes down on (a pill's `.fill`, a nav
// link), so useHudDrawer moving the capture to the bar at arm time fires a
// `lostpointercapture` on that child, which bubbled up to the bar's own
// listener and cancelled the drag. Mouse pointers have no implicit capture,
// so every mouse-driven spec stayed green while no phone could drag the
// drawer open. Closing had a second, separate cause: the drawer's own
// scroll container (`.hud-drawer-scroll`) starts a fresh `touch-action`
// scope, so a finger on overflowing drawer content was claimed by the
// browser's native pan (`pointercancel`) instead of dragging the drawer.
// These drive Chromium's real touch pipeline through CDP
// (`Input.dispatchTouchEvent`), so implicit capture, `touch-action` and
// pointercancel all behave as they do on a device.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { loginTestUser } from './helpers';
import { SettlementPage } from './pages';

// DOM and game state only: water pixels cannot change these results (see `mapLayers` in fixtures.ts).
test.use({
  mapLayers: { water: false },
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

/** One finger from (x, fromY) to (x, toY) in `steps` moves, then lifted. */
async function touchDrag(page: Page, x: number, fromY: number, toY: number, steps = 12): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: fromY }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: fromY + ((toY - fromY) * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}

async function drawerHeight(page: Page): Promise<number> {
  return (await page.locator('.hud-drawer').boundingBox())?.height ?? 0;
}

async function expectDrawerOpen(page: Page): Promise<void> {
  await expect.poll(() => drawerHeight(page)).toBeGreaterThan(100);
  await expect(page.locator('.hud-grip')).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Before a drag laid out from the open drawer's box: wait until its open
 * transition (TopBar.vue's inline `height 180ms ease`) has finished, so the
 * box is the resting one rather than a frame of the animation.
 */
async function waitDrawerSettled(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.hud-drawer').evaluate((el) => el.getAnimations().length)).toBe(0);
}

async function expectDrawerClosed(page: Page): Promise<void> {
  await expect.poll(() => drawerHeight(page)).toBeLessThanOrEqual(2);
  await expect(page.locator('.hud-grip')).toHaveAttribute('aria-expanded', 'false');
}

test.describe('mobile HUD drawer, touch', () => {
  test('a touch drag down from a resource pill opens the drawer, a touch drag up from a button inside closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    // Start on a pill's own fill track: a child element, so the finger is
    // implicitly captured by something other than the bar.
    const pill = (await page.locator('.resource-bar:not([data-measure]) .resource').nth(1).boundingBox())!;
    const bar = (await page.locator('.hud-bar').boundingBox())!;
    await touchDrag(page, pill.x + pill.width / 2, pill.y + pill.height / 2, bar.y + bar.height + 260);
    await expectDrawerOpen(page);
    await waitDrawerSettled(page);

    // Close from the lowest button inside the open drawer (again a child
    // that holds the implicit capture), up to just under the bar: a long
    // drag, so it closes on distance alone and never relies on the release
    // happening to count as a flick.
    const start = await page.locator('.hud-drawer').evaluate((drawer) => {
      const box = drawer.getBoundingClientRect();
      const inside = Array.from(drawer.querySelectorAll('button, a'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top >= box.top && r.bottom <= box.bottom - 4);
      const lowest = inside.reduce((a, b) => (b.top > a.top ? b : a));
      return {
        x: lowest.left + lowest.width / 2,
        y: lowest.top + lowest.height / 2,
      };
    });
    const openBar = (await page.locator('.hud-bar').boundingBox())!;
    expect(start.y - (openBar.y + openBar.height)).toBeGreaterThan(250);
    await touchDrag(page, start.x, start.y, openBar.y + openBar.height + 4);
    await expectDrawerClosed(page);
    // The drag must not have turned into a tap on the button it started on.
    await expect(page).toHaveURL(/\/settlement$/);
  });

  test('a touch tap on the grip still toggles, and the first tap inside after a touch drag navigates', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    await page.locator('.hud-grip').tap();
    await expectDrawerOpen(page);
    await page.locator('.hud-grip').tap();
    await expectDrawerClosed(page);

    const bar = (await page.locator('.hud-bar').boundingBox())!;
    await touchDrag(page, bar.x + bar.width / 2, bar.y + bar.height / 2, bar.y + bar.height + 260);
    await expectDrawerOpen(page);
    await page
      .getByRole('button', { name: /Reports/ })
      .first()
      .tap();
    await expect(page).toHaveURL(/\/reports/);
  });

  test('a link tapped straight after flicking the drawer open still navigates', async ({ page }) => {
    // A fast drag used to leave Chromium running an invisible fling after
    // release (`touch-action: none` filters its scroll updates, but the fling
    // itself still starts), and Chromium swallows the tap that cancels an
    // active fling: no click, so the link did nothing. Tapping right on the
    // heels of the flick is what makes that fling certain to still be live.
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await SettlementPage.found(page);

    // Where Reports sits in the open drawer, measured up front so nothing
    // has to round-trip to the page between the flick and the tap.
    await page.locator('.hud-grip').tap();
    await expectDrawerOpen(page);
    const link = (await page.getByRole('button', { name: /Reports/ }).first().boundingBox())!;
    await page.locator('.hud-grip').tap();
    await expectDrawerClosed(page);

    const bar = (await page.locator('.hud-bar').boundingBox())!;
    const x = bar.x + bar.width / 2;
    const y = bar.y + bar.height / 2;
    const cdp = await page.context().newCDPSession(page);
    // Explicit event timestamps (seconds) 8ms apart: a real fast flick, at
    // the same speed however slowly the runner happens to deliver the events.
    const t0 = Date.now() / 1000;
    const at = (ms: number) => t0 + ms / 1000;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: at(0) });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 50 }], timestamp: at(i * 8) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: at(56) });
    const tap = { x: link.x + link.width / 2, y: link.y + link.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tap], timestamp: at(150) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: at(200) });
    await cdp.detach();

    await expect(page).toHaveURL(/\/reports/);
  });

  test('bottom-docked: a touch drag up opens the drawer, a touch drag down closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.addInitScript(() => window.localStorage.setItem('bjarnoy.hudBarPosition', 'bottom'));
    await loginTestUser(page);
    await SettlementPage.found(page);
    await expect(page.locator('.hud-bar')).toHaveClass(/hud-bar--bottom/);

    const bar = (await page.locator('.hud-bar').boundingBox())!;
    await touchDrag(page, bar.x + bar.width / 2, bar.y + bar.height / 2, bar.y - 260);
    await expectDrawerOpen(page);
    await waitDrawerSettled(page);

    const open = (await page.locator('.hud-drawer').boundingBox())!;
    await touchDrag(page, open.x + open.width / 2, open.y + 20, open.y + open.height - 4);
    await expectDrawerClosed(page);
  });

  test.describe('short phone', () => {
    // Founding itself needs the taller phone (the landfall click); the
    // test then shrinks to a height the drawer's content overflows.
    test.use({ viewport: { width: 390, height: 664 } });

    test('a touch drag inside an overflowing open drawer scrolls its content before it closes', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      // The drawer's height is capped to the room under the bar, so on a
      // short phone its content overflows and has to scroll.
      await loginTestUser(page);
      await SettlementPage.found(page);
      await page.setViewportSize({ width: 390, height: 420 });

      await page.locator('.hud-grip').tap();
      await expectDrawerOpen(page);
      await waitDrawerSettled(page);
      const scroller = page.locator('.hud-drawer-scroll');
      const room = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(room).toBeGreaterThan(60);

      // A pull up shorter than the scroll room: the content takes all of it,
      // the drawer stays fully open.
      const open = (await page.locator('.hud-drawer').boundingBox())!;
      const x = open.x + open.width / 2;
      const fromY = open.y + open.height - 40;
      await touchDrag(page, x, fromY, fromY - 50);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await drawerHeight(page)).toBeCloseTo(open.height, 0);
      await expect(page.locator('.hud-grip')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  test('the founded landing page: a touch tap on the floating ☰ opens the drawer, another closes it', async ({ page }) => {
    // A portrait phone's founded landing has no bar band to drag (TopBar's
    // `floating`): the ☰ sits beside the settlement bubble and the drawer
    // opens and closes by tap only. A real touch tap must still toggle it.
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    // The founded landing's header (with its drawer) is back on a phone
    // once the guided build steps are done (LandingView's hideBarForTutorial).
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await settlement.placeGuidedBuildings();
    await expect(page.getByTestId('onboarding-continue')).toBeVisible();
    await expect(page.locator('header.hud-bar')).toHaveClass(/hud-bar--floating/);

    await page.locator('.hud-grip').tap();
    await expectDrawerOpen(page);
    await page.locator('.hud-grip').tap();
    await expectDrawerClosed(page);
  });

  test.describe('short phone, founded landing', () => {
    // Founding itself needs the taller phone (the landfall click); the test
    // then shrinks to a height the drawer's content overflows.
    test.use({ viewport: { width: 390, height: 664 } });

    test('the floating drawer scrolls its content by native touch', async ({ page }) => {
      // The floating drawer has no drag gesture, so nothing drives its
      // scrolling from script: a finger on it must scroll natively, which a
      // `touch-action: none` meant for the draggable band drawer would block.
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await loginTestUser(page);
      const settlement = await SettlementPage.openLanding(page);
      await settlement.claimLandfall();
      await settlement.placeGuidedBuildings();
      await expect(page.getByTestId('onboarding-continue')).toBeVisible();
      await page.setViewportSize({ width: 390, height: 420 });
      await expect(page.locator('header.hud-bar')).toHaveClass(/hud-bar--floating/);

      await page.locator('.hud-grip').tap();
      await expectDrawerOpen(page);
      await waitDrawerSettled(page);
      const scroller = page.locator('.hud-drawer-scroll');
      expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(60);

      const open = (await page.locator('.hud-drawer').boundingBox())!;
      const x = open.x + open.width / 2;
      const fromY = open.y + open.height - 40;
      await touchDrag(page, x, fromY, fromY - 120);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await expect(page.locator('.hud-grip')).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
