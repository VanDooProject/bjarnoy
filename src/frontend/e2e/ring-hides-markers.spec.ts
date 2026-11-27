import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * While a ring menu is open, the markers beneath it (the construction dials, which are HTML dial-only markers, and the canvas
 * realm name badge) are hidden so they don't show through between the DOM bubbles; markers outside the ring's footprint
 * stay, and everything is back once the ring closes. The geometry is unit-tested (markerOcclusion.test.ts); this is the
 * wiring from the open ring to the markers: a dial's opacity in the DOM, the badge through the renderer's `markerVisibility()`.
 */
test.describe('markers beneath the ring menu', { tag: '@g2' }, () => {
  interface DemoWorld {
    model: any;
    selectedSettlementId: string;
    hud: { queueFetchedAt: number; queue: unknown[]; construction: unknown; tick: number };
    syncHud: () => void;
  }

  test('dials and the badge under the ring hide, a far dial stays, and all return on close', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.found(page);
    const centre = await settlement.centreHex();

    // Queue a build on the longhouse's neighbour (under the ring) and one well clear of it.
    const { near, far, settlementId } = await page.evaluate(() => {
      const world = window.__demoWorld() as DemoWorld;
      const s = world.model.getSettlement(world.selectedSettlementId);
      const renderer = window.__settlementRenderer();
      const origin = renderer.hexCenterScreen({ q: s.q, r: s.r });
      // The realm is smaller than the ring, so the far dial sits just outside it, on the first hex 200+ px away.
      // Both are new builds: a dial-only marker each (a hex with a building standing shows its order on the building's marker).
      const standing = new Set(world.model.listBuildings(world.selectedSettlementId).map((b: { q: number; r: number }) => `${b.q},${b.r}`));
      let nearHex: { q: number; r: number } | null = null;
      let farHex: { q: number; r: number } | null = null;
      for (let k = 1; k < 12 && (!nearHex || !farHex); k++) {
        const at = { q: s.q + k, r: s.r };
        if (standing.has(`${at.q},${at.r}`)) continue;
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
      world.hud.construction = { slots: 3, slotsUsed: 2, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1, towerLimit: 0, towersHeld: 0 };
      world.hud.tick += 1;
      world.syncHud();
      return { near: nearHex, far: farHex, settlementId: world.selectedSettlementId };
    });
    const { hud } = settlement;
    const badgeAlpha = async () => {
      const badges = await page.evaluate(() => window.__settlementRenderer().markerVisibility().badges);
      // Absent from the map = fully visible.
      return badges[settlementId] ?? 1;
    };

    // Ring closed: everything shows.
    await expect(hud.dialOnly(near)).toHaveCount(1);
    await expect(hud.dialOnly(far)).toHaveCount(1);
    await expect(hud.dialOnly(near)).toHaveCSS('opacity', '1');

    await settlement.clickHex(centre);
    await settlement.ring.waitForOpen();
    await expect(hud.dialOnly(near)).toHaveCSS('opacity', '0');
    await expect(hud.dialOnly(near)).toHaveAttribute('data-occluded', '1');
    await expect.poll(badgeAlpha).toBe(0);
    await expect(hud.dialOnly(far)).toHaveCSS('opacity', '1');
    await expect(hud.dialOnly(far)).toHaveAttribute('data-occluded', '0');

    await page.keyboard.press('Escape');
    await expect(settlement.ring.backdrop).toHaveCount(0);
    await expect(hud.dialOnly(near)).toHaveCSS('opacity', '1');
    await expect(hud.dialOnly(near)).toHaveAttribute('data-occluded', '0');
    await expect.poll(badgeAlpha).toBe(1);
  });
});
