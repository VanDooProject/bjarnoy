import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Touch has no hover, so a tap on a construction dial reveals it (the way
 * mouse hover does) and must not reach the tile underneath: no ring menu, no
 * selection. A tap anywhere that is not on a dial behaves as it always did.
 * Dial hit-testing itself is unit-tested (constructionDial.test.ts); this is
 * the end-to-end "the tap is swallowed" contract on a phone.
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

  test('tapping a dial does not open its tile; tapping elsewhere still does', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const target = await settlement.findHex({ terrain: 'grass' });
    const other = await settlement.centreHex();

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
      world.hud.construction = { slots: 3, slotsUsed: 1, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1 };
      world.hud.tick += 1;
      world.syncHud();
    }, target.hex);

    const dial = await page.evaluate(
      (hex) => (window as unknown as DialWindow).__settlementRenderer().dialScreenPoint(hex),
      target.hex,
    );
    // The elsewhere-tap must be clear of the dial's finger-sized hit area.
    expect(Math.hypot(other.screen.x - dial.x, other.screen.y - dial.y)).toBeGreaterThan(30);

    const box = await settlement.canvasBox();
    await page.touchscreen.tap(box.x + dial.x, box.y + dial.y);
    // Give a (wrongly) dispatched tap time to open the ring before asserting it did not.
    await page.waitForTimeout(500);
    await expect(settlement.ring.backdrop).toHaveCount(0);

    await page.touchscreen.tap(box.x + other.screen.x, box.y + other.screen.y);
    await settlement.ring.waitForOpen();
    await expect(settlement.ring.backdrop).toHaveCount(1);
  });
});
