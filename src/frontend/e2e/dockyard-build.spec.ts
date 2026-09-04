import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';

/**
 * Issue: coastal-water tiles had no ring-menu build path at all — even the
 * long-standing FishingHut had no way to be placed through the UI. This
 * exercises the new "Water" category (SettlementView.vue's WATER_CATEGORY,
 * offered only on an owned coastal-water sea tile — see `categoriesFor`)
 * end to end: open the ring menu on a coastal-water hex, pick Water, build a
 * Dockyard, and confirm it lands with the right buildingType. Also proves
 * WorldModel.placeBuilding's widened `seaOk` (fishinghut OR dockyard, still
 * gated to `isCoastalWater`) actually lets a Dockyard through.
 */
test('building a dockyard from the ring menu on coastal water places it', async ({ page }) => {
  // Same budget reasoning as shrine-build.spec.ts's test.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  await foundSettlement(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  // Dockyard is RequiredLonghouseLevel 2 (BuildingCatalogue.cs:
  // 2 + ((level - 1) / 2) at level 1) — level the longhouse up first, same
  // approach shrine-build.spec.ts uses for the shrine's own gate.
  await page.evaluate(() => {
    const world = (window as unknown as {
      __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void };
    }).__demoWorld();
    world.model.getSettlement(world.selectedSettlementId).level = 2;
    world.syncHud();
  });

  // Find a real owned coastal-water hex within the settlement's claim radius
  // — same approach as shrine-build.spec.ts's grass-hex search, but for
  // terrain 'sea' with isCoastalWater set, which is what actually offers the
  // Water category.
  const target = await page.evaluate(() => {
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
        if (
          tile.ownerId === world.selectedSettlementId &&
          tile.terrain === 'sea' &&
          tile.isCoastalWater &&
          !tile.buildingType
        ) {
          return { screen: win.__settlementRenderer().hexCenterScreen(at), hex: at };
        }
      }
    }
    throw new Error('no empty, owned coastal-water hex found inside the realm');
  });

  const countBuildings = () =>
    page.evaluate(() => {
      const world = (window as unknown as { __demoWorld: () => { model: any; selectedSettlementId: string } })
        .__demoWorld();
      return world.model.countBuildings(world.selectedSettlementId) as number;
    });
  const before = await countBuildings();

  await page.mouse.click(box.x + target.screen.x, box.y + target.screen.y);

  const buildBubble = page.locator('.ring-bubble', { hasText: 'Build' }).first();
  await expect(buildBubble).toBeVisible();
  const buildBox = (await buildBubble.boundingBox())!;
  await page.mouse.move(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2, { steps: 6 });

  const waterCategory = page.locator('.ring-bubble:not(.back):not(.child)', { hasText: 'Water' }).first();
  await expect(waterCategory).toBeVisible();
  const categoryBox = (await waterCategory.boundingBox())!;
  await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
    steps: 6,
  });

  const dockyardBubble = page.locator('.ring-bubble.child', { hasText: 'Dockyard' }).first();
  await expect(dockyardBubble).toBeVisible();
  await expect(dockyardBubble).not.toHaveClass(/locked/);
  await dockyardBubble.click();

  await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);

  const builtType = await page.evaluate((at) => {
    const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
    return world.model.getTile(at.q, at.r).buildingType as string | undefined;
  }, target.hex);
  expect(builtType).toBe('dockyard');
});
