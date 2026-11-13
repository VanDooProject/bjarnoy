import { expect, type Page } from '@playwright/test';
import { waitForMapReady } from '../support/render';

/** The landing page (`/`): the settlement preview with the "choose where your realm begins" heading. */
export class LandingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get heading() {
    return this.page.getByRole('heading', { name: /choose where your realm begins/i });
  }

  /** Opens the landing page without the intro and waits until the preview map and its heading are up. */
  static async open(page: Page): Promise<LandingPage> {
    await page.goto('/#no-intro');
    await waitForMapReady(page);
    const landing = new LandingPage(page);
    await expect(landing.heading).toBeVisible();
    return landing;
  }
}
