import { expect, type Page } from '@playwright/test';

/** The in-game docs (`/docs`). */
export class DocsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** Opens the docs hub and waits for its page heading. */
  static async openHub(page: Page): Promise<DocsPage> {
    await page.goto('/docs');
    const docs = new DocsPage(page);
    await expect(docs.heading).toBeVisible();
    return docs;
  }
}
