import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Touch has no hover, so a tap on a construction dial reveals it (the way mouse hover does; unit-tested in
 * BuildingHudLayer.test.ts). The dial is an HTML marker that takes no pointer input, like every HUD marker, so the tap also
 * reaches the map underneath: it opens the ring like a tap anywhere else. This is the end-to-end "a tap on a dial is not
 * swallowed" contract on a phone.
 */
test.describe('construction dial tap on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  interface DialWindow {
    __demoWorld: () => {
      hud: { queueFetchedAt: number; queue: unknown[]; construction: unknown; tick: number };
      syncHud: () => void;
    };
    __settlementRenderer: () => { dialScreenPoint: (c: { q: number; r: number }) => { x: number; y: number } };
  }

  test('tapping a dial reaches the map and opens a ring, like tapping elsewhere', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });

    await page.evaluate((hex) => {
      const world = (window as unknown as DialWindow).__demoWorld();
      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [
        {
          id: 'dial-tap',
          q: hex.q,
          r: hex.r,
          building: 'farm',
          targetLevel: 1,
          state: 'building',
          slotCost: 1,
          completesAtGameTime: new Date(Date.now() + 500_000).toISOString(),
          completesInSeconds: 500,
          totalSeconds: 500,
        },
      ];
      world.hud.construction = { slots: 3, slotsUsed: 1, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1, towerLimit: 0, towersHeld: 0 };
      world.hud.tick += 1;
      world.syncHud();
    }, target.hex);

    const dial = await page.evaluate(
      (hex) => (window as unknown as DialWindow).__settlementRenderer().dialScreenPoint(hex),
      target.hex,
    );
    await expect(settlement.hud.dialOnly(target.hex)).toHaveCount(1);
    await expect(settlement.ring.backdrop).toHaveCount(0);

    const box = await settlement.canvasBox();
    await page.touchscreen.tap(box.x + dial.x, box.y + dial.y);
    await settlement.ring.waitForOpen();
    await expect(settlement.ring.backdrop).toHaveCount(1);
  });
});
