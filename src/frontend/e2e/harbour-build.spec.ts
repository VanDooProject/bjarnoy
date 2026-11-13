import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

/**
 * Issue: coastal-water tiles had no ring-menu build path at all — even the
 * long-standing FishingHut had no way to be placed through the UI. This
 * exercises the new "Water" category (SettlementView.vue's WATER_CATEGORY,
 * offered only on an owned coastal-water sea tile — see `categoriesFor`)
 * end to end: open the ring menu on a coastal-water hex, pick Water, build a
 * Harbour, and confirm it lands with the right buildingType. Also proves
 * WorldModel.placeBuilding's widened `seaOk` (fishinghut OR harbour, still
 * gated to `isCoastalWater`) actually lets a Harbour through.
 */
test('building a harbour from the ring menu on coastal water places it', async ({ page }) => {
  // Same budget reasoning as shrine-build.spec.ts's test.
  test.setTimeout(MAP_SPEC_TIMEOUT_MS);
  const settlement = await SettlementPage.found(page);

  // Harbour unlocks at longhouse 8 (BuildingCatalogue.cs UnlockLevels,
  // docs/design/economy.md's ladder) — level the longhouse up first, same
  // approach shrine-build.spec.ts uses for the shrine's own gate.
  await settlement.setSettlementLevel(8);
  // ...and stand its prerequisite, a level-5 fishing hut (BuildingCatalogue.cs Prerequisites).
  await settlement.standBuildings([{ type: 'fishinghut', level: 5 }]);
  // Late buildings cost more than a fresh settlement can hold: fund it (and its storage) so the bubble is affordable.
  await settlement.fund(10_000_000);

  // Find a real owned coastal-water hex within the settlement's claim radius
  // — same approach as shrine-build.spec.ts's grass-hex search, but for
  // terrain 'sea' with isCoastalWater set, which is what actually offers the
  // Water category.
  // The start position keeps two hexes from the sea, so the realm only reaches the shore once a tower pushes it there.
  const reach = await settlement.standTowerTowardCoast();
  const target = await settlement.findHex({ terrain: 'sea', coastalWater: true, reach });

  const before = await settlement.countBuildings();

  await settlement.clickHex(target);

  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Water');

  const harbourBubble = settlement.ring.child('Harbour').first();
  await expect(harbourBubble).toBeVisible();
  await expect(harbourBubble).not.toHaveClass(/locked/);
  await harbourBubble.click();

  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);

  expect(await settlement.buildingTypeAt(target.hex)).toBe('harbour');
});
