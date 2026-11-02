// See RingMenuComponent.ts for why `expect` comes from './fixtures', not
// '@playwright/test' directly.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * The phone queue drawer with motion on. playwright.config.ts emulates
 * `prefers-reduced-motion: reduce` for the whole suite, which skips the
 * drawer's slide-in (lib/hud/queueMotion.ts slideDrawer); this spec opts back
 * in so it runs, the way a player without that setting gets it.
 *
 * Regression: the slide-in held its last frame (the closed resting offset)
 * after it finished. When the drawer mounted after load (first order placed,
 * a guest army arriving) it then reported itself open after a drag but stayed
 * parked off-screen, its backdrop covering the map.
 */
// `contextOptions` (not the `reducedMotion` option): the config's own contextOptions.reducedMotion takes priority over it.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test.describe('mobile queue drawer, motion on', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 390, height: 844 } });

  interface DemoWindow {
    __demoWorld: () => {
      hud: { queueFetchedAt: number; queue: unknown[]; tick: number };
      selectedSettlementId: string;
      model: { getSettlement: (id: string) => { q: number; r: number } };
      syncHud: () => void;
    };
  }

  /** Places one build order after load, so the drawer column mounts (and slides in) only now. */
  async function placeFirstOrder(page: Page) {
    await page.evaluate(() => {
      const world = (window as unknown as DemoWindow).__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [
        {
          id: 'first',
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
      ];
      world.hud.tick += 1;
      world.syncHud();
    });
  }

  test('a drawer that slid in after load opens on a drag', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    const drawer = page.locator('.queue-drawer');
    await expect(drawer).toHaveCount(0);

    await placeFirstOrder(page);
    const handle = page.locator('.queue-drawer-handle');
    await expect(handle).toBeVisible();
    // The slide-in has finished once no animation is left running on the column.
    await expect
      .poll(() => drawer.evaluate((el) => el.getAnimations().filter((a) => a.playState === 'running').length))
      .toBe(0);

    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#queue-drawer-body')).toHaveAttribute('aria-hidden', 'false');
    await expect(drawer).toHaveClass(/is-open/);
    // Open means on screen: docked to the left edge, not left at its closed offset.
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.x)).toBe(0);
    await expect(page.locator('.status-row-click').first()).toBeInViewport();
  });
});
