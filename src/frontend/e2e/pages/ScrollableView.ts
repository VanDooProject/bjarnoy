import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A view that has to scroll inside its own box (issue #101, and #101's
 * admin-shell twin covered by admin-scroll.spec.ts).
 *
 * The bug class both specs guard is the same: an element with
 * `min-height: 100vh` and no constrained box never overflows *within*
 * itself, so the real overflow lands on `body` — which `overflow: hidden`
 * (style.css, needed by the map views) then clips entirely, leaving content
 * below the fold unreachable with no scrollbar anywhere. Proving that takes
 * the same four steps every time, which is what this wraps.
 */
export class ScrollableView {
  readonly root: Locator;

  private readonly page: Page;

  constructor(page: Page, selector: string) {
    this.page = page;
    this.root = page.locator(selector);
  }

  /** The root's own scroll geometry — `scrollHeight > clientHeight` is "it can scroll at all". */
  metrics(): Promise<{ scrollHeight: number; clientHeight: number }> {
    return this.root.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  }

  /** How far the root has actually been scrolled. */
  scrollTop(): Promise<number> {
    return this.root.evaluate((el) => el.scrollTop);
  }

  /**
   * Hovers the root and wheels it by `delta`, then waits for `scrollTop` to
   * actually move — a wheel event is not a synchronous scroll, so polling
   * the real value is what replaces a guessed sleep here.
   */
  async wheel(delta: number): Promise<void> {
    await this.root.hover();
    await this.page.mouse.wheel(0, delta);
    await expect.poll(() => this.scrollTop()).toBeGreaterThan(0);
  }

  /**
   * Guards the `100vw` → `100%` half of the fix: a viewport-width element
   * plus the scrollbar gutter scrolling now needs would push the page wider
   * than the window.
   */
  noHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
  }
}
