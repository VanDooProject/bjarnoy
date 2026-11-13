import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { MAP_SPEC_TIMEOUT_MS } from '../budgets';
import {
  ArmyPanelComponent,
  HudBarComponent,
  MobileDispatchSheet,
  QueueDrawerComponent,
  SettlementPage,
  WorldMapPage,
} from '../pages';
import { loginTestUser } from '../helpers';
import { expectScreen, freezeClock } from './screen';

test.use({ mapLayers: { water: false, fog: false }, mapMotion: { hud: 'off' } });

const phoneOnly = (name: string) => name !== 'visual-phone';
const desktopOnly = (name: string) => name !== 'visual-desktop';

/**
 * Waits for what is drawn to be final and pins the clock: every finite animation done, then one more rendered map frame.
 * The clock is pinned only now, after the setup: a Date that never advances breaks the founding flow's own navigation
 * (the HUD's Settlement link then does a full page load and the demo state is gone).
 */
async function settle(page: Page): Promise<void> {
  await freezeClock(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState !== 'finished').length,
      ),
    )
    .toBe(0);
  await page.evaluate(() =>
    (window as unknown as { __settlementRenderer: () => { whenFrameRendered: () => Promise<void> } }).__settlementRenderer().whenFrameRendered(),
  );
}

/** Moves the pointer off every hex and control, so no hover state or tooltip is in the shot. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator('.hex-tooltip')).toHaveCount(0);
}

/** A found settlement with a stock that makes the resource bar and the ring's gates deterministic. */
async function foundWithStock(page: Page, stock = { wood: 400, stone: 250, food: 300, iron: 120 }): Promise<SettlementPage> {
  const settlement = await SettlementPage.found(page);
  await freezeClock(page);
  await settlement.setResources(stock);
  return settlement;
}

test('world-map', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await WorldMapPage.open(page);
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'world-map');
});

test('settlement', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  await expect(new HudBarComponent(page).resourceBar).toBeVisible();
  await settlement.zoomTo(1);
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'settlement');
});

test('ring-categories', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  await settlement.clickHex(await settlement.findHex({ terrain: 'grass' }));
  await settlement.ring.openBuildCategories();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'ring-categories');
});

test('ring-children', async ({ page }) => {
  // Resource holds the Reindeer Herder (waiting: the stock is empty) and buildings locked behind a higher longhouse level.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page, { wood: 0, stone: 0, food: 0, iron: 0 });
  await settlement.clickHex(await settlement.findHex({ terrain: 'grass' }));
  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Resource');
  await expect(settlement.ring.child('Reindeer Herder').first().locator('.ring-badge.waiting')).toHaveCount(1);
  await expect(settlement.ring.childBubbles.locator('.ring-badge.locked').first()).toBeVisible();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'ring-children');
});

test('ring-badge-ban', async ({ page }) => {
  // The longhouse cannot be razed: a disabled root action with the ban badge, its reason in the hint chip.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  await settlement.clickHex(await settlement.centreHex());
  const raze = settlement.ring.action('Raze').first();
  await expect(raze.locator('.ring-badge.ban')).toHaveCount(1);
  await settlement.ring.hover(raze);
  await expect(page.getByTestId('ring-hint')).toHaveText("Can't raze the longhouse");
  await settle(page);
  await expectScreen(page, 'ring-badge-ban');
});

test('ring-refusal', async ({ page }) => {
  // A race the ring cannot see: the hex is built on after the ring offered it, the model refuses, the chip says so.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  const target = await settlement.findHex({ terrain: 'grass' });
  await settlement.clickHex(target);
  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Resource');
  const herder = settlement.ring.child('Reindeer Herder').first();
  await settlement.ring.hover(herder);
  await page.evaluate((hex) => {
    const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } }).__demoWorld();
    world.model.placeBuilding(world.selectedSettlementId, hex, 'farm');
  }, target.hex);
  await settlement.ring.press();
  await expect(page.getByTestId('ring-error')).toHaveText('Could not queue that build.');
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'ring-refusal');
});

test('building-modal', async ({ page }) => {
  // A Town Square's ring offers Feasts, which closes the ring and opens the building's own window.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  await settlement.setSettlementLevel(3);
  await settlement.standBuildings([{ type: 'townsquare', level: 1 }]);
  const square = await settlement.findBuilding('townsquare');
  await settlement.clickHex(square);
  await settlement.ring.click(settlement.ring.action('Feasts').first());
  const modal = page.locator('.modal.panel');
  await expect(modal).toBeVisible();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'building-modal');
});

test('training-modal', async ({ page }) => {
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await foundWithStock(page);
  await settlement.setSettlementLevel(5);
  await settlement.standBuildings([{ type: 'barracks', level: 1 }]);
  const barracks = await settlement.findBuilding('barracks');
  await settlement.clickHex(barracks);
  await settlement.ring.click(settlement.ring.action('Train units').first());
  await expect(page.locator('.modal.panel')).toBeVisible();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'training-modal');
});

// The refused cancel and the failed poll are real failed requests, which the browser logs the way it does for a player.
const FAILED_REQUEST = /Failed to load resource/;

test.describe('queue drawer', () => {
  test.use({ expectedConsoleErrors: FAILED_REQUEST });
  test('queue-drawer', async ({ page }, testInfo) => {
    test.skip(phoneOnly(testInfo.project.name), 'phone-only surface');
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await foundWithStock(page);
    const drawer = new QueueDrawerComponent(page);
    await drawer.seed();
    await drawer.open();
    // The refused cancel is the failed item: demo mode has no backend to cancel against.
    await drawer.cancelButtons.first().click();
    await expect(drawer.error).toBeVisible();
    await settle(page);
    await parkPointer(page);
    await expectScreen(page, 'queue-drawer');
  });
});

test('army-panel', async ({ page }, testInfo) => {
  test.skip(desktopOnly(testInfo.project.name), 'desktop-only surface: phones dispatch through the sheet');
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await foundWithStock(page);
  const panel = new ArmyPanelComponent(page);
  await panel.seedArmy();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'army-panel');
});

for (const mission of ['attack', 'support'] as const) {
  test(`dispatch-${mission}`, async ({ page }, testInfo) => {
    test.skip(phoneOnly(testInfo.project.name), 'phone-only surface');
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await foundWithStock(page);
    const sheet = new MobileDispatchSheet(page);
    await sheet.openFromRing(settlement, await settlement.findHex());
    await (mission === 'attack' ? sheet.attackTab : sheet.supportTab).click();
    await expect(sheet.note).toBeVisible();
    await settle(page);
    await parkPointer(page);
    await expectScreen(page, `dispatch-${mission}`);
  });
}

test.describe('connection banner', () => {
  test.use({ expectedConsoleErrors: FAILED_REQUEST });
  test('connection-banner', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await loginTestUser(page);
    await foundWithStock(page);
    const hud = new HudBarComponent(page);
    await hud.failPoll();
    await expect(hud.connectionBanner).toBeVisible();
    await settle(page);
    await parkPointer(page);
    await expectScreen(page, 'connection-banner');
  });
});

test('onboarding-checklist', async ({ page }) => {
  // Right after landfall: the step-2 checklist, the landfall banner and the pointer to the next build.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.openLanding(page);
  await settlement.claimLandfall();
  await expect(settlement.checklist).toHaveAttribute('aria-label', 'Step 2 of 3');
  await expect(settlement.banner).toBeVisible();
  await expect(settlement.guidancePointer).toBeVisible();
  await settle(page);
  await parkPointer(page);
  await expectScreen(page, 'onboarding-checklist');
});
