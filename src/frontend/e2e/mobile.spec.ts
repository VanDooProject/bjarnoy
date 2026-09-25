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

  test('the onboarding checklist leaves the landing plot tappable', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await page.goto('/');
    await waitForMapReady(page);

    // The plot's own screen point must hit the canvas, not an overlay sitting
    // on top of it — otherwise the founding tap silently does nothing.
    const hitsCanvas = await page.evaluate(() => {
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
    expect(hitsCanvas).toBe(true);

    await claimLandfall(page);
    await expect(page.getByTestId('onboarding-checklist')).toContainText('Step 2 of 3');
  });
});
