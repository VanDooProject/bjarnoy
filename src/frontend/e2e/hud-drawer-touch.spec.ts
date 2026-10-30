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

  test('the founded landing page bar opens by touch drag too', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    // The founded landing's bar (with its drawer) is back on a phone once
    // the guided build steps are done (LandingView's hideBarForTutorial).
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await settlement.placeGuidedBuildings();
    await expect(page.getByTestId('onboarding-continue')).toBeVisible();
    await expect(page.locator('.hud-grip')).toHaveCount(1);

    // Pull the grip handle itself: the phone's founded landing bar has no
    // other content, and the grip is a child button that holds the finger's
    // implicit capture.
    const grip = (await page.locator('.hud-grip').boundingBox())!;
    const bar = (await page.locator('.hud-bar').boundingBox())!;
    await touchDrag(page, grip.x + grip.width / 2, grip.y + grip.height / 2, bar.y + bar.height + 260);
    await expectDrawerOpen(page);
  });
});
