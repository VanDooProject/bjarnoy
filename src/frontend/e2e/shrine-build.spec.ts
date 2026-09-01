import { expect, test } from './fixtures';
import { foundSettlement } from './helpers';

/**
 * Issue #53: shrines are new BuildingTypes with no dedicated art in the
 * pack yet — textures.ts/BuildingModal.vue reuse the hut sprite as a
 * placeholder (WorldModel.RENDERABLE_TYPES gates which types even reach the
 * texture lookup, so a mistake there is a hard crash, not a missing icon).
 * This exercises the exact path that risk sits on: selecting "Shrine of
 * Thor" from the ring menu's new "Shrines" category and placing it, with
 * the suite's autouse `forbidConsoleErrors` fixture (see fixtures.ts) as
 * the actual regression guard — a bad texture key throws in
 * `baseTextureFor`, which would fail this test even though nothing here
 * asserts on pixels.
 */
test('building a shrine from the ring menu places it without a rendering error', async ({ page }) => {
  // Same reasoning as settlement-interactions.spec.ts's building-placement
  // test: foundSettlement() plus driving a real click through the render
  // runs close to (and on CI, over) the global 45s budget.
  test.setTimeout(90_000);
  await foundSettlement(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;

  // Same approach as settlement-interactions.spec.ts's build test: ask the
  // model for a real empty, owned, grass hex (grass is what carries the new
  // "Shrines" category — see BUILD_CATEGORIES in SettlementView.vue) rather
  // than guess a pixel offset that only happens to land on one at whatever
  // zoom/camera framing this run's settlement got.
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

  const shrineCategory = page.locator('.ring-bubble', { hasText: 'Shrines' }).first();
  await expect(shrineCategory).toBeVisible();
  const categoryBox = (await shrineCategory.boundingBox())!;
  await page.mouse.move(categoryBox.x + categoryBox.width / 2, categoryBox.y + categoryBox.height / 2, {
    steps: 6,
  });

  const shrineBubble = page.locator('.ring-bubble', { hasText: 'Shrine of Thor' }).first();
  await expect(shrineBubble).toBeVisible();
  await shrineBubble.click();

  await expect.poll(countBuildings, { timeout: 5_000 }).toBeGreaterThan(before);

  // The placed shrine's tile now renders with the hut placeholder rather
  // than nothing — a real texture was resolved, not an empty/broken tile.
  const builtType = await page.evaluate((at) => {
    const world = (window as unknown as { __demoWorld: () => { model: any } }).__demoWorld();
    return world.model.getTile(at.q, at.r).buildingType as string | undefined;
  }, target.hex);
  expect(builtType).toBe('shrineofthor');
});
