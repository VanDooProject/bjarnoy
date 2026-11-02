import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * While a ring menu is open, the canvas markers beneath it (construction
 * dials, the realm name badge) are hidden so they don't show through between
 * the DOM bubbles; markers outside the ring's footprint stay, and everything
 * is back once the ring closes. The geometry is unit-tested
 * (markerOcclusion.test.ts); this is the wiring from the open ring to the
 * renderer, read through the renderer's own `markerVisibility()`.
 */
test.describe('markers beneath the ring menu', { tag: '@g2' }, () => {
  interface Visibility {
    dials: Record<string, number>;
    badges: Record<string, number>;
  }
  interface W {
    __demoWorld: () => {
      model: any;
      selectedSettlementId: string;
      hud: { queueFetchedAt: number; queue: unknown[]; construction: unknown; tick: number };
      syncHud: () => void;
    };
    __settlementRenderer: () => {
      markerVisibility: () => Visibility;
      hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
    };
  }

  test('dials and the badge under the ring hide, a far dial stays, and all return on close', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const centre = await settlement.centreHex();

    // Queue a build on the longhouse's neighbour (under the ring) and one well clear of it.
    const { near, far, settlementId } = await page.evaluate(() => {
      const w = window as unknown as W;
      const world = w.__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      const renderer = w.__settlementRenderer();
      const origin = renderer.hexCenterScreen({ q: s.q, r: s.r });
      // The realm is smaller than the ring, so the far dial sits just outside it, on the first hex 200+ px away.
      let nearHex: { q: number; r: number } | null = null;
      let farHex: { q: number; r: number } | null = null;
      for (let k = 1; k < 12 && (!nearHex || !farHex); k++) {
        const at = { q: s.q + k, r: s.r };
        const p = renderer.hexCenterScreen(at);
        const d = Math.hypot(p.x - origin.x, p.y - origin.y);
        if (!nearHex && d > 20) nearHex = at;
        if (!farHex && d > 200) farHex = at;
      }
      if (!nearHex || !farHex) throw new Error('no near/far hex found');
      const entry = (id: string, hex: { q: number; r: number }) => ({
        id,
        q: hex.q,
        r: hex.r,
        building: 'farm',
        targetLevel: 1,
        state: 'building',
        slotCost: 1,
        completesAtGameTime: new Date(Date.now() + 500_000).toISOString(),
        completesInSeconds: 500,
        totalSeconds: 500,
      });
      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [entry('near', nearHex), entry('far', farHex)];
      world.hud.construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1 };
      world.hud.tick += 1;
      world.syncHud();
      return { near: nearHex, far: farHex, settlementId: world.selectedSettlementId };
    });
    const nearKey = `${near.q},${near.r}`;
    const farKey = `${far.q},${far.r}`;
    const visibility = () => page.evaluate(() => (window as unknown as W).__settlementRenderer().markerVisibility());
    // Absent from the map = fully visible.
    const alpha = (map: Record<string, number>, key: string) => map[key] ?? 1;

    // Ring closed: everything shows.
    await expect.poll(async () => alpha((await visibility()).dials, nearKey)).toBe(1);

    await settlement.clickHex(centre);
    await settlement.ring.waitForOpen();
    await expect
      .poll(async () => {
        const v = await visibility();
        return [alpha(v.dials, nearKey), alpha(v.badges, settlementId)];
      })
      .toEqual([0, 0]);
    expect(alpha((await visibility()).dials, farKey)).toBe(1);

    await page.keyboard.press('Escape');
    await expect(settlement.ring.backdrop).toHaveCount(0);
    await expect
      .poll(async () => {
        const v = await visibility();
        return [alpha(v.dials, nearKey), alpha(v.badges, settlementId)];
      })
      .toEqual([1, 1]);
  });
});
