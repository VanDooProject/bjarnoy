import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Sawmill is new (BuildingType.Sawmill) and, unlike every other building
 * added so far, ships three separate art families keyed off river
 * adjacency (flat/riverside/river-bend — see WorldModel.sawmillArtVariantOf
 * and textures.ts's SPLIT_BUILDING_BASE_LEVELED). Demo mode never calls
 * setRiverTiles, so a demo settlement's sawmill always resolves the flat
 * family — this exercises exactly that path end to end: pick "Sawmill"
 * from the ring menu's "Resource" category and place it, with the suite's
 * autouse `forbidConsoleErrors` fixture (see fixtures.ts) as the real
 * regression guard for the new baseIndexed/leveled-base texture wiring —
 * a bad texture key throws in baseTextureFor, which would fail this test
 * even though nothing here asserts on pixels.
 */
test('building a sawmill from the ring menu places it without a rendering error', async ({ page }) => {
  // Same budget reasoning as shrine-build.spec.ts's test.
  test.setTimeout(90_000);
  await foundSettlement(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  // Sawmill is RequiredLonghouseLevel 2 (BuildingCatalogue.cs's Producer:
  // 1 + ((level - 1) / 2) is overridden per-building — Sawmill/Barracks/
  // ArcheryRange/Dockyard all use 2 + ((level - 1) / 2) at level 1). Level
  // the longhouse up first, same approach shrine-build.spec.ts uses.
  await page.evaluate(() => {
    const world = (window as unknown as {
      __demoWorld: () => { model: any; selectedSettlementId: string; syncHud: () => void };
    }).__demoWorld();
    world.model.getSettlement(world.selectedSettlementId).level = 2;
    world.syncHud();
  });

  // Same approach as shrine-build.spec.ts's grass-hex search — Sawmill
  // lives in the "Resource" category alongside Farm/PumpkinFarm/FisherHut.
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
        if (tile.ownerId === world.selectedSettlementId && tile.terrain === 'grass' && !tile.buildingType) {
          return { screen: win.__settlementRenderer().hexCenterScreen(at), hex: at };
        }
      }
    }
    throw new Error('no empty buildable grass hex found inside the realm');
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

  const resourceCategory = page.locator('.ring-bubble:not(.back):not(.child)', { hasText: 'Resource' }).first();
  await expect(resourceCategory).toBeVisible();
  const categoryBox = (await resourceCategory.boundingBox())!;
  await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
    steps: 6,
  });

  const sawmillBubble = page.locator('.ring-bubble.child', { hasText: 'Sawmill' }).first();
  await expect(sawmillBubble).toBeVisible();
  await expect(sawmillBubble).not.toHaveClass(/locked/);
  await sawmillBubble.click();

  await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);

  const builtType = await page.evaluate((at) => {
    const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
    return world.model.getTile(at.q, at.r).buildingType as string | undefined;
  }, target.hex);
  expect(builtType).toBe('sawmill');
});
