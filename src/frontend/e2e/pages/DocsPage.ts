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

  /** Opens the tech tree page and waits until the catalogue has rendered its building sections and their art has loaded. */
  static async openTechTree(page: Page): Promise<DocsPage> {
    await page.goto('/docs/tech-tree');
    const docs = new DocsPage(page);
    await expect(docs.heading).toBeVisible();
    await expect(page.locator('section.building').first()).toBeVisible();
    await docs.artLoaded();
    return docs;
  }

  /** Opens the tile docs page (`/docs/tiles`) and waits until its tile art has loaded. */
  static async openTiles(page: Page): Promise<DocsPage> {
    await page.goto('/docs/tiles');
    const docs = new DocsPage(page);
    await expect(docs.heading).toBeVisible();
    await expect(page.locator('.atlas-sprite').first()).toBeVisible();
    await docs.artLoaded();
    return docs;
  }

  /** Waits until every atlas picture on the page (`.atlas-sprite`, a CSS background) is decoded, so a shot never catches one half loaded. */
  async artLoaded(): Promise<void> {
    await this.page.evaluate(async () => {
      const urls = new Set<string>();
      for (const el of document.querySelectorAll('.atlas-sprite')) {
        for (const match of getComputedStyle(el).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(match[1]);
      }
      await Promise.all(
        [...urls].map((url) => {
          const image = new Image();
          image.src = url;
          return image.decode();
        }),
      );
    });
  }
}
