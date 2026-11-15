import type { Locator, Page } from '@playwright/test';

/** The HUD bar over the map (TopBar.vue, ResourceBar.vue) and the pill under it that reports a failing poll (ConnectionBanner.vue). */
export class HudBarComponent {
  readonly bar: Locator;
  readonly resourceBar: Locator;
  /** "Connection lost" pill: shown while any background poll is failing. */
  readonly connectionBanner: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.bar = page.locator('.hud-bar');
    this.resourceBar = page.locator('.resource-bar:visible').first();
    this.connectionBanner = page.getByTestId('connection-banner');
  }

  /**
   * Fails the way a real outage does: the API requests of a background poll are refused by the network, and the
   * world store's own poll tracker (what the live-mode poll loop runs every tick; demo mode has no loop) records it.
   */
  async failPoll(key = 'settlement'): Promise<void> {
    await this.page.route('**/api/v1/settlements/**', (route) => route.abort('connectionrefused'));
    await this.page.evaluate(async (pollKey) => {
      const world = (window as unknown as {
        __demoWorld: () => { trackPoll: (key: string, poll: () => Promise<unknown>) => Promise<void> };
      }).__demoWorld();
      await world.trackPoll(pollKey, () => fetch('/api/v1/settlements/mine'));
    }, key);
  }
}
