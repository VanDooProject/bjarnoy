// See RingMenuComponent.ts for why `expect` is not imported from `../fixtures`.
import { type Locator, type Page } from '@playwright/test';
import { captureCanvas, waitForMapReady } from '../support/render';
import { loginTestUser } from '../support/session';
import { SettlementPage, type ScreenPoint } from './SettlementPage';

/**
 * The world map view (`/settlement#world`), which mounts the same `HexMapRenderer` as
 * the settlement view in `world` mode — one isometric lattice, flattened.
 *
 * World mode draws no DOM tooltip (unlike settlement mode's `.hex-tooltip`),
 * so the only honest signal that a hover/pan/zoom did anything is a pixel
 * diff of the canvas itself. `screenshot()` plus `Buffer.compare` is that
 * signal, and it lives here so the four interaction specs stop each
 * re-deriving the canvas box and the centre point.
 */
export class WorldMapPage {
  readonly canvas: Locator;

  private boxCache: { x: number; y: number; width: number; height: number } | null = null;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas');
  }

  /**
   * Logs in, founds a settlement (the `/settlement` route's guard requires
   * one — see router/index.ts), and then switches to world mode, waiting for
   * its renderer. Every current caller needs all three, so this bundles them
   * rather than making each spec repeat the login call.
   */
  static async open(page: Page): Promise<WorldMapPage> {
    await loginTestUser(page);
    await SettlementPage.found(page);
    return WorldMapPage.enter(page);
  }

  /**
   * Switches the map to world mode and waits for its renderer to be ready.
   *
   * Players switch by zooming out; world mode is marked by the `#world` hash on
   * `/settlement` (lib/mapModeRoute.ts), so this sets that hash — a fragment
   * navigation the router picks up without reloading — rather than replaying a
   * whole zoom gesture (zoom-transition.spec.ts covers the gesture itself).
   * Not `page.goto('/settlement#world')` — a hard navigation reloads the whole app, and in
   * demo mode `hasFoundedSettlement` is intentionally never persisted to
   * localStorage (player.ts's own remarks: demo mode's WorldModel is pure
   * in-memory, so every reload starts a fresh session). A reload here silently
   * fails the router guard and redirects to `/`, whose landing-page preview
   * canvas also satisfies `.map-container[data-map-ready]` — so every caller
   * of this function was actually driving the *landing page's* canvas, not
   * the world map, without a single assertion failing to say so.
   *
   * docs/design/zoom-transition.md: world and settlement mode share one
   * persistent renderer (MapView.vue), so `data-map-ready` alone no longer
   * distinguishes "the world map is up" from "the settlement view never went
   * away" — waiting for the URL first is what actually confirms the mode
   * switch happened.
   */
  static async enter(page: Page): Promise<WorldMapPage> {
    await page.evaluate(() => {
      window.location.hash = 'world';
    });
    await page.waitForURL(/\/settlement#world(&.*)?$/);
    await waitForMapReady(page);
    return new WorldMapPage(page);
  }

  /** The canvas's on-screen box. Cached — it fills the viewport and never moves. */
  async box(): Promise<{ x: number; y: number; width: number; height: number }> {
    this.boxCache ??= (await this.canvas.boundingBox())!;
    return this.boxCache;
  }

  /** Canvas centre, in page coordinates — where an island reliably sits at the default zoom. */
  async centre(): Promise<ScreenPoint> {
    const box = await this.box();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A point offset from the canvas's top-left, in page coordinates. */
  async pointAt(dx: number, dy: number): Promise<ScreenPoint> {
    const box = await this.box();
    return { x: box.x + dx, y: box.y + dy };
  }

  /**
   * A raw frame of the canvas, for `Buffer.compare` against a later one.
   *
   * Clipped to the canvas's own box rather than taken off the canvas
   * locator — see `captureCanvas`, which is where the (large, frame-rate
   * bound) difference between those two spellings is written down.
   */
  async screenshot(): Promise<Buffer> {
    return captureCanvas(this.page, await this.box());
  }

  /** Moves the pointer to a page-coordinate point. */
  async moveTo(point: ScreenPoint, options?: { steps?: number }): Promise<void> {
    await this.page.mouse.move(point.x, point.y, options);
  }
}
