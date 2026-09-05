import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { SettlementPage } from './pages';

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
  const settlement = await SettlementPage.found(page);

  // Dockyard is RequiredLonghouseLevel 2 (BuildingCatalogue.cs:
  // 2 + ((level - 1) / 2) at level 1) — level the longhouse up first, same
  // approach shrine-build.spec.ts uses for the shrine's own gate.
  await settlement.setSettlementLevel(2);

  // Find a real owned coastal-water hex within the settlement's claim radius
  // — same approach as shrine-build.spec.ts's grass-hex search, but for
  // terrain 'sea' with isCoastalWater set, which is what actually offers the
  // Water category.
  const target = await settlement.findHex({ terrain: 'sea', coastalWater: true });

  const before = await settlement.countBuildings();

  await settlement.clickHex(target);

  await settlement.ring.openBuildCategories();
  await settlement.ring.openCategory('Water');

  const dockyardBubble = settlement.ring.child('Dockyard').first();
  await expect(dockyardBubble).toBeVisible();
  await expect(dockyardBubble).not.toHaveClass(/locked/);
  await dockyardBubble.click();

  await expect.poll(() => settlement.countBuildings(), { timeout: 5_000 }).toBeGreaterThan(before);

  expect(await settlement.buildingTypeAt(target.hex)).toBe('dockyard');
});
