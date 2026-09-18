import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HEAVY_MAP_SPEC_TIMEOUT_MS } from './budgets';
import { RingMenuComponent, WorldMapPage } from './pages';

/**
 * Clicking an unclaimed field on the world map previously did nothing useful
 * (MapView.onHexClick's world-mode branch navigated to /settlement no matter
 * which hex was clicked). It now opens the same ring menu settlement zoom
 * already uses, offering "Send troops here" (starts a move dispatch draft
 * pre-plotted with that hex) and "Land here"/"Send settlers" (hands the
 * coordinate to ExpansionPanel's founding form) — see the world map's own
 * onHexClick/rootActions comments.
 */

type EmptyTileWindow = Window & {
  __demoWorld: () => {
    model: any;
    selectedSettlementId: string;
    dispatchDraft: { route: { q: number; r: number }[]; mission: string } | null;
    foundDraftTarget: { q: number; r: number } | null;
  };
  __settlementRenderer: () => {
    hexCenterScreen: (c: { q: number; r: number }) => { x: number; y: number };
  };
};

/** An unclaimed land hex just outside the settlement's own claimed territory. */
async function findUnclaimedLandHex(page: Page): Promise<{ q: number; r: number }> {
  return page.evaluate(() => {
    const world = (window as unknown as EmptyTileWindow).__demoWorld();
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    const radius = world.model.borderRadius(settlement);
    const dirs: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (let d = radius + 1; d <= radius + 6; d++) {
      for (const [dq, dr] of dirs) {
        const at = { q: settlement.q + dq * d, r: settlement.r + dr * d };
        if (!world.model.isLand(at.q, at.r)) continue;
        if (world.model.getTile(at.q, at.r).ownerId) continue;
        return at;
      }
    }
    throw new Error('no unclaimed land hex found near the settlement — pick a different demo seed');
  });
}

test.describe('empty-field context menu on the world map', { tag: '@g3' }, () => {
  test('clicking an unclaimed tile opens a ring menu offering "Send troops here"', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const box = await world.box();
    const ring = new RingMenuComponent(page);

    const hex = await findUnclaimedLandHex(page);
    const screen = await page.evaluate(
      (at) => (window as unknown as EmptyTileWindow).__settlementRenderer().hexCenterScreen(at),
      hex,
    );
    await page.mouse.click(box.x + screen.x, box.y + screen.y);

    await ring.waitForOpen();
    await expect(ring.action('Send troops here')).toBeVisible();

    await ring.action('Send troops here').click();

    // Stayed on the world map, and the clicked hex became the dispatch
    // draft's destination waypoint — same store state ArmyPanel reads.
    await expect(page).toHaveURL(/\/world$/);
    const draft = await page.evaluate(() => (window as unknown as EmptyTileWindow).__demoWorld().dispatchDraft);
    expect(draft?.mission).toBe('move');
    expect(draft?.route).toEqual([hex]);
  });

  test('clicking an unclaimed tile\'s "Land here"/"Send settlers" action hands the coordinate to the founding form', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const box = await world.box();
    const ring = new RingMenuComponent(page);

    const hex = await findUnclaimedLandHex(page);
    const screen = await page.evaluate(
      (at) => (window as unknown as EmptyTileWindow).__settlementRenderer().hexCenterScreen(at),
      hex,
    );
    await page.mouse.click(box.x + screen.x, box.y + screen.y);
    await ring.waitForOpen();

    const foundAction = ring.bubbles.filter({ hasText: /Land here|Send settlers/ });
    await expect(foundAction).toBeVisible();
    await foundAction.click();

    // ExpansionPanel (which reads foundDraftTarget) only mounts in
    // settlement-zoom mode, so this action also switches views to it.
    await expect(page).toHaveURL(/\/settlement$/);
    const target = await page.evaluate(
      () => (window as unknown as EmptyTileWindow).__demoWorld().foundDraftTarget,
    );
    expect(target).toEqual(hex);
  });

  test('a click with a dispatch already in progress still just plots a waypoint (unchanged)', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const box = await world.box();
    const ring = new RingMenuComponent(page);

    const hex = await findUnclaimedLandHex(page);
    const screen = await page.evaluate(
      (at) => (window as unknown as EmptyTileWindow).__settlementRenderer().hexCenterScreen(at),
      hex,
    );

    await page.evaluate(() => {
      (window as unknown as { __demoWorld: () => { startDispatch: () => void } }).__demoWorld().startDispatch();
    });
    await page.mouse.click(box.x + screen.x, box.y + screen.y);

    // No ring menu — the click was captured as a waypoint instead.
    await expect(ring.bubbles).toHaveCount(0);
    const draft = await page.evaluate(() => (window as unknown as EmptyTileWindow).__demoWorld().dispatchDraft);
    expect(draft?.route).toEqual([hex]);
  });

  test('clicking the player\'s own settlement tile still navigates straight to /settlement', async ({ page }) => {
    test.setTimeout(HEAVY_MAP_SPEC_TIMEOUT_MS);
    const world = await WorldMapPage.open(page);
    const box = await world.box();

    const ownHex = await page.evaluate(() => {
      const w = (window as unknown as EmptyTileWindow).__demoWorld();
      const settlement = w.model.getSettlement(w.selectedSettlementId);
      return { q: settlement.q, r: settlement.r };
    });
    const screen = await page.evaluate(
      (at) => (window as unknown as EmptyTileWindow).__settlementRenderer().hexCenterScreen(at),
      ownHex,
    );
    await page.mouse.click(box.x + screen.x, box.y + screen.y);

    await expect(page).toHaveURL(/\/settlement$/);
  });
});
