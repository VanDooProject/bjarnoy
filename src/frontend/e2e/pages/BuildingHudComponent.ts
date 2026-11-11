// See RingMenuComponent.ts for why `expect`-free page objects import from `@playwright/test`, not `../fixtures`.
import type { Locator, Page } from '@playwright/test';
import type { HexCoord } from './SettlementPage';

/** A building the demo settlement owns, as the model lists it. */
export interface OwnedBuilding extends HexCoord {
  type: string;
  level: number;
}

type HudWindow = {
  __demoWorld: () => {
    model: any;
    selectedSettlementId: string;
    hud: { queueFetchedAt: number; queue: unknown[]; construction: unknown; tick: number };
    syncHud: () => void;
  };
  __settlementRenderer: () => {
    cameraZoom: number;
  };
};

/** The building HUD of the settlement view (components/hud/BuildingHudLayer.vue): one marker per own building plus the toggle. */
export class BuildingHudComponent {
  /** Every building marker in the DOM (the dial-only markers of construction dials are `dialOnlyMarkers`). */
  readonly markers: Locator;
  /** Every dial-only marker: the construction dial of a hex no building marker shows (a new build, or any dial while building info is off). */
  readonly dialOnlyMarkers: Locator;
  /** The icon button at the map's top left (the H key does the same). */
  readonly toggle: Locator;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.markers = page.locator('.hud-marker[data-coord]');
    this.dialOnlyMarkers = page.locator('.hud-marker[data-dial-only]');
    this.toggle = page.getByRole('button', { name: 'Building info (H)' });
  }

  /** The marker over the building on this hex. */
  marker(hex: HexCoord): Locator {
    return this.page.locator(`.hud-marker[data-coord="${hex.q},${hex.r}"]`);
  }

  /** The dial-only marker of the construction dial on this hex (a zero-size anchor like every marker). */
  dialOnly(hex: HexCoord): Locator {
    return this.page.locator(`.hud-marker[data-dial-only="${hex.q},${hex.r}"]`);
  }

  /** The dial of a dial-only marker. */
  dialOnlyDial(hex: HexCoord): Locator {
    return this.dialOnly(hex).locator('.hud-marker__dial');
  }

  /** A marker's hex dial (the marker itself is a zero-size anchor, so it is never "visible" on its own). */
  dial(hex: HexCoord): Locator {
    return this.marker(hex).locator('.hud-marker__dial');
  }

  /** What is inside a marker's dial: the level or the countdown (absent at the far tier). */
  dialLabel(hex: HexCoord): Locator {
    return this.dial(hex).locator('text');
  }

  /** A marker's detail box (absent at the far and dial tiers). */
  box(hex: HexCoord): Locator {
    return this.marker(hex).locator('.hud-marker__box');
  }

  /** The buildings the settlement owns, from the model. */
  ownedBuildings(): Promise<OwnedBuilding[]> {
    return this.page.evaluate(() => {
      const world = (window as unknown as HudWindow).__demoWorld();
      return world.model.listBuildings(world.selectedSettlementId) as OwnedBuilding[];
    });
  }

  /** Stands a building of `type` on a hex, the way `SettlementPage.standBuildings` does, but on the hex you name. */
  async standBuildingAt(hex: HexCoord, type: string, level: number): Promise<void> {
    await this.page.evaluate(
      ({ at, buildingType, buildingLevel }) => {
        const world = (window as unknown as HudWindow).__demoWorld();
        const tile = world.model.getTile(at.q, at.r);
        tile.buildingType = buildingType;
        tile.buildingLevel = buildingLevel;
        world.syncHud();
      },
      { at: hex, buildingType: type, buildingLevel: level },
    );
  }

  /** A running upgrade of the building on `hex`, 500 s long (the queue entry the backend would send). */
  async startUpgrade(hex: HexCoord, type: string, targetLevel: number): Promise<void> {
    await this.page.evaluate(
      ({ at, building, target }) => {
        const world = (window as unknown as HudWindow).__demoWorld();
        world.hud.queueFetchedAt = Date.now();
        world.hud.queue = [
          {
            id: 'hud-upgrade',
            q: at.q,
            r: at.r,
            building,
            kind: 'build',
            targetLevel: target,
            state: 'building',
            slotCost: 1,
            completesAtGameTime: new Date(Date.now() + 500_000).toISOString(),
            completesInSeconds: 500,
            totalSeconds: 500,
          },
        ];
        world.hud.construction = { slots: 3, slotsUsed: 1, maxWaitingOrders: 3, waitingOrders: 0, maxOrdersPerHex: 1, towerLimit: 0, towersHeld: 0 };
        world.hud.tick += 1;
        world.syncHud();
      },
      { at: hex, building: type, target: targetLevel },
    );
  }

  /** The hexes ("q,r") that show a construction dial as a dial-only marker right now. */
  dialOnlyKeys(): Promise<string[]> {
    return this.dialOnlyMarkers.evaluateAll((els) => els.map((el) => el.getAttribute('data-dial-only') ?? ''));
  }

  /** The element the browser would hand a pointer event at this canvas point to (page coordinates). */
  async elementTagAt(point: { x: number; y: number }): Promise<string | undefined> {
    return this.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point);
  }

  /** The map camera's zoom. */
  cameraZoom(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as HudWindow).__settlementRenderer().cameraZoom);
  }
}
