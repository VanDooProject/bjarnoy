import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

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
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.found(page);

  // Shrines are RequiredLonghouseLevel 3 (BuildingCatalogue.cs), and the ring
  // menu now reads that gate off the building catalogue and refuses to place
  // a locked building — so a fresh level-1 realm genuinely cannot build one.
  // Level the longhouse up first, which is what a player would have to do,
  // rather than weakening the gate for the test.
  await settlement.setSettlementLevel(3);

  // Same approach as settlement-interactions.spec.ts's build test: ask the
  // model for a real empty, owned, grass hex (grass is what carries the new
  // "Shrines" category — see BUILD_CATEGORIES in SettlementView.vue) rather
  // than guess a pixel offset that only happens to land on one at whatever
  // zoom/camera framing this run's settlement got.
  const target = await settlement.findHex({ terrain: 'grass' });

  const before = await settlement.countBuildings();

  await settlement.clickHex(target);

  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Shrines');

  const shrineBubble = settlement.ring.child('Shrine of Thor').first();
  await expect(shrineBubble).toBeVisible();
  // Unlocked at longhouse 3, so it is a normal buildable bubble, not the
  // dashed locked treatment.
  await expect(shrineBubble).not.toHaveClass(/locked/);
  await shrineBubble.click();

  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);

  // The placed shrine's tile now renders with the hut placeholder rather
  // than nothing — a real texture was resolved, not an empty/broken tile.
  expect(await settlement.buildingTypeAt(target.hex)).toBe('shrineofthor');
});
