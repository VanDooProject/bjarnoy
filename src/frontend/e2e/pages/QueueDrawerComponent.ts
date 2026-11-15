import { expect, type Locator, type Page } from '@playwright/test';

type DrawerWorld = {
  hud: {
    queueFetchedAt: number;
    queue: unknown[];
    construction: unknown;
    garrison: { unit: string; count: number }[];
    tick: number;
  };
  selectedSettlementId: string;
  model: { getSettlement: (id: string) => { q: number; r: number } };
  syncHud: () => void;
};

/** The phone's slide-out queue drawer (QueueDrawer.vue): edge handle, build / training / army sections. */
export class QueueDrawerComponent {
  readonly handle: Locator;
  readonly body: Locator;
  readonly rows: Locator;
  readonly cancelButtons: Locator;
  /** The error line under the build orders (a refused cancel). */
  readonly error: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.handle = page.locator('.queue-drawer-handle');
    this.body = page.locator('#queue-drawer-body');
    this.rows = this.body.locator('.status-row');
    this.cancelButtons = this.body.locator('.cancel-button');
    this.error = this.body.locator('.status-subtext.error');
  }

  /**
   * Seeds what the backend would send: a build order that has just completed, one waiting for a slot and a garrison.
   * No running order: its progress bar is a countdown animation that is mid-way and moving, so a shot of it would
   * be frozen at an arbitrary point (Playwright fast-forwards finite animations to their end).
   */
  async seed(): Promise<void> {
    await this.page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => DrawerWorld }).__demoWorld();
      const home = world.model.getSettlement(world.selectedSettlementId);
      const order = (id: string, dq: number, building: string, targetLevel: number, state: string, seconds: number) => ({
        id,
        q: home.q + dq,
        r: home.r,
        building,
        targetLevel,
        state,
        slotCost: 1,
        completesAtGameTime: new Date(Date.now() + seconds * 1000).toISOString(),
        completesInSeconds: seconds,
        totalSeconds: 500,
      });
      world.hud.queueFetchedAt = Date.now();
      world.hud.queue = [order('done', 1, 'farm', 2, 'building', 0), order('waiting', 3, 'lumberjack', 2, 'waiting', 500)];
      world.hud.construction = { slots: 1, slotsUsed: 1, maxWaitingOrders: 3, waitingOrders: 1, maxOrdersPerHex: 1, towerLimit: 0, towersHeld: 0 };
      world.hud.garrison = [{ unit: 'spearman', count: 18 }];
      world.hud.tick += 1;
      world.syncHud();
    });
  }

  /** Opens the drawer with a tap on its handle and waits until it has stopped sliding. */
  async open(): Promise<void> {
    await this.handle.click();
    await expect(this.body).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(() => this.body.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0);
  }
}
