// See RingMenuComponent.ts for why `expect` comes from './fixtures', not
// '@playwright/test' directly.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

// Issue: mobile queue sidebar (slide-out drawer for build/training
// progress). Runs at a phone-width viewport so useIsMobile's matchMedia
// breakpoint actually swaps BuildQueuePanel/TrainingQueuePanel for
// QueueDrawer — see MapView.vue's `isMobile` branch.
test.describe('mobile queue drawer', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 390, height: 844 } });

  interface DemoWindow {
    __demoWorld: () => {
      hud: {
        queueFetchedAt: number;
        queue: unknown[];
        construction: { slots: number; slotsUsed: number; maxWaitingOrders: number; waitingOrders: number; maxOrdersPerHex: number };
        trainingQueueFetchedAt: number;
        trainingQueue: unknown[];
        garrison: { unit: string; count: number }[];
        tick: number;
      };
      selectedSettlementId: string;
      model: { getSettlement: (id: string) => { q: number; r: number } };
      syncHud: () => void;
    };
    __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
  }

  /** Seeds a slow + fast build order, one training order, and a garrison — mirrors QueueDrawer.test.ts's fixtures. */
  async function seedQueues(page: Page) {
    return page.evaluate(() => {
      const world = (window as unknown as DemoWindow).__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const farHex = { q: settlement.q + 6, r: settlement.r - 4 };

      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [
        {
          id: 'slow',
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
        {
          id: 'fast',
          q: farHex.q,
          r: farHex.r,
          building: 'tower',
          targetLevel: 3,
          state: 'building',
          slotCost: 1,
          completesAtGameTime: new Date(Date.now() + 50_000).toISOString(),
          completesInSeconds: 50,
          totalSeconds: 50,
        },
      ];
      world.hud.construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1 };

      world.hud.trainingQueueFetchedAt = Date.now();
      world.hud.trainingQueue = [
        {
          id: 'training-1',
          unit: 'spearman',
          count: 10,
          completedCount: 4,
          completesAtGameTime: new Date(Date.now() + 80_000).toISOString(),
          completesInSeconds: 80,
          totalSeconds: 80,
        },
      ];
      world.hud.garrison = [{ unit: 'spearman', count: 18 }];
      world.hud.tick += 1;
      world.syncHud();

      return { farHex };
    });
  }

  test('the collapsed handle is a small edge tab showing countdowns per category', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await seedQueues(page);

    const handle = page.locator('.queue-drawer-handle');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(56);
    expect(box.height).toBeLessThanOrEqual(140);
    expect(box.x).toBeLessThanOrEqual(1);

    // 2 build orders seeded above ('fast' is the soonest, 50s) -> count
    // chip "2" and the fast order's countdown.
    const buildRow = handle.locator('.queue-drawer-handle-row.is-build');
    await expect(buildRow.locator('.queue-drawer-handle-count')).toHaveText('2');
    await expect(buildRow.locator('.queue-drawer-handle-time')).toHaveText(/^0:\d\d$/);

    // 1 training order seeded above -> no count chip, but a countdown.
    const trainRow = handle.locator('.queue-drawer-handle-row.is-train');
    await expect(trainRow.locator('.queue-drawer-handle-count')).toHaveCount(0);
    await expect(trainRow.locator('.queue-drawer-handle-time')).not.toHaveText('');

    // BuildQueuePanel/TrainingQueuePanel — the desktop panels QueueDrawer
    // replaces — are not mounted at this viewport width. (Other HUD panels
    // share the same `.status-card` class, so this checks by component
    // identity via the training-queue-panel modifier class instead.)
    await expect(page.locator('.training-queue-panel')).toHaveCount(0);
  });

  test('the map stays tappable along the left edge above and below the handle', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await seedQueues(page);

    const handle = page.locator('.queue-drawer-handle');
    const box = (await handle.boundingBox())!;

    const above = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
      { x: 10, y: box.y - 40 },
    );
    const below = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
      { x: 10, y: box.y + box.height + 40 },
    );

    expect(above).toBe('canvas');
    expect(below).toBe('canvas');
  });

  test('dragging the handle opens the drawer, and dragging it back closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await seedQueues(page);

    const handle = page.locator('.queue-drawer-handle');
    const body = page.locator('#queue-drawer-body');
    await expect(body).toHaveAttribute('aria-hidden', 'true');

    let box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(body).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.status-row-click').first()).toBeVisible();

    box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(body).toHaveAttribute('aria-hidden', 'true');
  });

  test('tapping a build row centres the map on it and closes the drawer', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    const { farHex } = await seedQueues(page);

    const before = await page.evaluate(
      (coord) => (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(coord),
      farHex,
    );
    const canvasBox = (await page.locator('canvas').boundingBox())!;
    const canvasCentre = { x: canvasBox.width / 2, y: canvasBox.height / 2 };
    // A real regression here is the target hex already sitting at the
    // canvas centre before the pan — pick a fixture far enough from the
    // longhouse (the camera's resting position) that this can't happen.
    expect(Math.hypot(before.x - canvasCentre.x, before.y - canvasCentre.y)).toBeGreaterThan(80);

    await page.locator('.queue-drawer-handle').click();
    const fastRow = page.locator('.status-row-click', { hasText: 'Watchtower' });
    await expect(fastRow).toBeVisible();
    await fastRow.click();

    await expect(page.locator('#queue-drawer-body')).toHaveAttribute('aria-hidden', 'true');

    await expect
      .poll(async () => {
        const after = await page.evaluate(
          (coord) => (window as unknown as DemoWindow).__settlementRenderer().hexCenterScreen(coord),
          farHex,
        );
        return Math.hypot(after.x - canvasCentre.x, after.y - canvasCentre.y);
      })
      .toBeLessThan(40);
  });
});
