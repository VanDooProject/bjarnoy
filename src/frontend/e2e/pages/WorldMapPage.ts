// See RingMenuComponent.ts for why `expect` is not imported from `../fixtures`.
import { type Locator, type Page } from '@playwright/test';
import { foundSettlement, gotoWorldMap } from '../helpers';
import type { ScreenPoint } from './SettlementPage';

/**
 * The world map view (`/world`), which mounts the same `HexMapRenderer` as
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
   * Founds a settlement (the `/world` route's own guard requires one — see
   * router/index.ts) and then opens the world map, waiting for its renderer.
   */
  static async open(page: Page): Promise<WorldMapPage> {
    await foundSettlement(page);
    await gotoWorldMap(page);
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

  /** A raw frame of the canvas, for `Buffer.compare` against a later one. */
  screenshot(): Promise<Buffer> {
    return this.canvas.screenshot();
  }

  /** Moves the pointer to a page-coordinate point. */
  async moveTo(point: ScreenPoint, options?: { steps?: number }): Promise<void> {
    await this.page.mouse.move(point.x, point.y, options);
  }
}
