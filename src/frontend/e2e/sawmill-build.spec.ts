import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Sawmill is new (BuildingType.Sawmill) and is built directly on a river
 * tile — only a Straight or Bend shaped one has matching art
 * (BuildingDefinition.RequiresRiverShape; WorldModel.placeBuilding mirrors
 * it), replacing that tile's plain river art with a sawmill+river composite
 * (riverside/river-bend — see WorldModel.sawmillArtVariantOf and
 * textures.ts's SPLIT_BUILDING_BASE_LEVELED). Demo mode never calls
 * setRiverTiles on its own, so this test injects a straight river tile onto
 * the target hex itself — exercising the riverside family end to end: pick
 * "Sawmill" from the ring menu's "Resource" category and place it, with the
 * suite's autouse `forbidConsoleErrors` fixture (see fixtures.ts) as the real
 * regression guard for the new baseIndexed/leveled-base texture wiring — a
 * bad texture key throws in baseTextureFor, which would fail this test even
 * though nothing here asserts on pixels.
 */
test('building a sawmill from the ring menu places it without a rendering error', async ({ page }) => {
  // Same budget reasoning as shrine-build.spec.ts's test.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.found(page);

  // Sawmill is RequiredLonghouseLevel 10 (BuildingCatalogue.cs's Sawmill case
  // in TryGet overrides the Producer default — it is a late-game capstone of
  // the resource line, like the four shrines). The ring menu reads that gate
  // off the building catalogue and shows a locked bubble below it, so level
  // the longhouse up first, same approach shrine-build.spec.ts uses.
  await settlement.setSettlementLevel(10);

  // Same grass-hex search as shrine-build.spec.ts — Sawmill lives in the
  // "Resource" category alongside Farm/PumpkinFarm. Since it's built
  // directly on a river tile (RequiresRiverShape), `withRiver` also injects
  // a straight river tile onto the chosen hex via setRiverTiles, same as
  // WorldModel.test.ts does.
  const target = await settlement.findHex({ terrain: 'grass', withRiver: true });

  const before = await settlement.countBuildings();

  await settlement.clickHex(target);

  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Resource');

  const sawmillBubble = settlement.ring.child('Sawmill').first();
  await expect(sawmillBubble).toBeVisible();
  await expect(sawmillBubble).not.toHaveClass(/locked/);
  await sawmillBubble.click();

  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);

  expect(await settlement.buildingTypeAt(target.hex)).toBe('sawmill');
});
