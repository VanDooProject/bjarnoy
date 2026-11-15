import { expect, type Locator, type Page } from '@playwright/test';
import type { HexTarget, SettlementPage } from './SettlementPage';

type ArmyWorld = {
  hud: { garrison: unknown[]; garrisonSpots: unknown[]; tick: number };
  selectedSettlementId: string;
  model: { getSettlement: (id: string) => { q: number; r: number } };
};

/** Gives the demo settlement a garrison of ten spearmen in its longhouse, the way the backend lists one. */
async function seedGarrison(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = (window as unknown as { __demoWorld: () => ArmyWorld }).__demoWorld();
    world.hud.garrison = [{ unit: 'spearman', count: 10 }];
    const home = world.model.getSettlement(world.selectedSettlementId);
    world.hud.garrisonSpots = [
      { kind: 'longhouse', q: home.q, r: home.r, stacks: [{ unit: 'spearman', count: 10 }], guests: [], holdsLand: true, holdsShips: false },
    ];
    world.hud.tick += 1;
  });
}

/** The desktop army card (ArmyPanel.vue). Phones have none: they dispatch through `MobileDispatchSheet`. */
export class ArmyPanelComponent {
  readonly panel: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.getByTestId('army-panel');
  }

  /** Seeds a garrison and one army on the road (the shape the backend lists, nearly arrived) and waits for the card to show it. */
  async seedArmy(): Promise<void> {
    await seedGarrison(this.page);
    await this.page.evaluate(() => {
      const world = (window as unknown as {
        __demoWorld: () => ArmyWorld & { armies: unknown[] };
      }).__demoWorld();
      const home = world.model.getSettlement(world.selectedSettlementId);
      const at = { q: home.q + 5, r: home.r - 2 };
      world.armies = [
        {
          id: 'army-1',
          settlementId: world.selectedSettlementId,
          mission: 'move',
          targetSettlementId: null,
          atHome: false,
          supporting: false,
          position: at,
          provisions: 10,
          totalSpeed: 4,
          totalUpkeepPerHour: 2,
          stacks: [{ unit: 'spearman', count: 10 }],
          movement: {
            departedAt: new Date(Date.now() - 3_540_000).toISOString(),
            path: [{ q: home.q, r: home.r }, at],
            cumulativeHours: [0, 1],
            edgeHours: [0, 0.5],
            arrivesAt: new Date(Date.now() + 60_000).toISOString(),
            returnPath: [],
            returnCumulativeHours: [],
            returnEdgeHours: [],
            turnAroundAt: new Date(Date.now() + 60_000).toISOString(),
            returnArrivesAt: new Date(Date.now() + 7_200_000).toISOString(),
            isReturning: false,
          },
        },
      ];
      world.hud.tick += 1;
    });
    await expect(this.panel).toContainText('Spearman');
  }
}

/** The phone's dispatch sheet (MobileDispatchSheet.vue) with its Move / Attack / Support tabs. */
export class MobileDispatchSheet {
  readonly sheet: Locator;
  readonly moveTab: Locator;
  readonly attackTab: Locator;
  readonly supportTab: Locator;
  /** The note demo mode shows: dispatching needs the live backend. */
  readonly note: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.sheet = page.locator('.dispatch-sheet');
    this.moveTab = this.sheet.locator('.mission-tab').first();
    this.attackTab = this.sheet.locator('.mission-tab.attack');
    this.supportTab = this.sheet.locator('.mission-tab.support');
    this.note = this.sheet.locator('.demo-note');
  }

  /** Seeds a garrison, taps "Send army here" on `hex` and picks the longhouse garrison as the source. */
  async openFromRing(settlement: SettlementPage, hex: HexTarget): Promise<void> {
    await seedGarrison(this.page);
    await settlement.clickHex(hex);
    await settlement.ring.click(settlement.ring.action('Send army here').first());
    await this.page.locator('.send-picker [data-source^="home:"] .send-row-head').click();
    await expect(this.sheet).toBeVisible();
    await expect
      .poll(() => this.sheet.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length))
      .toBe(0);
  }
}
