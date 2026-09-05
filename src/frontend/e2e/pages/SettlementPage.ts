// See RingMenuComponent.ts for why `expect` comes from here, not `../fixtures`.
import { type Locator, type Page } from '@playwright/test';
import { claimLandfall, foundSettlement, waitForMapReady } from '../helpers';
import { RingMenuComponent } from './RingMenuComponent';

export interface HexCoord {
  q: number;
  r: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A hex plus where the renderer's own camera math puts it on screen. */
export interface HexTarget {
  hex: HexCoord;
  screen: ScreenPoint;
}

/**
 * Which hex `findHex` should hand back. Owned-by-this-settlement and
 * building-free are implied — every caller wants both — so only the
 * distinguishing conditions are spelled out here.
 */
export interface HexQuery {
  /** Exact terrain, e.g. 'grass', 'forest', 'sand', 'sea'. */
  terrain?: string;
  /** Any terrain except this one, e.g. "anything but sea". */
  notTerrain?: string;
  /** Require `tile.isCoastalWater` — what actually offers the Water category. */
  coastalWater?: boolean;
  /**
   * Inject a straight river tile onto the chosen hex before returning it.
   * Demo mode never calls `setRiverTiles` on its own, so a spec that builds
   * something with a `RequiresRiverShape` (Sawmill) has to put the river
   * there first, the same way WorldModel.test.ts does.
   */
  withRiver?: boolean;
}

/**
 * The settlement view (and the landing page's onboarding step, which mounts
 * the same renderer and the same ring menu).
 *
 * The point of this class is rule 2 of `e2e/AGENTS.md`: no spec should
 * hand-derive a hex's pixel position from `canvas.boundingBox()` again. It
 * talks to the app's own test hooks instead — `window.__demoWorld()` for
 * model state and `window.__settlementRenderer().hexCenterScreen()` for the
 * screen point — which is what `findHex` used to be a copy-pasted
 * `page.evaluate` block for in ten places.
 *
 * The hooks are read through local `window as unknown as {...}` casts rather
 * than a `declare global`: several specs declare their own, mutually
 * inconsistent `Window` augmentations (`fog-drift.spec.ts` and
 * `water-shader.spec.ts` disagree about `__fogDebug`'s shape), and a global
 * one here would collide with them.
 */
export class SettlementPage {
  readonly canvas: Locator;
  /** The hovered-hex tooltip the renderer draws. */
  readonly tooltip: Locator;
  /** ArmyPanel's card, which floats above the canvas in the bottom-right. */
  readonly statusCard: Locator;
  readonly realmPanel: Locator;
  readonly ring: RingMenuComponent;

  private canvasBoxCache: { x: number; y: number; width: number; height: number } | null = null;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas');
    this.tooltip = page.locator('.hex-tooltip');
    this.statusCard = page.locator('.status-card');
    this.realmPanel = page.locator('.realm-panel');
    this.ring = new RingMenuComponent(page);
  }

  /** Founds a settlement via the shared helper and returns its view. */
  static async found(page: Page): Promise<SettlementPage> {
    await foundSettlement(page);
    return new SettlementPage(page);
  }

  /** Opens the landing page (the same renderer, pre-founding) and waits for it to mount. */
  static async openLanding(page: Page): Promise<SettlementPage> {
    await page.goto('/');
    await waitForMapReady(page);
    return new SettlementPage(page);
  }

  /** Clicks the deterministic starter plot and waits for the settlement to exist. */
  async claimLandfall(): Promise<void> {
    await claimLandfall(this.page);
  }

  /** The canvas's on-screen box. Cached — the canvas fills the viewport and never moves. */
  async canvasBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    this.canvasBoxCache ??= (await this.canvas.boundingBox())!;
    return this.canvasBoxCache;
  }

  /** Canvas centre, in page coordinates. */
  async canvasCentre(): Promise<ScreenPoint> {
    const box = await this.canvasBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * The first empty, owned hex inside the realm matching `query`, with the
   * screen point the renderer would draw it at. Throws (failing the test
   * with the query that found nothing) rather than returning null: a demo
   * seed with no such hex is a broken fixture, not a passing case.
   */
  findHex(query: HexQuery = {}): Promise<HexTarget> {
    return this.page.evaluate((q) => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const radius = world.model.borderRadius(settlement);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > radius) continue;
          const at = { q: settlement.q + dq, r: settlement.r + dr };
          const tile = world.model.getTile(at.q, at.r);
          if (tile.ownerId !== world.selectedSettlementId) continue;
          if (tile.buildingType) continue;
          if (q.terrain !== undefined && tile.terrain !== q.terrain) continue;
          if (q.notTerrain !== undefined && tile.terrain === q.notTerrain) continue;
          if (q.coastalWater && !tile.isCoastalWater) continue;
          if (q.withRiver) {
            world.model.setRiverTiles([
              { q: at.q, r: at.r, shape: 'straight', inDirections: [], outDirection: null },
            ]);
          }
          return { hex: at, screen: win.__settlementRenderer().hexCenterScreen(at) };
        }
      }
      throw new Error(
        `no empty, owned hex matching ${JSON.stringify(q)} found inside the realm — pick a different demo seed`,
      );
    }, query);
  }

  /** The longhouse's own hex, and where it is on screen. */
  centreHex(): Promise<HexTarget> {
    return this.page.evaluate(() => {
      const win = window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string };
        __settlementRenderer: () => { hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number } };
      };
      const world = win.__demoWorld();
      const settlement = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: settlement.q, r: settlement.r };
      return { hex: at, screen: win.__settlementRenderer().hexCenterScreen(at) };
    });
  }

  /** Clicks a hex found by `findHex`/`centreHex`, opening its ring menu. */
  async clickHex(target: HexTarget | ScreenPoint): Promise<void> {
    const screen = 'screen' in target ? target.screen : target;
    const box = await this.canvasBox();
    await this.page.mouse.click(box.x + screen.x, box.y + screen.y);
  }

  /** How many buildings this settlement has — the deterministic "did the build land" signal. */
  countBuildings(): Promise<number> {
    return this.page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
        .__demoWorld();
      return world.model.countBuildings(world.selectedSettlementId) as number;
    });
  }

  /** What is standing on a hex, if anything. */
  buildingTypeAt(hex: HexCoord): Promise<string | undefined> {
    return this.page.evaluate(
      (at) => {
        const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
        return world.model.getTile(at.q, at.r).buildingType as string | undefined;
      },
      hex,
    );
  }

  /** The longhouse tile's own building level (what an Upgrade actually moves). */
  longhouseBuildingLevel(): Promise<number> {
    return this.page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
        .__demoWorld();
      const s = world.model.getSettlement(world.selectedSettlementId);
      return world.model.getTile(s.q, s.r).buildingLevel as number;
    });
  }

  /**
   * Levels the settlement up, the way a player would have to before a
   * `RequiredLonghouseLevel` building unlocks — rather than weakening the
   * gate for the test.
   */
  async setSettlementLevel(level: number): Promise<void> {
    await this.page.evaluate((value) => {
      const world = (window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void };
      }).__demoWorld();
      world.model.getSettlement(world.selectedSettlementId).level = value;
      world.syncHud();
    }, level);
  }

  /** Sets the settlement's stock outright — for the affordability gates. */
  async setResources(resources: { wood: number; stone: number; food: number; iron: number }): Promise<void> {
    await this.page.evaluate((r) => {
      const world = (window as unknown as {
        __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void };
      }).__demoWorld();
      world.model.getSettlement(world.selectedSettlementId).resources = r;
      world.syncHud();
    }, resources);
  }

  /** The HUD's current resource read-out. */
  hudResources(): Promise<{ wood: number; iron: number }> {
    return this.page.evaluate(
      () =>
        (window as unknown as { __demoWorld: () => { hud: { resources: { wood: number; iron: number } } } })
          .__demoWorld().hud.resources,
    );
  }

  /** The cosmetic cart shipments a trade acceptance drops onto the world map (issue #46). */
  listCartShipments(): Promise<unknown[]> {
    return this.page.evaluate(() =>
      (window as unknown as { __demoWorld: () => { model: { listCartShipments: () => unknown[] } } })
        .__demoWorld().model.listCartShipments(),
    );
  }
}
