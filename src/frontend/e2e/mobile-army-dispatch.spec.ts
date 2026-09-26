import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';
import { RingMenuComponent } from './pages/RingMenuComponent';
import { layoutOverflow } from './helpers';

/**
 * Issue: mobile army dispatch. Phones (<=768px) get no ArmyPanel — a 260px
 * status card is too much of a small screen — so dispatching/tracking
 * armies has to work entirely through the ring's "Send army here"/"Attack"/
 * "Support" bubble, the new `MobileDispatchSheet`, and QueueDrawer's Armies
 * section instead. Store state is seeded via `__demoWorld` the same way
 * army-overlay.spec.ts and queue-drawer.spec.ts do — demo mode has no
 * backend to dispatch against, so nothing overwrites what a test puts in.
 */

const PHONE = { width: 390, height: 844 };

interface DemoWindow {
  __demoWorld: () => any;
  __settlementRenderer: () => {
    hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
  };
}

function demoWorld(page: Page) {
  return page.evaluate(() => (window as unknown as DemoWindow).__demoWorld());
}

async function seedGarrison(page: Page) {
  await page.evaluate(() => {
    const world = (window as unknown as DemoWindow).__demoWorld();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
  });
}

/**
 * Zooms out past the exit-to-settlement threshold (zoom-transition.spec.ts's
 * own pattern) to reach `/world` — the mouse has to sit over the canvas
 * first, or the wheel events land on the fixed HUD chrome above it instead
 * and nothing ever zooms. Used here instead of `WorldMapPage.open()`'s own
 * `gotoWorldMap` (a HudNav "World map" click): that link lives inside the
 * mobile pull-down drawer, not the compact bar itself, and this suite's
 * point is that a phone reaches /world by zoom, not a nav click anyway.
 */
async function zoomOutToWorld(page: Page, centre: { x: number; y: number }) {
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 90; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(15);
    if (page.url().includes('/world')) break;
  }
  await expect(page).toHaveURL(/\/world$/, { timeout: 10_000 });
}

test.describe('mobile army dispatch', { tag: '@g3' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('ArmyPanel is not mounted at phone width, in either mode', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await expect(page.locator('.army-panel')).toHaveCount(0);

    await zoomOutToWorld(page, await settlement.canvasCentre());
    await expect(page.locator('.army-panel')).toHaveCount(0);
  });

  test('tapping an own hex offers "Send army here"; composing plots a route, adds a unit, removes a pin by tap, then cancels', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await seedGarrison(page);
    const ring = new RingMenuComponent(page);

    const first = await settlement.findHex();
    await settlement.clickHex(first);
    await expect(ring.action('Send army here')).toBeVisible();

    await ring.action('Send army here').click();

    const sheet = page.locator('.dispatch-sheet');
    await expect(sheet).toBeVisible();
    // Opens expanded — units still need picking (issue's decision 3: no
    // default selection).
    await expect(sheet.locator('.dispatch-sheet-expanded')).toBeVisible();
    await expect.poll(async () => (await demoWorld(page)).dispatchDraft?.route).toEqual([first.hex]);

    const start = sheet.locator('.primary');
    await expect(start).toBeDisabled();

    // Pick a unit via the stepper's "+".
    await sheet.locator('.unit-stepper-row', { hasText: 'Spearman' }).locator('.stepper-btn').nth(1).click();
    await expect.poll(async () => (await demoWorld(page)).dispatchDraft?.unitCounts.spearman).toBe(1);
    await expect(start).toBeDisabled(); // still demo mode — see the next test's own note

    // Tap a second, distinct hex: the route grows and the ring stays
    // suppressed while composing (the dispatch draft claims the click).
    const second = await page.evaluate((from) => {
      const at = { q: from.q + 2, r: from.r + 1 };
      return { hex: at, screen: (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(at) };
    }, first.hex);
    await settlement.clickHex(second);
    await expect.poll(async () => (await demoWorld(page)).dispatchDraft?.route).toEqual([first.hex, second.hex]);
    await expect(ring.bubbles).toHaveCount(0);

    // Tap (not drag) the first pin to remove it.
    await settlement.clickHex(first);
    await expect.poll(async () => (await demoWorld(page)).dispatchDraft?.route).toEqual([second.hex]);

    // Demo mode always shows the note and keeps Start disabled, even with a
    // unit selected and a destination plotted.
    await expect(sheet).toContainText('Dispatching armies requires the live backend');
    await expect(start).toBeDisabled();

    // Cancel, then confirm the next tap opens the ring again rather than
    // silently re-adding a waypoint to a draft that no longer exists.
    await sheet.locator('.sheet-cancel').click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await demoWorld(page)).dispatchDraft).toBeNull();

    await settlement.clickHex(first);
    await expect(ring.action('Send army here')).toBeVisible();
  });

  test('tapping a rival-owned tile starts an Attack draft targeting it', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    await seedGarrison(page);
    const ring = new RingMenuComponent(page);

    const rival = await page.evaluate(() => {
      const world = (window as unknown as DemoWindow).__demoWorld();
      const home = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: home.q + 6, r: home.r - 3 };
      world.model.registerSettlement({
        id: 'rival-1',
        ownerId: 'rival-1',
        ownerName: 'Ragna',
        name: 'Skarhavn',
        q: at.q,
        r: at.r,
        level: 2,
        resources: {},
        rates: {},
        foundedAt: Date.now(),
      });
      world.model.claimTerritory('rival-1');
      return { at, screen: (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(at) };
    });

    const box = await settlement.canvasBox();
    await page.mouse.click(box.x + rival.screen.x, box.y + rival.screen.y);
    await expect(ring.action('Attack')).toBeVisible();

    await ring.action('Attack').click();

    await expect(page.locator('.dispatch-sheet')).toBeVisible();
    const draft = await demoWorld(page).then((w) => w.dispatchDraft);
    expect(draft.mission).toBe('attack');
    expect(draft.targetSettlementId).toBe('rival-1');
  });

  test('world mode: a tap opens the ring and stays on /world', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const ring = new RingMenuComponent(page);
    const centre = await settlement.canvasCentre();

    await zoomOutToWorld(page, centre);
    await page.mouse.click(centre.x, centre.y);

    await expect(page).toHaveURL(/\/world$/);
    await expect(ring.bubbles.first()).toBeVisible();
  });

  test('the sheet sits fully on screen above a bottom-docked HUD bar', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await page.addInitScript(() => window.localStorage.setItem('bjarnoy.hudBarPosition', 'bottom'));
    const settlement = await SettlementPage.found(page);
    await seedGarrison(page);
    const ring = new RingMenuComponent(page);

    const hex = await settlement.findHex();
    await settlement.clickHex(hex);
    await ring.action('Send army here').click();

    const sheet = page.locator('.dispatch-sheet');
    await expect(sheet).toBeVisible();

    const bar = page.locator('.hud-bar');
    const barBox = (await bar.boundingBox())!;
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(barBox.y + 1);

    const overflow = await layoutOverflow(page);
    expect(overflow.pageScrollsSideways).toBe(false);
    expect(overflow.offscreen).toEqual([]);
  });

  test('QueueDrawer lists a seeded army with its ETA; a row tap closes the drawer, selects it and centres the camera', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);

    const seeded = await page.evaluate(() => {
      const world = (window as unknown as DemoWindow).__demoWorld();
      const home = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: home.q + 5, r: home.r - 2 };
      world.armies = [
        {
          id: 'army-1',
          settlementId: world.selectedSettlementId,
          mission: 'move',
          targetSettlementId: null,
          atHome: false,
          supporting: false,
          position: at,
          provisions: 10,
          totalSpeed: 4,
          totalUpkeepPerHour: 2,
          stacks: [{ unit: 'spearman', count: 10 }],
          movement: {
            // Almost arrived (59 of 60 minutes travelled) — so the
            // interpolated position (routeProgressAt) is the far hex, not
            // the settlement it departed from, and the row still shows a
            // real countdown rather than "Arriving".
            departedAt: new Date(Date.now() - 3_540_000).toISOString(),
            path: [{ q: home.q, r: home.r }, at],
            cumulativeHours: [0, 1],
            arrivesAt: new Date(Date.now() + 60_000).toISOString(),
            returnPath: [],
            returnCumulativeHours: [],
            turnAroundAt: new Date(Date.now() + 60_000).toISOString(),
            returnArrivesAt: new Date(Date.now() + 7_200_000).toISOString(),
            isReturning: false,
          },
        },
      ];
      world.hud.tick += 1;
      return { at };
    });

    const before = await page.evaluate(
      (coord) => (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(coord),
      seeded.at,
    );
    const canvasBox = (await page.locator('canvas').boundingBox())!;
    const canvasCentre = { x: canvasBox.width / 2, y: canvasBox.height / 2 };
    expect(Math.hypot(before.x - canvasCentre.x, before.y - canvasCentre.y)).toBeGreaterThan(80);

    await page.locator('.queue-drawer-handle').click();
    const armyRow = page.locator('.army-row', { hasText: 'Spearman' });
    await expect(armyRow).toBeVisible();
    await expect(armyRow.locator('.status-row-time')).not.toHaveText('—');

    await armyRow.locator('.status-row-click').click();

    await expect(page.locator('#queue-drawer-body')).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await demoWorld(page)).selectedArmyId).toBe('army-1');
    await expect
      .poll(async () => {
        const after = await page.evaluate(
          (coord) => (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(coord),
          seeded.at,
        );
        return Math.hypot(after.x - canvasCentre.x, after.y - canvasCentre.y);
      })
      .toBeLessThan(40);
  });
});
