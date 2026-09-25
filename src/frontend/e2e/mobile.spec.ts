import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { claimLandfall, foundSettlement, layoutOverflow, loginTestUser, waitForMapReady } from './helpers';

// Mobile-readiness audit: every one of these was a real defect at phone width
// — HudNav's links (and, in-game, the whole ResourceBar) pushed off the left
// edge of the header, the demo badge wrapping over the header's controls,
// the onboarding checklist's third card and the guidance chip clipped past
// the screen edge, and the landscape checklist sitting on top of the plot so
// the founding tap never reached the map. The desktop suite's fixed
// 1280x800 viewport can't see any of it, so these run at a phone size.
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

async function expectBoxesDisjoint(a: Locator, b: Locator, message: string): Promise<void> {
  const [ra, rb] = [await a.boundingBox(), await b.boundingBox()];
  if (!ra || !rb) return;
  const overlaps = ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height;
  expect(overlaps, message).toBe(false);
}

test.describe('phone layout', { tag: '@g1' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('static pages fit a phone viewport with every control on screen', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    for (const path of ['/login', '/register', '/worlds', '/leaderboards', '/guild', '/reports', '/impressum', '/docs', '/docs/tiles', '/tech-tree', '/showcase']) {
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

  test('the header nav folds into a menu that opens on tap and navigates', async ({ page }) => {
    await page.goto('/docs');
    const toggle = page.getByTestId('hud-nav-menu-toggle');
    const links = page.getByTestId('hud-nav-links');

    await expect(toggle).toBeVisible();
    await expect(links).toBeHidden();
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.width).toBeGreaterThanOrEqual(40);
    expect(toggleBox.height).toBeGreaterThanOrEqual(40);

    await toggle.tap();
    await expect(links).toBeVisible();
    await expectInsideViewport(page, links);
    await expectNothingOffscreen(page, '/docs with the menu open');

    await links.getByRole('button', { name: 'Landing' }).tap();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the demo badge never covers a header control', async ({ page }) => {
    await page.goto('/docs');
    const badge = page.locator('.demo-badge');
    await expect(badge).toBeVisible();
    // `.all()` doesn't auto-wait — let the header render its controls first.
    await expect(page.locator('.hud-bar button').first()).toBeVisible();
    for (const control of await page.locator('.hud-bar button:visible').all()) {
      await expectBoxesDisjoint(badge, control, `demo badge overlaps "${await control.textContent()}"`);
    }
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
    await expectNothingOffscreen(page, 'landing after founding');
  });

  test('in-game, the resources and every header control stay reachable', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await foundSettlement(page);

    // The first resource is always fully visible; the rest may need a
    // sideways swipe of the strip, which layoutOverflow accounts for.
    const firstResource = page.locator('.resource-bar .resource').first();
    await expect(firstResource).toBeVisible();
    await expectInsideViewport(page, firstResource);
    await expectInsideViewport(page, page.locator('.resource-bar'));
    await expectNothingOffscreen(page, '/settlement');

    await page.getByTestId('hud-nav-menu-toggle').tap();
    await page.getByTestId('hud-nav-links').getByRole('button', { name: 'World map' }).tap();
    await expect(page).toHaveURL(/\/world$/);
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
