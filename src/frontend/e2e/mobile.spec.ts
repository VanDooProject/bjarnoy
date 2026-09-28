import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { claimLandfall, layoutOverflow, waitForMapReady } from './helpers';

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

test.describe('phone layout', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('static pages fit a phone viewport with every control on screen', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    for (const path of ['/login', '/register', '/worlds', '/leaderboards', '/guild', '/reports', '/impressum']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNothingOffscreen(page, path);
    }
  });

  test('the leaderboards page keeps a side gutter instead of running into the screen edge', async ({ page }) => {
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

    const badge = page.locator('.demo-badge');
    if (await badge.isVisible()) {
      const badgeBox = (await badge.boundingBox())!;
      expect(badgeBox.y, 'demo badge should sit near the top edge, not a stale bar offset').toBeLessThan(40);
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
